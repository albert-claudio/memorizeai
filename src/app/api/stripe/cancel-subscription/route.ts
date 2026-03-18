import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseAdmin, type SupabaseClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/billing/stripe';
import { getBaseUrl } from '@/lib/url';

function normalizeOrigin(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getRequestOrigin(request: NextRequest): string | null {
  const originHeader = request.headers.get('origin');
  if (originHeader) {
    return normalizeOrigin(originHeader);
  }

  return normalizeOrigin(request.headers.get('referer'));
}

function getAllowedOrigins(request: NextRequest): Set<string> {
  return new Set(
    [
      request.nextUrl.origin,
      getBaseUrl(),
      'https://memoriza.app',
      'https://www.memoriza.app',
      'http://localhost:3000',
    ]
      .map((origin) => normalizeOrigin(origin ?? null))
      .filter((origin): origin is string => Boolean(origin))
  );
}

function toUnixMs(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value * 1000;
}

function getPeriodBounds(subscription: Stripe.Subscription): {
  periodStart: number | null;
  periodEnd: number | null;
} {
  const rootStart = toUnixMs(
    (subscription as unknown as { current_period_start?: number }).current_period_start
  );
  const rootEnd = toUnixMs(
    (subscription as unknown as { current_period_end?: number }).current_period_end
  );

  const firstItem = subscription.items?.data?.[0] as
    | (Stripe.SubscriptionItem & {
        current_period_start?: number;
        current_period_end?: number;
      })
    | undefined;

  const itemStart = toUnixMs(firstItem?.current_period_start);
  const itemEnd = toUnixMs(firstItem?.current_period_end);

  return {
    periodStart: rootStart ?? itemStart,
    periodEnd: rootEnd ?? itemEnd,
  };
}

function isCancellableStatus(status: Stripe.Subscription.Status): boolean {
  return !['canceled', 'incomplete_expired'].includes(status);
}

async function resolveStripeCustomerId(
  supabaseAdmin: SupabaseClient,
  userId: string
): Promise<string | null> {
  // Use admin client to bypass RLS — stripe_customer_id is not exposed via RLS policies
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) {
    console.warn('[Stripe Cancel Subscription] Unable to read profile stripe_customer_id:', profileError);
  }

  if (profile?.stripe_customer_id) {
    return profile.stripe_customer_id;
  }

  // Fallback: look for customer_id in subscriptions table (may have multiple rows)
  const { data: latestSubscription, error: subscriptionError } = await supabaseAdmin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subscriptionError) {
    console.warn('[Stripe Cancel Subscription] Unable to read active subscription row:', subscriptionError);
    return null;
  }

  return latestSubscription?.stripe_customer_id ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const allowedOrigins = getAllowedOrigins(request);
    const requestOrigin = getRequestOrigin(request);

    if (!requestOrigin || !allowedOrigins.has(requestOrigin)) {
      return NextResponse.json(
        { error: 'Origem nao autorizada' },
        { status: 403 }
      );
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Nao autorizado' },
        { status: 401 }
      );
    }

    const supabaseAdmin = createSupabaseAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const stripeCustomerId = await resolveStripeCustomerId(supabaseAdmin, user.id);
    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: 'Nenhuma assinatura ativa encontrada' },
        { status: 400 }
      );
    }

    const customerSubscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'all',
      limit: 10,
    });

    const activeSubscription = customerSubscriptions.data.find((subscription) =>
      isCancellableStatus(subscription.status)
    );

    if (!activeSubscription) {
      return NextResponse.json(
        { error: 'Nenhuma assinatura ativa encontrada' },
        { status: 400 }
      );
    }

    if (activeSubscription.cancel_at_period_end) {
      const existingBounds = getPeriodBounds(activeSubscription);
      return NextResponse.json({
        ok: true,
        alreadyScheduled: true,
        periodStart: existingBounds.periodStart,
        periodEnd: existingBounds.periodEnd,
      });
    }

    const updatedSubscription = await stripe.subscriptions.update(activeSubscription.id, {
      cancel_at_period_end: true,
    });

    const updatedBounds = getPeriodBounds(updatedSubscription);

    return NextResponse.json({
      ok: true,
      alreadyScheduled: false,
      periodStart: updatedBounds.periodStart,
      periodEnd: updatedBounds.periodEnd,
    });
  } catch (error) {
    console.error('[Stripe Cancel Subscription] Error:', error);
    return NextResponse.json(
      { error: 'Erro ao cancelar assinatura' },
      { status: 500 }
    );
  }
}

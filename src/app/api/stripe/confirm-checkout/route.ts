import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { stripe, getSubscriptionTier } from '@/lib/billing/stripe';
import type Stripe from 'stripe';

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

type PaidTier = 'pro' | 'enterprise';

function parseBody(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  return raw as Record<string, unknown>;
}

function toUnixMs(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value * 1000;
}

function getStripeId(
  value: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined
): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value) {
    return value.id ?? null;
  }
  return null;
}

function getPeriodBounds(
  subscription: Stripe.Subscription
): { periodStart: number | null; periodEnd: number | null } {
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

function buildSubscriptionRowId(stripeSubscriptionId: string): string {
  return `sub_${stripeSubscriptionId.slice(-24)}`;
}

function getTierFromPlanKey(planKey: string | null): PaidTier | null {
  if (!planKey) return null;
  if (planKey === 'pro_monthly') return 'pro';
  if (planKey === 'enterprise_monthly') return 'enterprise';
  return null;
}

function resolvePaidTier(priceId: string | null, planKey: string | null): PaidTier | null {
  const priceTier = getSubscriptionTier(priceId);
  if (priceTier === 'pro' || priceTier === 'enterprise') {
    return priceTier;
  }

  return getTierFromPlanKey(planKey);
}

export async function POST(request: NextRequest) {
  try {
    const body = parseBody(await request.json().catch(() => ({})));
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId é obrigatório' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 401 }
      );
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle();

    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });

    if (checkoutSession.mode !== 'subscription') {
      return NextResponse.json(
        { error: 'Sessão não é de assinatura' },
        { status: 400 }
      );
    }

    if (checkoutSession.status !== 'complete') {
      return NextResponse.json(
        { error: 'Checkout ainda não foi concluído' },
        { status: 409 }
      );
    }

    if (
      checkoutSession.payment_status !== 'paid' &&
      checkoutSession.payment_status !== 'no_payment_required'
    ) {
      return NextResponse.json(
        { error: 'Pagamento ainda não foi confirmado' },
        { status: 409 }
      );
    }

    const expandedSubscription = checkoutSession.subscription;
    const subscription = typeof expandedSubscription === 'string'
      ? await stripe.subscriptions.retrieve(expandedSubscription)
      : expandedSubscription;

    if (!subscription) {
      return NextResponse.json(
        { error: 'Assinatura não encontrada' },
        { status: 409 }
      );
    }

    const customerIdFromSession = getStripeId(
      checkoutSession.customer as string | Stripe.Customer | Stripe.DeletedCustomer | null
    );
    const customerIdFromSubscription = getStripeId(
      subscription.customer as string | Stripe.Customer | Stripe.DeletedCustomer | null
    );
    const customerId = customerIdFromSession ?? customerIdFromSubscription;

    if (!customerId) {
      return NextResponse.json(
        { error: 'Cliente Stripe ausente na sessão' },
        { status: 409 }
      );
    }

    const metadataUserId = checkoutSession.metadata?.user_id ?? subscription.metadata?.user_id ?? null;
    const storedCustomerId = profile?.stripe_customer_id ?? null;

    if (metadataUserId && metadataUserId !== user.id) {
      return NextResponse.json(
        { error: 'Sessão de checkout não pertence ao usuário autenticado' },
        { status: 403 }
      );
    }

    const matchesStoredCustomer = Boolean(storedCustomerId && storedCustomerId === customerId);
    if (!metadataUserId && !matchesStoredCustomer) {
      return NextResponse.json(
        { error: 'Não foi possível validar a propriedade da sessão' },
        { status: 403 }
      );
    }

    const priceId = subscription.items.data[0]?.price?.id || null;
    const planKey = checkoutSession.metadata?.plan_key ?? subscription.metadata?.plan_key ?? null;
    const tier = resolvePaidTier(priceId, planKey);

    if (!tier) {
      return NextResponse.json(
        { error: 'Plano pago não reconhecido. Verifique mapeamento de preços Stripe.' },
        { status: 409 }
      );
    }

    const { periodStart, periodEnd } = getPeriodBounds(subscription as Stripe.Subscription);
    const now = Date.now();

    const isActiveOrGrace = subscription.status === 'active' || subscription.status === 'past_due';
    if (!isActiveOrGrace) {
      return NextResponse.json(
        { error: `Assinatura em estado não elegível para Pro: ${subscription.status}` },
        { status: 409 }
      );
    }

    const profilePayload: {
      id: string;
      is_pro: boolean;
      subscription_status: string;
      subscription_tier: PaidTier;
      stripe_customer_id: string;
      updated_at: number;
      subscription_period_end?: number;
    } = {
      id: user.id,
      is_pro: true,
      subscription_status: subscription.status,
      subscription_tier: tier,
      stripe_customer_id: customerId,
      updated_at: now,
    };

    if (periodEnd !== null) {
      profilePayload.subscription_period_end = periodEnd;
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(profilePayload, {
        onConflict: 'id',
      });

    if (profileError) {
      return NextResponse.json(
        { error: `Falha ao sincronizar perfil: ${profileError.message}` },
        { status: 500 }
      );
    }

    const subscriptionPayload: {
      id: string;
      user_id: string;
      stripe_subscription_id: string;
      stripe_customer_id: string;
      status: string;
      price_id: string | null;
      cancel_at_period_end: boolean;
      created_at: number;
      updated_at: number;
      current_period_start?: number;
      current_period_end?: number;
    } = {
      id: buildSubscriptionRowId(subscription.id),
      user_id: user.id,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: customerId,
      status: subscription.status,
      price_id: priceId,
      cancel_at_period_end: subscription.cancel_at_period_end,
      created_at: now,
      updated_at: now,
    };

    if (periodStart !== null) {
      subscriptionPayload.current_period_start = periodStart;
    }

    if (periodEnd !== null) {
      subscriptionPayload.current_period_end = periodEnd;
    }

    const { error: subscriptionError } = await supabaseAdmin
      .from('subscriptions')
      .upsert(subscriptionPayload, {
        onConflict: 'stripe_subscription_id',
      });

    if (subscriptionError) {
      return NextResponse.json(
        { error: `Falha ao sincronizar assinatura: ${subscriptionError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      tier,
      status: subscription.status,
      periodEnd,
      syncedFrom: 'checkout_session',
    });
  } catch (error) {
    console.error('[Stripe Confirm Checkout] Error:', error);
    return NextResponse.json(
      { error: 'Erro ao confirmar checkout' },
      { status: 500 }
    );
  }
}

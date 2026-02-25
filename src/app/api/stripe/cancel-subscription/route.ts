import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/billing/stripe';

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

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Nao autorizado' },
        { status: 401 }
      );
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'Nenhuma assinatura ativa encontrada' },
        { status: 400 }
      );
    }

    const customerSubscriptions = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
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

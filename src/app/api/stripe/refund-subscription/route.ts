import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseAdmin, type SupabaseClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/billing/stripe';
import { getAllowedRequestOrigins, getRequestOrigin } from '@/lib/security/request-origin';

const REFUND_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function toUnixMs(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return value * 1000;
}

function getStripeId(
  value:
    | string
    | Stripe.Customer
    | Stripe.DeletedCustomer
    | Stripe.PaymentIntent
    | Stripe.Charge
    | null
    | undefined
): string | null {
  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object' && 'id' in value) {
    return value.id ?? null;
  }

  return null;
}

function isRefundableSubscriptionStatus(status: Stripe.Subscription.Status): boolean {
  return !['canceled', 'incomplete_expired'].includes(status);
}

function getSubscriptionRowId(stripeSubscriptionId: string): string {
  return `sub_${stripeSubscriptionId.slice(-24)}`;
}

function getRefundTarget(invoice: Stripe.Invoice): {
  payment_intent?: string;
  charge?: string;
} | null {
  const invoicePayments = invoice.payments?.data ?? [];
  const paidInvoicePayment = invoicePayments.find((payment) => (
    payment.status === 'paid' || payment.is_default
  )) ?? invoicePayments[0];
  const invoicePaymentIntentId = getStripeId(
    paidInvoicePayment?.payment?.payment_intent ?? null
  );
  if (invoicePaymentIntentId) {
    return { payment_intent: invoicePaymentIntentId };
  }
  const invoicePaymentChargeId = getStripeId(
    paidInvoicePayment?.payment?.charge ?? null
  );
  if (invoicePaymentChargeId) {
    return { charge: invoicePaymentChargeId };
  }

  const invoiceWithPaymentIntent = invoice as Stripe.Invoice & {
    payment_intent?: string | Stripe.PaymentIntent | null;
  };
  const paymentIntentId = getStripeId(
    invoiceWithPaymentIntent.payment_intent ?? null
  );
  if (paymentIntentId) {
    return { payment_intent: paymentIntentId };
  }

  const legacyInvoice = invoice as Stripe.Invoice & {
    charge?: string | Stripe.Charge | null;
  };
  const chargeId = getStripeId(legacyInvoice.charge ?? null);

  return chargeId ? { charge: chargeId } : null;
}

async function resolveStripeCustomerId(
  supabaseAdmin: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .single();

  if (profileError) {
    console.warn('[Stripe Refund Subscription] Unable to read profile stripe_customer_id:', profileError);
  }

  if (profile?.stripe_customer_id) {
    return profile.stripe_customer_id;
  }

  const { data: latestSubscription, error: subscriptionError } = await supabaseAdmin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .single();

  if (subscriptionError) {
    console.warn('[Stripe Refund Subscription] Unable to read subscriptions fallback:', subscriptionError);
    return null;
  }

  return latestSubscription?.stripe_customer_id ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const allowedOrigins = getAllowedRequestOrigins(request);
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
        { error: 'Nenhuma assinatura encontrada para reembolso' },
        { status: 400 }
      );
    }

    const customerSubscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'all',
      limit: 10,
    });

    const activeSubscription = customerSubscriptions.data.find((subscription) =>
      isRefundableSubscriptionStatus(subscription.status)
    );

    if (!activeSubscription) {
      return NextResponse.json(
        { error: 'Nenhuma assinatura elegivel para reembolso encontrada' },
        { status: 400 }
      );
    }

    const invoiceList = await stripe.invoices.list({
      customer: stripeCustomerId,
      subscription: activeSubscription.id,
      limit: 10,
      expand: ['data.payments'],
    });

    const latestPaidInvoice = invoiceList.data.find((invoice) => (
      invoice.status === 'paid' &&
      typeof invoice.amount_paid === 'number' &&
      invoice.amount_paid > 0
    ));

    if (!latestPaidInvoice) {
      return NextResponse.json(
        { error: 'Nenhum pagamento elegivel para reembolso foi encontrado' },
        { status: 400 }
      );
    }

    const invoiceCreatedAt = toUnixMs(latestPaidInvoice.created);
    if (!invoiceCreatedAt) {
      return NextResponse.json(
        { error: 'Nao foi possivel validar a data do pagamento' },
        { status: 500 }
      );
    }

    const refundDeadline = invoiceCreatedAt + REFUND_WINDOW_MS;
    if (Date.now() > refundDeadline) {
      return NextResponse.json(
        {
          error: 'A janela de reembolso de 7 dias ja expirou para esta cobranca',
          refundDeadline,
        },
        { status: 403 }
      );
    }

    const refundTarget = getRefundTarget(latestPaidInvoice);
    if (!refundTarget) {
      return NextResponse.json(
        { error: 'Nao foi possivel localizar o pagamento no Stripe para estorno' },
        { status: 500 }
      );
    }

    const refund = await stripe.refunds.create(
      {
        ...refundTarget,
        amount: latestPaidInvoice.amount_paid,
        reason: 'requested_by_customer',
        metadata: {
          user_id: user.id,
          subscription_id: activeSubscription.id,
          invoice_id: latestPaidInvoice.id,
          source: 'self_service_refund',
        },
      },
      {
        idempotencyKey: `refund:${user.id}:${latestPaidInvoice.id}`,
      }
    );

    if (activeSubscription.status !== 'canceled') {
      await stripe.subscriptions.cancel(activeSubscription.id);
    }

    const now = Date.now();
    const updatedPriceId = activeSubscription.items.data[0]?.price?.id ?? null;
    const subscriptionWithPeriod = activeSubscription as Stripe.Subscription & {
      current_period_start?: number;
    };

    await supabaseAdmin
      .from('profiles')
      .update({
        is_pro: false,
        subscription_status: 'canceled',
        subscription_tier: 'free',
        subscription_period_end: now,
        stripe_customer_id: stripeCustomerId,
        updated_at: now,
      })
      .eq('id', user.id);

    await supabaseAdmin
      .from('subscriptions')
      .upsert({
        id: getSubscriptionRowId(activeSubscription.id),
        user_id: user.id,
        stripe_subscription_id: activeSubscription.id,
        stripe_customer_id: stripeCustomerId,
        price_id: updatedPriceId,
        status: 'canceled',
        current_period_start: toUnixMs(subscriptionWithPeriod.current_period_start) ?? invoiceCreatedAt,
        current_period_end: now,
        cancel_at_period_end: false,
        created_at: now,
        updated_at: now,
      }, {
        onConflict: 'stripe_subscription_id',
      });

    return NextResponse.json({
      ok: true,
      refundId: refund.id,
      refundedAt: toUnixMs(refund.created) ?? now,
      amountRefunded: refund.amount,
      currency: refund.currency,
      refundDeadline,
      subscriptionCanceledAt: now,
    });
  } catch (error) {
    console.error('[Stripe Refund Subscription] Error:', error);
    return NextResponse.json(
      { error: 'Erro ao processar reembolso automatico' },
      { status: 500 }
    );
  }
}

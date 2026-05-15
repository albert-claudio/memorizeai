import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { hasProAccess } from '@/lib/billing/pro-access';
import { getEffectiveProAccess } from '@/lib/billing/effective-pro-access';
import { activateBetaInviteForUser, hasActiveBetaAccess } from '@/lib/beta/invites';
import { stripe } from '@/lib/billing/stripe';
import { createClient as createSupabaseAdmin, type SupabaseClient } from '@supabase/supabase-js';

const REFUND_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function toUnixMs(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return value * 1000;
}

function isRefundableSubscriptionStatus(status: Stripe.Subscription.Status): boolean {
  return !['canceled', 'incomplete_expired'].includes(status);
}

async function resolveStripeCustomerId(
  supabaseAdmin: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) {
    console.warn('[Subscription Status] Unable to read profile stripe_customer_id:', profileError);
  }

  if (profile?.stripe_customer_id) {
    return profile.stripe_customer_id;
  }

  const { data: latestSubscription, error: subscriptionError } = await supabaseAdmin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subscriptionError) {
    console.warn('[Subscription Status] Unable to read subscriptions fallback:', subscriptionError);
    return null;
  }

  const fallbackCustomerId = latestSubscription?.stripe_customer_id ?? null;
  if (fallbackCustomerId?.startsWith('beta_')) {
    return null;
  }

  return fallbackCustomerId;
}

export async function GET() {
  try {
    // ================================================================
    // 1. AUTHENTICATE USER
    // ================================================================
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 401 }
      );
    }

    // ================================================================
    // 2. GET SUBSCRIPTION STATUS FROM PROFILE
    // ================================================================
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_pro, subscription_status, subscription_tier, subscription_period_end, admin_override_pro')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({
        isPro: false,
        status: 'free',
        tier: 'free',
        periodEnd: null,
        periodStart: null,
        cancelAtPeriodEnd: false,
        isActive: false,
        isBeta: false,
        refundEligibleUntil: null,
        refundEligible: false,
      });
    }

    const { data: subscriptionRow, error: subscriptionRowError } = await supabase
      .from('subscriptions')
      .select('status, cancel_at_period_end, current_period_start, current_period_end')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subscriptionRowError) {
      console.warn('[Subscription Status] Unable to read subscriptions row:', subscriptionRowError);
    }

    const periodStart = subscriptionRow?.current_period_start ?? null;
    const periodEnd = profile.subscription_period_end
      || subscriptionRow?.current_period_end
      || null;
    const status = profile.subscription_status
      || subscriptionRow?.status
      || 'free';
    const cancelAtPeriodEnd = Boolean(subscriptionRow?.cancel_at_period_end);

    let refundEligibleUntil: number | null = null;
    let refundEligible = false;
    let betaAccess = false;
    let effectiveAccess: boolean | null = null;

    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const supabaseAdmin = createSupabaseAdmin(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY,
        );

        effectiveAccess = await getEffectiveProAccess(supabaseAdmin, user.id);
        betaAccess = await hasActiveBetaAccess({ admin: supabaseAdmin, userId: user.id, email: user.email });
        if (betaAccess && user.email) {
          await activateBetaInviteForUser({
            admin: supabaseAdmin,
            userId: user.id,
            email: user.email,
          });
          effectiveAccess = true;
        }

        const stripeCustomerId = await resolveStripeCustomerId(supabaseAdmin, user.id);
        if (stripeCustomerId) {
          const customerSubscriptions = await stripe.subscriptions.list({
            customer: stripeCustomerId,
            status: 'all',
            limit: 10,
          });

          const activeSubscription = customerSubscriptions.data.find((subscription) =>
            isRefundableSubscriptionStatus(subscription.status)
          );

          if (activeSubscription) {
            const invoiceList = await stripe.invoices.list({
              customer: stripeCustomerId,
              subscription: activeSubscription.id,
              limit: 10,
            });

            const latestPaidInvoice = invoiceList.data.find((invoice) => (
              invoice.status === 'paid' &&
              typeof invoice.amount_paid === 'number' &&
              invoice.amount_paid > 0
            ));

            const invoiceCreatedAt = toUnixMs(latestPaidInvoice?.created);
            if (invoiceCreatedAt) {
              refundEligibleUntil = invoiceCreatedAt + REFUND_WINDOW_MS;
              refundEligible = Date.now() <= refundEligibleUntil;
            }
          }
        }
      } catch (refundInfoError) {
        console.warn('[Subscription Status] Unable to compute refund eligibility:', refundInfoError);
      }
    }

    // ================================================================
    // 3. CALCULATE IF SUBSCRIPTION IS ACTIVE
    // ================================================================
    const isActive = betaAccess || (effectiveAccess ?? hasProAccess({
      ...profile,
      subscription_status: status,
      subscription_period_end: periodEnd,
      cancel_at_period_end: cancelAtPeriodEnd,
    }));
    const responseStatus = betaAccess
      ? 'beta'
      : isActive
      ? status
      : status === 'active' || status === 'past_due'
        ? 'free'
        : status;
    const responseTier = betaAccess ? 'pro' : isActive ? (profile.subscription_tier || 'free') : 'free';

    // ================================================================
    // 4. RETURN SUBSCRIPTION STATUS
    // ================================================================
    return NextResponse.json({
      isPro: isActive,
      status: responseStatus,
      tier: responseTier,
      periodStart,
      periodEnd,
      cancelAtPeriodEnd,
      isActive,
      isBeta: betaAccess,
      refundEligibleUntil,
      refundEligible,
    });

  } catch (error) {
    console.error('[Subscription Status] Error:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar status da assinatura' },
      { status: 500 }
    );
  }
}

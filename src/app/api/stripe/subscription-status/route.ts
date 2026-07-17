import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { hasProAccess } from '@/lib/billing/pro-access';
import { getEffectiveProAccess } from '@/lib/billing/effective-pro-access';
import {
  ensureFreeTrialForUser,
  hasActiveFreeTrialAccess,
  isInternalAccessSubscription,
  isLegacyBetaSubscription,
} from '@/lib/billing/free-trial';
import { getSubscriptionTier, stripe } from '@/lib/billing/stripe';
import { createClient as createSupabaseAdmin, type SupabaseClient } from '@supabase/supabase-js';

const REFUND_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface SubscriptionRow {
  status?: string | null;
  cancel_at_period_end?: boolean | null;
  current_period_start?: number | null;
  current_period_end?: number | null;
  price_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_customer_id?: string | null;
}

function toUnixMs(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return value * 1000;
}

function isRefundableSubscriptionStatus(status: Stripe.Subscription.Status): boolean {
  return !['canceled', 'incomplete_expired'].includes(status);
}

function hasActiveInternalAccess(row: SubscriptionRow | null | undefined, nowMs = Date.now()): boolean {
  if (!row) {
    return false;
  }

  return ['active', 'past_due', 'trialing'].includes(row.status ?? '')
    && row.cancel_at_period_end !== true
    && typeof row.current_period_end === 'number'
    && row.current_period_end > nowMs;
}

function hasStripeBackedAccess(params: {
  profile: {
    is_pro?: boolean | null;
    admin_override_pro?: boolean | null;
    subscription_status?: string | null;
    subscription_period_end?: number | null;
  };
  subscriptionRow?: SubscriptionRow | null;
}): boolean {
  if (params.profile.admin_override_pro) {
    return true;
  }

  const subscriptionRow = params.subscriptionRow;
  if (!subscriptionRow || isInternalAccessSubscription(subscriptionRow)) {
    return false;
  }

  const tier = getSubscriptionTier(subscriptionRow.price_id ?? null);
  if (tier !== 'pro' && tier !== 'enterprise') {
    return false;
  }

  return hasProAccess({
    is_pro: params.profile.is_pro,
    subscription_status: subscriptionRow.status ?? params.profile.subscription_status,
    subscription_period_end:
      subscriptionRow.current_period_end ?? params.profile.subscription_period_end,
    cancel_at_period_end: subscriptionRow.cancel_at_period_end,
    admin_override_pro: params.profile.admin_override_pro,
  });
}

function resolveResponseTier(params: {
  isActive: boolean;
  trialAccess: boolean;
  profileTier?: string | null;
  subscriptionPriceId?: string | null;
}): string {
  if (!params.isActive) {
    return 'free';
  }

  if (params.trialAccess) {
    return 'pro';
  }

  if (params.profileTier && params.profileTier !== 'free') {
    return params.profileTier;
  }

  const tierFromPrice = getSubscriptionTier(params.subscriptionPriceId ?? null);
  return tierFromPrice === 'free' ? 'free' : tierFromPrice;
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

  const { data: latestSubscriptions, error: subscriptionError } = await supabaseAdmin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (subscriptionError) {
    console.warn('[Subscription Status] Unable to read subscriptions fallback:', subscriptionError);
    return null;
  }

  const latestBillableSubscription = ((latestSubscriptions ?? []) as SubscriptionRow[])
    .find((subscription) => !isInternalAccessSubscription(subscription));

  return latestBillableSubscription?.stripe_customer_id ?? null;
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
        isTrial: false,
        refundEligibleUntil: null,
        refundEligible: false,
      });
    }

    const { data: subscriptionRowsData, error: subscriptionRowError } = await supabase
      .from('subscriptions')
      .select('status, cancel_at_period_end, current_period_start, current_period_end, price_id, stripe_subscription_id, stripe_customer_id')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(20);

    if (subscriptionRowError) {
      console.warn('[Subscription Status] Unable to read subscriptions row:', subscriptionRowError);
    }

    const subscriptionRows = ((subscriptionRowsData ?? []) as SubscriptionRow[]);
    const latestSubscriptionRow = subscriptionRows[0] ?? null;
    const latestBillableSubscriptionRow = subscriptionRows
      .find((subscription) => !isInternalAccessSubscription(subscription)) ?? null;
    const latestInternalSubscriptionRow = subscriptionRows
      .find((subscription) => isInternalAccessSubscription(subscription)) ?? null;
    const displaySubscriptionRow = latestBillableSubscriptionRow
      ?? latestInternalSubscriptionRow
      ?? latestSubscriptionRow;

    let periodStart = displaySubscriptionRow?.current_period_start ?? null;
    let periodEnd = displaySubscriptionRow?.current_period_end
      || profile.subscription_period_end
      || null;
    let status = displaySubscriptionRow?.status
      || profile.subscription_status
      || 'free';
    const cancelAtPeriodEnd = Boolean(displaySubscriptionRow?.cancel_at_period_end);

    let refundEligibleUntil: number | null = null;
    let refundEligible = false;
    let trialAccess = false;
    let betaAccess = subscriptionRows.some((subscription) => (
      isLegacyBetaSubscription(subscription) && hasActiveInternalAccess(subscription)
    ));
    let effectiveAccess: boolean | null = null;

    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const supabaseAdmin = createSupabaseAdmin(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY,
        );

        const stripeBackedAccess = hasStripeBackedAccess({
          profile,
          subscriptionRow: latestBillableSubscriptionRow,
        });
        const hasBillableSubscriptionHistory = Boolean(latestBillableSubscriptionRow);

        if (stripeBackedAccess) {
          effectiveAccess = true;
          trialAccess = false;
          betaAccess = false;
        } else if (betaAccess) {
          effectiveAccess = true;
          trialAccess = false;
        } else if (!hasBillableSubscriptionHistory) {
          const trialResult = await ensureFreeTrialForUser({
            admin: supabaseAdmin,
            userId: user.id,
          });
          trialAccess = await hasActiveFreeTrialAccess({ admin: supabaseAdmin, userId: user.id });
          if (trialAccess) {
            effectiveAccess = true;
            status = 'trialing';
            periodStart = trialResult.periodStart ?? periodStart;
            periodEnd = trialResult.periodEnd ?? periodEnd;
          } else {
            effectiveAccess = await getEffectiveProAccess(supabaseAdmin, user.id);
          }
        } else {
          trialAccess = false;
          effectiveAccess = false;
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
    const isActive = trialAccess || (effectiveAccess ?? hasProAccess({
      ...profile,
      subscription_status: status,
      subscription_period_end: periodEnd,
      cancel_at_period_end: cancelAtPeriodEnd,
    }));
    const responseStatus = trialAccess
      ? 'trialing'
      : isActive
      ? status
      : status === 'active' || status === 'past_due' || status === 'trialing'
        ? 'free'
        : status;
    const responseTier = resolveResponseTier({
      isActive,
      trialAccess,
      profileTier: betaAccess && isActive ? 'pro' : profile.subscription_tier,
      subscriptionPriceId: latestBillableSubscriptionRow?.price_id,
    });
    const responsePeriodStart = responseStatus === 'free' ? null : periodStart;
    const responsePeriodEnd = responseStatus === 'free' ? null : periodEnd;

    // ================================================================
    // 4. RETURN SUBSCRIPTION STATUS
    // ================================================================
    return NextResponse.json({
      isPro: isActive,
      status: responseStatus,
      tier: responseTier,
      periodStart: responsePeriodStart,
      periodEnd: responsePeriodEnd,
      cancelAtPeriodEnd,
      isActive,
      isBeta: betaAccess && isActive && !trialAccess,
      isTrial: trialAccess,
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

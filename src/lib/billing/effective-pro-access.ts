import type { SupabaseClient } from '@supabase/supabase-js';
import { hasProAccess, type ProAccessProfile } from '@/lib/billing/pro-access';
import { hasActiveFreeTrialAccess, isInternalAccessSubscription } from '@/lib/billing/free-trial';

interface SubscriptionAccessRow {
  status?: string | null;
  cancel_at_period_end?: boolean | null;
  current_period_end?: number | null;
  price_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_customer_id?: string | null;
}

export async function getEffectiveProAccess(
  supabase: SupabaseClient,
  userId: string,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_pro, subscription_status, subscription_period_end, admin_override_pro')
    .eq('id', userId)
    .maybeSingle();

  try {
    if (await hasActiveFreeTrialAccess({ admin: supabase, userId, nowMs })) {
      return true;
    }
  } catch (error) {
    console.warn('[Effective Pro Access] Unable to check free trial access:', error);
  }

  if (!profile) return false;

  if (hasProAccess(profile as ProAccessProfile, nowMs)) {
    return true;
  }

  const { data: subscriptions } = await supabase
    .from('subscriptions')
    .select('status, cancel_at_period_end, current_period_end, price_id, stripe_subscription_id, stripe_customer_id')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(20);

  const latestSubscription = ((subscriptions ?? []) as SubscriptionAccessRow[])
    .find((subscription) => !isInternalAccessSubscription(subscription)) ?? null;
  if (!latestSubscription) return false;

  return hasProAccess({
    is_pro: (profile as ProAccessProfile).is_pro,
    subscription_status: latestSubscription.status ?? (profile as ProAccessProfile).subscription_status,
    subscription_period_end:
      latestSubscription.current_period_end ?? (profile as ProAccessProfile).subscription_period_end,
    cancel_at_period_end: latestSubscription.cancel_at_period_end,
    admin_override_pro: (profile as ProAccessProfile).admin_override_pro,
  }, nowMs);
}

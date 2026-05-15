import type { SupabaseClient } from '@supabase/supabase-js';
import { hasProAccess, type ProAccessProfile } from '@/lib/billing/pro-access';
import { hasActiveBetaAccess, isBetaSubscription } from '@/lib/beta/invites';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

interface SubscriptionAccessRow {
  status?: string | null;
  cancel_at_period_end?: boolean | null;
  current_period_end?: number | null;
  price_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_customer_id?: string | null;
}

async function checkBetaAccess(userId: string): Promise<boolean> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return false;
  }

  try {
    return await hasActiveBetaAccess({ admin: getSupabaseAdmin(), userId });
  } catch (error) {
    console.warn('[Effective Pro Access] Unable to check beta access:', error);
    return false;
  }
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

  const betaAccess = await checkBetaAccess(userId);
  if (betaAccess) return true;

  if (!profile) return false;

  const { data: subscriptions } = await supabase
    .from('subscriptions')
    .select('status, cancel_at_period_end, current_period_end, price_id, stripe_subscription_id, stripe_customer_id')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(20);

  const latestSubscription = ((subscriptions ?? []) as SubscriptionAccessRow[])
    .find((subscription) => !isBetaSubscription(subscription)) ?? null;
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

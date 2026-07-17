import type { SupabaseClient } from '@supabase/supabase-js';
import { hasProAccess, type ProAccessProfile } from '@/lib/billing/pro-access';

export const DEFAULT_FREE_TRIAL_DAYS = 30;
export const FREE_TRIAL_PRICE_ID = 'free_trial';
export const FREE_TRIAL_SUBSCRIPTION_PREFIX = 'free_trial_';
export const FREE_TRIAL_CUSTOMER_PREFIX = 'trial_';
const LEGACY_BETA_PRICE_IDS = new Set(['beta_trial', 'beta_access']);
const LEGACY_BETA_SUBSCRIPTION_PREFIXES = ['beta_trial_', 'beta_access_'];
const LEGACY_BETA_CUSTOMER_PREFIX = 'beta_';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface FreeTrialSubscriptionRow {
  status?: string | null;
  cancel_at_period_end?: boolean | null;
  current_period_start?: number | null;
  current_period_end?: number | null;
  price_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_customer_id?: string | null;
}

export function getFreeTrialDays(): number {
  const parsed = Number(process.env.FREE_TRIAL_DAYS ?? DEFAULT_FREE_TRIAL_DAYS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_FREE_TRIAL_DAYS;
}

export function freeTrialEndsAt(nowMs = Date.now()): number {
  return nowMs + getFreeTrialDays() * DAY_MS;
}

export function isFreeTrialSubscription(row: {
  price_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_customer_id?: string | null;
} | null | undefined): boolean {
  if (!row) return false;
  if (row.price_id === FREE_TRIAL_PRICE_ID) return true;
  if (row.stripe_subscription_id?.startsWith(FREE_TRIAL_SUBSCRIPTION_PREFIX)) return true;
  return Boolean(row.stripe_customer_id?.startsWith(FREE_TRIAL_CUSTOMER_PREFIX));
}

export function isLegacyBetaSubscription(row: {
  price_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_customer_id?: string | null;
} | null | undefined): boolean {
  if (!row) return false;
  if (row.price_id && LEGACY_BETA_PRICE_IDS.has(row.price_id)) return true;
  if (
    row.stripe_subscription_id
    && LEGACY_BETA_SUBSCRIPTION_PREFIXES.some((prefix) => row.stripe_subscription_id?.startsWith(prefix))
  ) {
    return true;
  }
  return Boolean(row.stripe_customer_id?.startsWith(LEGACY_BETA_CUSTOMER_PREFIX));
}

export function isInternalAccessSubscription(row: {
  price_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_customer_id?: string | null;
} | null | undefined): boolean {
  return isFreeTrialSubscription(row) || isLegacyBetaSubscription(row);
}

function buildTrialSubscriptionId(userId: string): string {
  return `${FREE_TRIAL_SUBSCRIPTION_PREFIX}${userId}`;
}

function buildTrialCustomerId(userId: string): string {
  return `${FREE_TRIAL_CUSTOMER_PREFIX}${userId}`;
}

function isActivePaidAccess(profile: ProAccessProfile | null | undefined, nowMs: number): boolean {
  if (!profile) return false;
  if (profile.admin_override_pro) return true;
  return hasProAccess(profile, nowMs);
}

export async function ensureFreeTrialForUser(params: {
  admin: SupabaseClient;
  userId: string;
  nowMs?: number;
}): Promise<{ activated: boolean; periodStart: number | null; periodEnd: number | null }> {
  const now = params.nowMs ?? Date.now();
  const subscriptionId = buildTrialSubscriptionId(params.userId);

  const { data: profile, error: profileError } = await params.admin
    .from('profiles')
    .select('id, is_pro, subscription_status, subscription_period_end, admin_override_pro')
    .eq('id', params.userId)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Unable to read profile before free trial: ${profileError.message}`);
  }

  if (isActivePaidAccess(profile as ProAccessProfile | null, now)) {
    return {
      activated: false,
      periodStart: null,
      periodEnd: (profile as ProAccessProfile | null)?.subscription_period_end ?? null,
    };
  }

  const { data: paidSubscriptions, error: paidError } = await params.admin
    .from('subscriptions')
    .select('status, cancel_at_period_end, current_period_end, price_id, stripe_subscription_id, stripe_customer_id')
    .eq('user_id', params.userId)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (paidError) {
    throw new Error(`Unable to read paid subscriptions before free trial: ${paidError.message}`);
  }

  const paidSubscriptionRows = ((paidSubscriptions ?? []) as FreeTrialSubscriptionRow[])
    .filter((subscription) => !isInternalAccessSubscription(subscription));

  const hasActivePaidSubscription = paidSubscriptionRows.some((subscription) => (
    hasProAccess({
      is_pro: true,
      subscription_status: subscription.status,
      subscription_period_end: subscription.current_period_end,
      cancel_at_period_end: subscription.cancel_at_period_end,
    }, now)
  ));

  if (hasActivePaidSubscription || paidSubscriptionRows.length > 0) {
    return { activated: false, periodStart: null, periodEnd: null };
  }

  const { data: existingTrial, error: existingError } = await params.admin
    .from('subscriptions')
    .select('status, cancel_at_period_end, current_period_start, current_period_end, price_id, stripe_subscription_id, stripe_customer_id')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Unable to read free trial subscription: ${existingError.message}`);
  }

  const existing = existingTrial as FreeTrialSubscriptionRow | null;
  if (existing) {
    const periodEnd = typeof existing.current_period_end === 'number' ? existing.current_period_end : null;
    const active = existing.status === 'trialing'
      && existing.cancel_at_period_end !== true
      && typeof periodEnd === 'number'
      && periodEnd > now;

    const profileUpdate = active
      ? {
          is_pro: true,
          subscription_status: 'trialing',
          subscription_tier: 'pro',
          subscription_period_end: periodEnd,
          updated_at: now,
        }
      : {
          is_pro: false,
          subscription_status: 'free',
          subscription_tier: 'free',
          subscription_period_end: null,
          updated_at: now,
        };

    const { error: syncError } = await params.admin
      .from('profiles')
      .upsert({ id: params.userId, ...profileUpdate }, { onConflict: 'id' });

    if (syncError) {
      throw new Error(`Unable to sync free trial profile access: ${syncError.message}`);
    }

    if (!active && existing.status === 'trialing') {
      const { error: subscriptionSyncError } = await params.admin
        .from('subscriptions')
        .update({
          status: 'canceled',
          cancel_at_period_end: false,
          updated_at: now,
        })
        .eq('stripe_subscription_id', subscriptionId);

      if (subscriptionSyncError) {
        throw new Error(`Unable to expire free trial subscription: ${subscriptionSyncError.message}`);
      }
    }

    return {
      activated: active,
      periodStart: existing.current_period_start ?? null,
      periodEnd,
    };
  }

  const periodStart = now;
  const periodEnd = freeTrialEndsAt(now);

  const { error: profileGrantError } = await params.admin
    .from('profiles')
    .upsert({
      id: params.userId,
      is_pro: true,
      subscription_status: 'trialing',
      subscription_tier: 'pro',
      subscription_period_end: periodEnd,
      updated_at: now,
    }, { onConflict: 'id' });

  if (profileGrantError) {
    throw new Error(`Unable to grant free trial profile access: ${profileGrantError.message}`);
  }

  const { error: subscriptionError } = await params.admin
    .from('subscriptions')
    .upsert({
      user_id: params.userId,
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: buildTrialCustomerId(params.userId),
      price_id: FREE_TRIAL_PRICE_ID,
      status: 'trialing',
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancel_at_period_end: false,
      updated_at: now,
    }, { onConflict: 'stripe_subscription_id' });

  if (subscriptionError) {
    throw new Error(`Unable to create free trial subscription: ${subscriptionError.message}`);
  }

  return { activated: true, periodStart, periodEnd };
}

export async function hasActiveFreeTrialAccess(params: {
  admin: SupabaseClient;
  userId: string;
  nowMs?: number;
}): Promise<boolean> {
  const now = params.nowMs ?? Date.now();
  const { data, error } = await params.admin
    .from('subscriptions')
    .select('status, cancel_at_period_end, current_period_end, price_id, stripe_subscription_id, stripe_customer_id')
    .eq('user_id', params.userId)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(`Unable to check free trial access: ${error.message}`);
  }

  return ((data ?? []) as FreeTrialSubscriptionRow[]).some((subscription) => (
    isFreeTrialSubscription(subscription)
    && subscription.status === 'trialing'
    && subscription.cancel_at_period_end !== true
    && typeof subscription.current_period_end === 'number'
    && subscription.current_period_end > now
  ));
}

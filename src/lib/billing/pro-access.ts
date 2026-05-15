export interface ProAccessProfile {
  is_pro?: boolean | null;
  subscription_status?: string | null;
  subscription_period_end?: number | null;
  admin_override_pro?: boolean | null;
  cancel_at_period_end?: boolean | null;
}

const PRO_ACCESS_STATUSES = new Set(['active', 'past_due']);

/**
 * Returns whether a profile currently has effective Pro access.
 *
 * Rules (checked in order):
 * 1. Must have `is_pro = true`
 * 2. Status must be `active` or `past_due`
 * 3. Must not be scheduled to stop renewing (`cancel_at_period_end != true`)
 * 4. Must be inside paid period (`subscription_period_end > now`)
 */
export function hasProAccess(
  profile: ProAccessProfile | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!profile) return false;

  if (!profile.is_pro) return false;
  if (profile.cancel_at_period_end) return false;

  const status = profile.subscription_status ?? 'free';
  if (!PRO_ACCESS_STATUSES.has(status)) return false;

  const periodEnd = profile.subscription_period_end;
  if (typeof periodEnd === 'number') {
    return periodEnd > nowMs;
  }

  return false;
}


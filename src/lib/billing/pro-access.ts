export interface ProAccessProfile {
  is_pro?: boolean | null;
  subscription_status?: string | null;
  subscription_period_end?: number | null;
}

const PRO_ACCESS_STATUSES = new Set(['active', 'past_due']);

/**
 * Returns whether a profile currently has effective Pro access.
 *
 * Rules:
 * - Must have `is_pro = true`
 * - Status must be `active` or `past_due`
 * - Must be inside paid period (`subscription_period_end > now`)
 * - Exception: `active` with no period end is treated as active access
 */
export function hasProAccess(
  profile: ProAccessProfile | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!profile?.is_pro) return false;

  const status = profile.subscription_status ?? 'free';
  if (!PRO_ACCESS_STATUSES.has(status)) return false;

  const periodEnd = profile.subscription_period_end;
  if (typeof periodEnd === 'number') {
    return periodEnd > nowMs;
  }

  return status === 'active';
}

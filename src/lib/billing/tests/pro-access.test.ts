import { describe, expect, it } from 'vitest';
import { hasProAccess } from '@/lib/billing/pro-access';

describe('hasProAccess', () => {
  it('returns true for active pro with future period end', () => {
    expect(
      hasProAccess({
        is_pro: true,
        subscription_status: 'active',
        subscription_period_end: Date.now() + 60_000,
      })
    ).toBe(true);
  });

  it('returns true for past_due pro while period is still valid', () => {
    expect(
      hasProAccess({
        is_pro: true,
        subscription_status: 'past_due',
        subscription_period_end: Date.now() + 60_000,
      })
    ).toBe(true);
  });

  it('returns false when the paid period has ended', () => {
    expect(
      hasProAccess({
        is_pro: true,
        subscription_status: 'active',
        subscription_period_end: Date.now() - 60_000,
      })
    ).toBe(false);
  });

  it('returns false for past_due without period end', () => {
    expect(
      hasProAccess({
        is_pro: true,
        subscription_status: 'past_due',
        subscription_period_end: null,
      })
    ).toBe(false);
  });
});

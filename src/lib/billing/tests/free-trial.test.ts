import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ensureFreeTrialForUser,
  freeTrialEndsAt,
  hasActiveFreeTrialAccess,
  isFreeTrialSubscription,
  isInternalAccessSubscription,
  isLegacyBetaSubscription,
} from '@/lib/billing/free-trial';

function createAdminClient(params: {
  profile: Record<string, unknown> | null;
  subscriptions: Array<Record<string, unknown>>;
  existingTrial?: Record<string, unknown> | null;
}) {
  const profilesUpsert = vi.fn(async () => ({ error: null }));
  const subscriptionsUpsert = vi.fn(async () => ({ error: null }));
  const subscriptionsUpdate = vi.fn(() => ({
    eq: vi.fn(async () => ({ error: null })),
  }));

  function createQuery(table: string) {
    const filters: Array<{ column: string; value: unknown }> = [];

    const resolve = () => {
      if (table === 'profiles') {
        return { data: params.profile, error: null };
      }

      const stripeSubscriptionFilter = filters.find((filter) => (
        filter.column === 'stripe_subscription_id'
      ));
      if (stripeSubscriptionFilter) {
        return { data: params.existingTrial ?? null, error: null };
      }

      return { data: params.subscriptions, error: null };
    };

    const query = {
      eq(column: string, value: unknown) {
        filters.push({ column, value });
        return query;
      },
      order() {
        return query;
      },
      async limit() {
        return resolve();
      },
      async maybeSingle() {
        return resolve();
      },
    };

    return query;
  }

  return {
    client: {
      from: vi.fn((table: string) => ({
        select: vi.fn(() => createQuery(table)),
        upsert: table === 'profiles' ? profilesUpsert : subscriptionsUpsert,
        update: subscriptionsUpdate,
      })),
    },
    profilesUpsert,
    subscriptionsUpsert,
    subscriptionsUpdate,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('free trial billing access', () => {
  it('uses configured trial days', () => {
    vi.stubEnv('FREE_TRIAL_DAYS', '14');
    expect(freeTrialEndsAt(1_000)).toBe(1_000 + 14 * 24 * 60 * 60 * 1000);
  });

  it('detects internal free trial subscription rows', () => {
    expect(isFreeTrialSubscription({ price_id: 'free_trial' })).toBe(true);
    expect(isFreeTrialSubscription({ stripe_subscription_id: 'free_trial_user-id' })).toBe(true);
    expect(isFreeTrialSubscription({ stripe_customer_id: 'trial_user-id' })).toBe(true);
    expect(isFreeTrialSubscription({ price_id: 'price_pro' })).toBe(false);
  });

  it('marks free trial subscriptions as internal access rows', () => {
    expect(isInternalAccessSubscription({ price_id: 'free_trial' })).toBe(true);
    expect(isLegacyBetaSubscription({ price_id: 'beta_access' })).toBe(true);
    expect(isInternalAccessSubscription({ stripe_subscription_id: 'beta_access_invite-id' })).toBe(true);
    expect(isInternalAccessSubscription({ price_id: 'price_pro' })).toBe(false);
  });

  it('does not issue a free trial after prior paid subscription history', async () => {
    const admin = createAdminClient({
      profile: {
        id: 'user_paid_history',
        is_pro: false,
        subscription_status: 'canceled',
        subscription_period_end: null,
        admin_override_pro: false,
      },
      subscriptions: [{
        status: 'canceled',
        cancel_at_period_end: false,
        current_period_end: Date.now() - 60_000,
        price_id: 'price_pro_test',
        stripe_subscription_id: 'sub_paid_history',
        stripe_customer_id: 'cus_paid_history',
      }],
    });

    const result = await ensureFreeTrialForUser({
      admin: admin.client as never,
      userId: 'user_paid_history',
    });

    expect(result).toEqual({
      activated: false,
      periodStart: null,
      periodEnd: null,
    });
    expect(admin.profilesUpsert).not.toHaveBeenCalled();
    expect(admin.subscriptionsUpsert).not.toHaveBeenCalled();
  });

  it('expires an existing stale trial and syncs the profile back to free', async () => {
    const now = 2_000_000;
    const admin = createAdminClient({
      profile: {
        id: 'user_expired_trial',
        is_pro: true,
        subscription_status: 'trialing',
        subscription_period_end: now - 1,
        admin_override_pro: false,
      },
      subscriptions: [],
      existingTrial: {
        status: 'trialing',
        cancel_at_period_end: false,
        current_period_start: now - 100_000,
        current_period_end: now - 1,
        price_id: 'free_trial',
        stripe_subscription_id: 'free_trial_user_expired_trial',
        stripe_customer_id: 'trial_user_expired_trial',
      },
    });

    const result = await ensureFreeTrialForUser({
      admin: admin.client as never,
      userId: 'user_expired_trial',
      nowMs: now,
    });

    expect(result).toEqual({
      activated: false,
      periodStart: now - 100_000,
      periodEnd: now - 1,
    });
    expect(admin.profilesUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'user_expired_trial',
        is_pro: false,
        subscription_status: 'free',
        subscription_tier: 'free',
        subscription_period_end: null,
      }),
      { onConflict: 'id' },
    );
    expect(admin.subscriptionsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'canceled',
        cancel_at_period_end: false,
      }),
    );
  });

  it('does not treat a cancel-at-period-end trial as active access', async () => {
    const admin = createAdminClient({
      profile: null,
      subscriptions: [{
        status: 'trialing',
        cancel_at_period_end: true,
        current_period_end: Date.now() + 60_000,
        price_id: 'free_trial',
        stripe_subscription_id: 'free_trial_user_canceling_trial',
        stripe_customer_id: 'trial_user_canceling_trial',
      }],
    });

    await expect(hasActiveFreeTrialAccess({
      admin: admin.client as never,
      userId: 'user_canceling_trial',
    })).resolves.toBe(false);
  });
});

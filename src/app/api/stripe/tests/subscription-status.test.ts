import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  createAdminClient: vi.fn(),
  ensureFreeTrialForUser: vi.fn(),
  hasActiveFreeTrialAccess: vi.fn(),
  getEffectiveProAccess: vi.fn(),
  stripeSubscriptionList: vi.fn(),
  stripeInvoiceList: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createServerClient,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createAdminClient,
}));

vi.mock('@/lib/billing/free-trial', () => ({
  ensureFreeTrialForUser: mocks.ensureFreeTrialForUser,
  hasActiveFreeTrialAccess: mocks.hasActiveFreeTrialAccess,
  isInternalAccessSubscription: (subscription: {
    price_id?: string | null;
    stripe_subscription_id?: string | null;
    stripe_customer_id?: string | null;
  } | null | undefined) => (
    subscription?.price_id === 'free_trial' ||
    subscription?.price_id === 'beta_access' ||
    subscription?.price_id === 'beta_trial' ||
    subscription?.stripe_subscription_id?.startsWith('free_trial_') ||
    subscription?.stripe_subscription_id?.startsWith('beta_access_') ||
    subscription?.stripe_subscription_id?.startsWith('beta_trial_') ||
    subscription?.stripe_customer_id?.startsWith('trial_') ||
    subscription?.stripe_customer_id?.startsWith('beta_')
  ),
  isLegacyBetaSubscription: (subscription: {
    price_id?: string | null;
    stripe_subscription_id?: string | null;
    stripe_customer_id?: string | null;
  } | null | undefined) => (
    subscription?.price_id === 'beta_access' ||
    subscription?.price_id === 'beta_trial' ||
    subscription?.stripe_subscription_id?.startsWith('beta_access_') ||
    subscription?.stripe_subscription_id?.startsWith('beta_trial_') ||
    subscription?.stripe_customer_id?.startsWith('beta_')
  ),
}));

vi.mock('@/lib/billing/effective-pro-access', () => ({
  getEffectiveProAccess: mocks.getEffectiveProAccess,
}));

vi.mock('@/lib/billing/stripe', () => ({
  getSubscriptionTier: (priceId: string | null) => {
    if (priceId === 'price_pro_test') return 'pro';
    if (priceId === 'price_enterprise_test') return 'enterprise';
    return 'free';
  },
  stripe: {
    subscriptions: {
      list: mocks.stripeSubscriptionList,
    },
    invoices: {
      list: mocks.stripeInvoiceList,
    },
  },
}));

type QueryResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

function createQuery<T>(result: QueryResult<T>) {
  const query = {
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(async () => result),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
  };

  return query;
}

function createSupabaseClient(params: {
  user?: { id: string; email?: string } | null;
  profile?: Record<string, unknown> | null;
  subscription?: Record<string, unknown> | null;
  subscriptions?: Array<Record<string, unknown>>;
}) {
  const subscriptions = params.subscriptions ?? (
    params.subscription ? [params.subscription] : []
  );

  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: params.user ?? null },
        error: null,
      })),
    },
    from: vi.fn((table: string) => ({
      select: vi.fn(() => {
        if (table === 'profiles') {
          return createQuery({ data: params.profile ?? null, error: null });
        }

        if (table === 'subscriptions') {
          return createQuery({ data: subscriptions as never, error: null });
        }

        return createQuery({ data: null, error: null });
      }),
    })),
  };
}

describe('subscription status route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.example';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';

    mocks.ensureFreeTrialForUser.mockResolvedValue({
      periodStart: 1700000000000,
      periodEnd: 1702592000000,
    });
    mocks.hasActiveFreeTrialAccess.mockResolvedValue(false);
    mocks.getEffectiveProAccess.mockResolvedValue(false);
    mocks.stripeSubscriptionList.mockResolvedValue({ data: [] });
    mocks.stripeInvoiceList.mockResolvedValue({ data: [] });
  });

  it('does not mask a paid Stripe subscription as a free trial', async () => {
    const profile = {
      id: 'user_paid',
      is_pro: true,
      subscription_status: 'active',
      subscription_tier: 'free',
      subscription_period_end: Date.now() + 30 * 24 * 60 * 60 * 1000,
      admin_override_pro: false,
      stripe_customer_id: 'cus_paid',
    };
    const subscription = {
      user_id: 'user_paid',
      status: 'active',
      cancel_at_period_end: false,
      current_period_start: Date.now() - 24 * 60 * 60 * 1000,
      current_period_end: Date.now() + 30 * 24 * 60 * 60 * 1000,
      price_id: 'price_pro_test',
      stripe_subscription_id: 'sub_paid',
      stripe_customer_id: 'cus_paid',
    };

    const client = createSupabaseClient({
      user: { id: 'user_paid', email: 'paid@example.com' },
      profile,
      subscription,
    });
    mocks.createServerClient.mockResolvedValue(client);
    mocks.createAdminClient.mockReturnValue(client);
    mocks.hasActiveFreeTrialAccess.mockResolvedValue(true);
    mocks.stripeSubscriptionList.mockResolvedValue({
      data: [{ id: 'sub_paid', status: 'active' }],
    });

    const { GET } = await import('@/app/api/stripe/subscription-status/route');
    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(
      expect.objectContaining({
        isPro: true,
        status: 'active',
        tier: 'pro',
        isTrial: false,
      })
    );
    expect(mocks.ensureFreeTrialForUser).not.toHaveBeenCalled();
    expect(mocks.hasActiveFreeTrialAccess).not.toHaveBeenCalled();
  }, 10_000);

  it('returns trialing access for a free user with an active trial', async () => {
    const profile = {
      id: 'user_trial',
      is_pro: false,
      subscription_status: 'free',
      subscription_tier: 'free',
      subscription_period_end: null,
      admin_override_pro: false,
      stripe_customer_id: null,
    };

    const client = createSupabaseClient({
      user: { id: 'user_trial', email: 'trial@example.com' },
      profile,
      subscription: null,
    });
    mocks.createServerClient.mockResolvedValue(client);
    mocks.createAdminClient.mockReturnValue(client);
    mocks.hasActiveFreeTrialAccess.mockResolvedValue(true);

    const { GET } = await import('@/app/api/stripe/subscription-status/route');
    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(
      expect.objectContaining({
        isPro: true,
        status: 'trialing',
        tier: 'pro',
        isTrial: true,
      })
    );
    expect(mocks.ensureFreeTrialForUser).toHaveBeenCalledWith({
      admin: client,
      userId: 'user_trial',
    });
  });

  it('does not let an internal trial row hide paid Stripe history', async () => {
    const now = Date.now();
    const profile = {
      id: 'user_paid_hidden',
      is_pro: true,
      subscription_status: 'trialing',
      subscription_tier: 'pro',
      subscription_period_end: now + 30 * 24 * 60 * 60 * 1000,
      admin_override_pro: false,
      stripe_customer_id: 'cus_paid_hidden',
    };
    const client = createSupabaseClient({
      user: { id: 'user_paid_hidden', email: 'paid-hidden@example.com' },
      profile,
      subscriptions: [
        {
          user_id: 'user_paid_hidden',
          status: 'trialing',
          cancel_at_period_end: false,
          current_period_start: now,
          current_period_end: now + 30 * 24 * 60 * 60 * 1000,
          price_id: 'free_trial',
          stripe_subscription_id: 'free_trial_user_paid_hidden',
          stripe_customer_id: 'trial_user_paid_hidden',
        },
        {
          user_id: 'user_paid_hidden',
          status: 'active',
          cancel_at_period_end: false,
          current_period_start: now,
          current_period_end: now + 30 * 24 * 60 * 60 * 1000,
          price_id: 'price_pro_test',
          stripe_subscription_id: 'sub_paid_hidden',
          stripe_customer_id: 'cus_paid_hidden',
        },
      ],
    });
    mocks.createServerClient.mockResolvedValue(client);
    mocks.createAdminClient.mockReturnValue(client);

    const { GET } = await import('@/app/api/stripe/subscription-status/route');
    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(
      expect.objectContaining({
        isPro: true,
        status: 'active',
        tier: 'pro',
        isTrial: false,
        isBeta: false,
      }),
    );
    expect(mocks.ensureFreeTrialForUser).not.toHaveBeenCalled();
    expect(mocks.hasActiveFreeTrialAccess).not.toHaveBeenCalled();
  });

  it('normalizes expired trial profile state back to free in the response', async () => {
    const now = Date.now();
    const profile = {
      id: 'user_expired_trial',
      is_pro: true,
      subscription_status: 'trialing',
      subscription_tier: 'pro',
      subscription_period_end: now - 60_000,
      admin_override_pro: false,
      stripe_customer_id: null,
    };
    const client = createSupabaseClient({
      user: { id: 'user_expired_trial', email: 'expired-trial@example.com' },
      profile,
      subscriptions: [{
        user_id: 'user_expired_trial',
        status: 'trialing',
        cancel_at_period_end: false,
        current_period_start: now - 31 * 24 * 60 * 60 * 1000,
        current_period_end: now - 60_000,
        price_id: 'free_trial',
        stripe_subscription_id: 'free_trial_user_expired_trial',
        stripe_customer_id: 'trial_user_expired_trial',
      }],
    });
    mocks.createServerClient.mockResolvedValue(client);
    mocks.createAdminClient.mockReturnValue(client);
    mocks.ensureFreeTrialForUser.mockResolvedValue({
      periodStart: now - 31 * 24 * 60 * 60 * 1000,
      periodEnd: now - 60_000,
    });
    mocks.hasActiveFreeTrialAccess.mockResolvedValue(false);
    mocks.getEffectiveProAccess.mockResolvedValue(false);

    const { GET } = await import('@/app/api/stripe/subscription-status/route');
    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(
      expect.objectContaining({
        isPro: false,
        status: 'free',
        tier: 'free',
        periodStart: null,
        periodEnd: null,
        isTrial: false,
      }),
    );
  });

  it('surfaces legacy beta access without treating it as paid Stripe billing', async () => {
    const now = Date.now();
    const profile = {
      id: 'user_beta',
      is_pro: true,
      subscription_status: 'active',
      subscription_tier: 'pro',
      subscription_period_end: now + 10 * 24 * 60 * 60 * 1000,
      admin_override_pro: false,
      stripe_customer_id: null,
    };
    const client = createSupabaseClient({
      user: { id: 'user_beta', email: 'beta@example.com' },
      profile,
      subscriptions: [{
        user_id: 'user_beta',
        status: 'active',
        cancel_at_period_end: false,
        current_period_start: now,
        current_period_end: now + 10 * 24 * 60 * 60 * 1000,
        price_id: 'beta_access',
        stripe_subscription_id: 'beta_access_invite',
        stripe_customer_id: 'beta_user_beta',
      }],
    });
    mocks.createServerClient.mockResolvedValue(client);
    mocks.createAdminClient.mockReturnValue(client);

    const { GET } = await import('@/app/api/stripe/subscription-status/route');
    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(
      expect.objectContaining({
        isPro: true,
        status: 'active',
        tier: 'pro',
        isBeta: true,
        isTrial: false,
        refundEligible: false,
      }),
    );
    expect(mocks.ensureFreeTrialForUser).not.toHaveBeenCalled();
    expect(mocks.stripeSubscriptionList).not.toHaveBeenCalled();
  });
});

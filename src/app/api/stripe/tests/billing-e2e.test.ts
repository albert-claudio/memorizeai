import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getOrCreateCustomer: vi.fn(),
  checkoutSessionCreate: vi.fn(),
  checkoutSessionRetrieve: vi.fn(),
  portalSessionCreate: vi.fn(),
  webhookConstructEvent: vi.fn(),
  subscriptionRetrieve: vi.fn(),
  subscriptionList: vi.fn(),
  subscriptionUpdate: vi.fn(),
  subscriptionCancel: vi.fn(),
  invoiceList: vi.fn(),
  refundCreate: vi.fn(),
  getSubscriptionTier: vi.fn(),
  getSubscriptionStatus: vi.fn(),
  adminCreateClient: vi.fn(),
  runSecurityChecks: vi.fn(),
  getClientIP: vi.fn(),
  isStripeIP: vi.fn(),
  logWebhookAttempt: vi.fn(),
  recordFailedAttempt: vi.fn(),
  checkEventIdempotencyAtomic: vi.fn(),
  finalizeEvent: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createServerClient,
}));

vi.mock('@/lib/billing/stripe', () => ({
  stripe: {
    checkout: {
      sessions: {
        create: mocks.checkoutSessionCreate,
        retrieve: mocks.checkoutSessionRetrieve,
      },
    },
    billingPortal: { sessions: { create: mocks.portalSessionCreate } },
    invoices: {
      list: mocks.invoiceList,
    },
    refunds: {
      create: mocks.refundCreate,
    },
    webhooks: { constructEvent: mocks.webhookConstructEvent },
    subscriptions: {
      retrieve: mocks.subscriptionRetrieve,
      list: mocks.subscriptionList,
      update: mocks.subscriptionUpdate,
      cancel: mocks.subscriptionCancel,
    },
  },
  getOrCreateCustomer: mocks.getOrCreateCustomer,
  getSubscriptionTier: mocks.getSubscriptionTier,
  getSubscriptionStatus: mocks.getSubscriptionStatus,
  PRO_PRICE_ID: 'price_pro_test',
  ENTERPRISE_PRICE_ID: 'price_enterprise_test',
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.adminCreateClient,
}));

vi.mock('@/lib/security/webhook-security', () => ({
  runSecurityChecks: mocks.runSecurityChecks,
  getClientIP: mocks.getClientIP,
  isStripeIP: mocks.isStripeIP,
  logWebhookAttempt: mocks.logWebhookAttempt,
  recordFailedAttempt: mocks.recordFailedAttempt,
  checkEventIdempotencyAtomic: mocks.checkEventIdempotencyAtomic,
  finalizeEvent: mocks.finalizeEvent,
}));

function createServerSupabaseClient(options?: {
  user?: { id: string; email?: string | null; user_metadata?: { name?: string } } | null;
  authError?: unknown;
  profile?: { stripe_customer_id?: string | null } | null;
  subscription?: { user_id?: string; stripe_customer_id?: string | null; status?: string | null } | null;
}) {
  const getUser = vi.fn().mockResolvedValue({
    data: { user: options?.user ?? null },
    error: options?.authError ?? null,
  });

  const resolveSelect = (
    table: string,
    filters: Array<{ column: string; value: unknown }>
  ) => {
    if (table === 'profiles') {
      const idFilter = filters.find((filter) => filter.column === 'id');
      if (idFilter && options?.user?.id && idFilter.value !== options.user.id) {
        return { data: null, error: null };
      }
      return { data: options?.profile ?? null, error: null };
    }

    if (table === 'subscriptions') {
      const subscription = options?.subscription ?? null;
      if (!subscription) {
        return { data: null, error: null };
      }

      const userFilter = filters.find((filter) => filter.column === 'user_id');
      const expectedUserId = subscription.user_id ?? options?.user?.id ?? null;
      if (userFilter && expectedUserId && userFilter.value !== expectedUserId) {
        return { data: null, error: null };
      }

      const statusFilter = filters.find((filter) => filter.column === 'status');
      if (
        statusFilter &&
        subscription.status &&
        statusFilter.value !== subscription.status
      ) {
        return { data: null, error: null };
      }

      return { data: subscription, error: null };
    }

    return { data: options?.profile ?? null, error: null };
  };

  const createSelectQuery = (table: string) => {
    const filters: Array<{ column: string; value: unknown }> = [];

    const query: Record<string, unknown> = {
      eq(column: string, value: unknown) {
        filters.push({ column, value });
        return query;
      },
      order() {
        return query;
      },
      limit() {
        return query;
      },
      async single() {
        return resolveSelect(table, filters);
      },
      async maybeSingle() {
        return resolveSelect(table, filters);
      },
    };

    return query;
  };

  const from = vi.fn((table: string) => ({
    select: vi.fn().mockImplementation(() => createSelectQuery(table)),
  }));

  return {
    client: {
      auth: { getUser },
      from,
    },
  };
}

function createAdminSupabaseClient(options?: {
  profileLookupByCustomer?: { id: string } | null;
  existingProfile?: {
    id: string;
    is_pro: boolean;
    subscription_status: string;
    subscription_tier: string;
    subscription_period_end: number | null;
    stripe_customer_id?: string | null;
  } | null;
  existingSubscription?: {
    user_id?: string;
    stripe_subscription_id: string;
    stripe_customer_id?: string;
    price_id: string | null;
    status: string;
    current_period_start: number;
    current_period_end: number;
    cancel_at_period_end: boolean;
  } | null;
}) {
  const profileState = options?.existingProfile
    ? { ...options.existingProfile }
    : null;
  const profilesUpdateEq = vi.fn(
    async (column: string, value: string) => {
      if (column === 'id' && profileState && profileState.id === value) {
        const updatePayload = profilesUpdate.mock.calls.at(-1)?.[0] as Partial<typeof profileState> | undefined;
        if (updatePayload) {
          Object.assign(profileState, updatePayload);
        }
      }
      return { error: null };
    }
  );
  const profilesUpdate = vi.fn().mockReturnValue({ eq: profilesUpdateEq });
  const profilesUpsert = vi.fn(async () => ({ error: null }));
  const profilesSelectSingle = vi.fn().mockResolvedValue({
    data: options?.profileLookupByCustomer ?? null,
    error: null,
  });
  const profilesSelect = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: profilesSelectSingle,
    }),
  });

  let subscriptionState = options?.existingSubscription
    ? { ...options.existingSubscription }
    : null;
  const subscriptionsUpsert = vi.fn(async (payload: Record<string, unknown>) => {
    subscriptionState = {
      ...(subscriptionState ?? {}),
      ...payload,
    } as typeof subscriptionState;
    return { error: null };
  });
  const subscriptionsSelectSingle = vi.fn(async () => ({
    data: subscriptionState
      ? {
          user_id: subscriptionState.user_id ?? null,
          stripe_customer_id: subscriptionState.stripe_customer_id ?? null,
        }
      : null,
    error: null,
  }));
  const subscriptionsSelect = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: subscriptionsSelectSingle,
    }),
  });
  const subscriptionsUpdateEq = vi.fn(
    async (column: string, value: string) => {
      if (
        column === 'stripe_subscription_id' &&
        subscriptionState &&
        subscriptionState.stripe_subscription_id === value
      ) {
        const updatePayload = subscriptionsUpdate.mock.calls.at(-1)?.[0] as Partial<typeof subscriptionState> | undefined;
        if (updatePayload) {
          Object.assign(subscriptionState, updatePayload);
        }
      }
      return { error: null };
    }
  );
  const subscriptionsUpdate = vi.fn().mockReturnValue({ eq: subscriptionsUpdateEq });

  const from = vi.fn((table: string) => {
    if (table === 'profiles') {
      return {
        select: profilesSelect,
        update: profilesUpdate,
        upsert: profilesUpsert,
      };
    }

    if (table === 'subscriptions') {
      return {
        select: subscriptionsSelect,
        upsert: subscriptionsUpsert,
        update: subscriptionsUpdate,
      };
    }

    throw new Error(`Unexpected table in test: ${table}`);
  });

  return {
    client: { from },
    profilesUpdate,
    profilesUpsert,
    subscriptionsUpsert,
    subscriptionsUpdate,
    subscriptionsUpdateEq,
    get subscriptionState() {
      return subscriptionState;
    },
    get profileState() {
      return profileState;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  process.env.NEXT_PUBLIC_APP_URL = 'https://memoriza.app';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';

  mocks.getClientIP.mockReturnValue('3.18.12.63');
  mocks.isStripeIP.mockReturnValue(true);
  mocks.runSecurityChecks.mockResolvedValue({
    passed: true,
    rateLimitResult: {
      allowed: true,
      blocked: false,
      remainingRequests: 99,
    },
    timestampResult: { valid: true, ageMs: 10 },
    errors: [],
  });
  mocks.checkEventIdempotencyAtomic.mockResolvedValue({ isNew: true });
  mocks.logWebhookAttempt.mockResolvedValue(undefined);
  mocks.recordFailedAttempt.mockResolvedValue({ blocked: false, failCount: 1 });
  mocks.finalizeEvent.mockResolvedValue(undefined);
  mocks.getSubscriptionTier.mockImplementation((priceId: string | null) => (
    priceId === 'price_pro_test' ? 'pro' : 'free'
  ));
  mocks.getSubscriptionStatus.mockResolvedValue({
    isPro: false,
    status: 'free',
    tier: 'free',
    periodEnd: null,
  });
  mocks.subscriptionCancel.mockResolvedValue(undefined);
  mocks.invoiceList.mockResolvedValue({ data: [] });
  mocks.refundCreate.mockResolvedValue({
    id: 're_test_123',
    amount: 9900,
    currency: 'brl',
    created: Math.floor(Date.now() / 1000),
  });
});

describe('billing checkout', () => {
  it('creates checkout session for authenticated user', async () => {
    const supabase = createServerSupabaseClient({
      user: { id: 'user_1', email: 'john@example.com', user_metadata: { name: 'John' } },
    });
    mocks.createServerClient.mockResolvedValue(supabase.client);
    mocks.getOrCreateCustomer.mockResolvedValue('cus_123');
    mocks.checkoutSessionCreate.mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/test',
    });

    const { POST } = await import('@/app/api/stripe/create-checkout/route');

    const request = new NextRequest('https://memoriza.app/api/stripe/create-checkout', {
      method: 'POST',
      headers: { origin: 'https://memoriza.app', 'content-type': 'application/json' },
      body: JSON.stringify({ planKey: 'pro_monthly' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      url: 'https://checkout.stripe.com/test',
    });
    expect(mocks.checkoutSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_123',
        mode: 'subscription',
        allow_promotion_codes: false,
        metadata: expect.objectContaining({
          user_id: 'user_1',
          plan_key: 'pro_monthly',
        }),
        success_url: expect.stringContaining('https://memoriza.app/dashboard?checkout=success'),
        cancel_url: 'https://memoriza.app/dashboard?checkout=canceled',
      }),
      expect.objectContaining({
        idempotencyKey: expect.any(String),
      })
    );
  });

  it('rejects forbidden pricing fields sent by client', async () => {
    const supabase = createServerSupabaseClient({
      user: { id: 'user_1', email: 'john@example.com' },
    });
    mocks.createServerClient.mockResolvedValue(supabase.client);
    mocks.getOrCreateCustomer.mockResolvedValue('cus_123');

    const { POST } = await import('@/app/api/stripe/create-checkout/route');

    const request = new NextRequest('https://memoriza.app/api/stripe/create-checkout', {
      method: 'POST',
      headers: { origin: 'https://memoriza.app', 'content-type': 'application/json' },
      body: JSON.stringify({ priceId: 'price_hacker' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain('Campo não permitido');
    expect(mocks.getOrCreateCustomer).not.toHaveBeenCalled();
    expect(mocks.checkoutSessionCreate).not.toHaveBeenCalled();
  });

  it('rejects checkout when the same paid plan is already active', async () => {
    const supabase = createServerSupabaseClient({
      user: { id: 'user_1', email: 'john@example.com' },
    });
    mocks.createServerClient.mockResolvedValue(supabase.client);
    mocks.getSubscriptionStatus.mockResolvedValue({
      isPro: true,
      status: 'active',
      tier: 'pro',
      periodEnd: Date.now() + 86_400_000,
    });

    const { POST } = await import('@/app/api/stripe/create-checkout/route');

    const request = new NextRequest('https://memoriza.app/api/stripe/create-checkout', {
      method: 'POST',
      headers: { origin: 'https://memoriza.app', 'content-type': 'application/json' },
      body: JSON.stringify({ planKey: 'pro_monthly' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json).toEqual({ error: 'Plano já está ativo para este usuário' });
    expect(mocks.getOrCreateCustomer).not.toHaveBeenCalled();
    expect(mocks.checkoutSessionCreate).not.toHaveBeenCalled();
  });

});

describe('billing checkout confirmation fallback', () => {
  it('confirms checkout by session_id and synchronizes profile/subscription', async () => {
    const supabase = createServerSupabaseClient({
      user: { id: 'user_1', email: 'john@example.com' },
      profile: { stripe_customer_id: 'cus_123' },
    });
    mocks.createServerClient.mockResolvedValue(supabase.client);
    const admin = createAdminSupabaseClient();
    mocks.adminCreateClient.mockReturnValue(admin.client);

    mocks.checkoutSessionRetrieve.mockResolvedValue({
      id: 'cs_confirm_123',
      mode: 'subscription',
      status: 'complete',
      payment_status: 'paid',
      customer: 'cus_123',
      metadata: { user_id: 'user_1', plan_key: 'pro_monthly' },
      subscription: {
        id: 'sub_confirm_123',
        status: 'active',
        customer: 'cus_123',
        cancel_at_period_end: false,
        current_period_start: 1700000000,
        current_period_end: 1710000000,
        items: {
          data: [{ price: { id: 'price_pro_test' } }],
        },
        metadata: { user_id: 'user_1', plan_key: 'pro_monthly' },
      },
    });

    const { POST } = await import('@/app/api/stripe/confirm-checkout/route');

    const request = new NextRequest('https://memoriza.app/api/stripe/confirm-checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'cs_confirm_123' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(
      expect.objectContaining({
        ok: true,
        tier: 'pro',
        status: 'active',
      })
    );
    expect(admin.profilesUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'user_1',
        is_pro: true,
        subscription_status: 'active',
        subscription_tier: 'pro',
        stripe_customer_id: 'cus_123',
      }),
      expect.objectContaining({
        onConflict: 'id',
      })
    );
    expect(admin.subscriptionsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user_1',
        stripe_subscription_id: 'sub_confirm_123',
        stripe_customer_id: 'cus_123',
        status: 'active',
      }),
      expect.objectContaining({
        onConflict: 'stripe_subscription_id',
      })
    );
  });

  it('rejects checkout confirmation when metadata user does not match authenticated user', async () => {
    const supabase = createServerSupabaseClient({
      user: { id: 'user_1', email: 'john@example.com' },
      profile: { stripe_customer_id: 'cus_123' },
    });
    mocks.createServerClient.mockResolvedValue(supabase.client);
    const admin = createAdminSupabaseClient();
    mocks.adminCreateClient.mockReturnValue(admin.client);

    mocks.checkoutSessionRetrieve.mockResolvedValue({
      id: 'cs_forbidden_123',
      mode: 'subscription',
      status: 'complete',
      payment_status: 'paid',
      customer: 'cus_other',
      metadata: { user_id: 'user_2', plan_key: 'pro_monthly' },
      subscription: {
        id: 'sub_forbidden_123',
        status: 'active',
        customer: 'cus_other',
        cancel_at_period_end: false,
        items: {
          data: [{ price: { id: 'price_pro_test' } }],
        },
        metadata: { user_id: 'user_2', plan_key: 'pro_monthly' },
      },
    });

    const { POST } = await import('@/app/api/stripe/confirm-checkout/route');

    const request = new NextRequest('https://memoriza.app/api/stripe/confirm-checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'cs_forbidden_123' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toContain('pertence ao usu');
    expect(admin.profilesUpsert).not.toHaveBeenCalled();
    expect(admin.subscriptionsUpsert).not.toHaveBeenCalled();
  });
});

describe('billing portal', () => {
  it('creates portal session for subscribed user', async () => {
    const supabase = createServerSupabaseClient({
      user: { id: 'user_1', email: 'john@example.com' },
      profile: { stripe_customer_id: 'cus_123' },
    });
    mocks.createServerClient.mockResolvedValue(supabase.client);
    mocks.portalSessionCreate.mockResolvedValue({
      url: 'https://billing.stripe.com/session/test',
    });

    const { POST } = await import('@/app/api/stripe/create-portal/route');

    const request = new NextRequest('https://memoriza.app/api/stripe/create-portal', {
      method: 'POST',
      headers: { origin: 'https://memoriza.app' },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ url: 'https://billing.stripe.com/session/test' });
    expect(mocks.portalSessionCreate).toHaveBeenCalledWith({
      customer: 'cus_123',
      return_url: 'https://memoriza.app/dashboard',
    });
  });

  it('returns 400 when user has no customer id', async () => {
    const supabase = createServerSupabaseClient({
      user: { id: 'user_1', email: 'john@example.com' },
      profile: { stripe_customer_id: null },
    });
    mocks.createServerClient.mockResolvedValue(supabase.client);

    const { POST } = await import('@/app/api/stripe/create-portal/route');

    const request = new NextRequest('https://memoriza.app/api/stripe/create-portal', {
      method: 'POST',
      headers: { origin: 'https://memoriza.app' },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: 'Nenhuma assinatura encontrada' });
    expect(mocks.portalSessionCreate).not.toHaveBeenCalled();
  });
});

describe('cancel subscription', () => {
  it('allows localhost origin and schedules cancellation at period end', async () => {
    const supabase = createServerSupabaseClient({
      user: { id: 'user_1', email: 'john@example.com' },
      profile: { stripe_customer_id: 'cus_123' },
    });
    mocks.createServerClient.mockResolvedValue(supabase.client);
    mocks.adminCreateClient.mockReturnValue(supabase.client);
    mocks.subscriptionList.mockResolvedValue({
      data: [
        {
          id: 'sub_123',
          status: 'active',
          cancel_at_period_end: false,
          current_period_start: 1700000000,
          current_period_end: 1710000000,
          items: { data: [] },
        },
      ],
    });
    mocks.subscriptionUpdate.mockResolvedValue({
      id: 'sub_123',
      status: 'active',
      cancel_at_period_end: true,
      current_period_start: 1700000000,
      current_period_end: 1710000000,
      items: { data: [] },
    });

    const { POST } = await import('@/app/api/stripe/cancel-subscription/route');

    const request = new NextRequest('http://localhost:3000/api/stripe/cancel-subscription', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000' },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(
      expect.objectContaining({
        ok: true,
        alreadyScheduled: false,
      })
    );
    expect(mocks.subscriptionList).toHaveBeenCalledWith({
      customer: 'cus_123',
      status: 'all',
      limit: 10,
    });
    expect(mocks.subscriptionUpdate).toHaveBeenCalledWith('sub_123', {
      cancel_at_period_end: true,
    });
  });

  it('falls back to subscriptions table when profile does not expose stripe_customer_id', async () => {
    const supabase = createServerSupabaseClient({
      user: { id: 'user_1', email: 'john@example.com' },
      profile: null,
      subscription: {
        user_id: 'user_1',
        stripe_customer_id: 'cus_from_subscription_row',
        status: 'active',
      },
    });
    mocks.createServerClient.mockResolvedValue(supabase.client);
    mocks.adminCreateClient.mockReturnValue(supabase.client);
    mocks.subscriptionList.mockResolvedValue({
      data: [
        {
          id: 'sub_123',
          status: 'active',
          cancel_at_period_end: false,
          current_period_start: 1700000000,
          current_period_end: 1710000000,
          items: { data: [] },
        },
      ],
    });
    mocks.subscriptionUpdate.mockResolvedValue({
      id: 'sub_123',
      status: 'active',
      cancel_at_period_end: true,
      current_period_start: 1700000000,
      current_period_end: 1710000000,
      items: { data: [] },
    });

    const { POST } = await import('@/app/api/stripe/cancel-subscription/route');

    const request = new NextRequest('http://localhost:3000/api/stripe/cancel-subscription', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000' },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(
      expect.objectContaining({
        ok: true,
        alreadyScheduled: false,
      })
    );
    expect(mocks.subscriptionList).toHaveBeenCalledWith({
      customer: 'cus_from_subscription_row',
      status: 'all',
      limit: 10,
    });
  });

  it('returns 403 for invalid origin', async () => {
    const supabase = createServerSupabaseClient({
      user: { id: 'user_1', email: 'john@example.com' },
      profile: { stripe_customer_id: 'cus_123' },
    });
    mocks.createServerClient.mockResolvedValue(supabase.client);

    const { POST } = await import('@/app/api/stripe/cancel-subscription/route');

    const request = new NextRequest('http://localhost:3000/api/stripe/cancel-subscription', {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json).toEqual({ error: 'Origem nao autorizada' });
    expect(mocks.subscriptionList).not.toHaveBeenCalled();
    expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
  });
});

describe('refund subscription', () => {
  it('refunds the latest paid invoice within 7 days and cancels immediately', async () => {
    const supabase = createServerSupabaseClient({
      user: { id: 'user_refund', email: 'refund@example.com' },
      profile: { stripe_customer_id: 'cus_refund_123' },
    });
    const admin = createAdminSupabaseClient({
      existingProfile: {
        id: 'user_refund',
        is_pro: true,
        subscription_status: 'active',
        subscription_tier: 'pro',
        subscription_period_end: 1710000000000,
        stripe_customer_id: 'cus_refund_123',
      },
      existingSubscription: {
        user_id: 'user_refund',
        stripe_subscription_id: 'sub_refund_123',
        stripe_customer_id: 'cus_refund_123',
        price_id: 'price_pro_test',
        status: 'active',
        current_period_start: 1700000000000,
        current_period_end: 1710000000000,
        cancel_at_period_end: false,
      },
    });

    mocks.createServerClient.mockResolvedValue(supabase.client);
    mocks.adminCreateClient.mockReturnValue(admin.client);
    mocks.subscriptionList.mockResolvedValue({
      data: [
        {
          id: 'sub_refund_123',
          status: 'active',
          cancel_at_period_end: false,
          current_period_start: Math.floor((Date.now() - (2 * 24 * 60 * 60 * 1000)) / 1000),
          current_period_end: Math.floor((Date.now() + (28 * 24 * 60 * 60 * 1000)) / 1000),
          items: { data: [{ price: { id: 'price_pro_test' } }] },
        },
      ],
    });
    mocks.invoiceList.mockResolvedValue({
      data: [
        {
          id: 'in_refund_123',
          status: 'paid',
          amount_paid: 9900,
          created: Math.floor((Date.now() - (2 * 24 * 60 * 60 * 1000)) / 1000),
          payment_intent: 'pi_refund_123',
        },
      ],
    });
    mocks.refundCreate.mockResolvedValue({
      id: 're_refund_123',
      amount: 9900,
      currency: 'brl',
      created: Math.floor(Date.now() / 1000),
    });

    const { POST } = await import('@/app/api/stripe/refund-subscription/route');

    const request = new NextRequest('https://memoriza.app/api/stripe/refund-subscription', {
      method: 'POST',
      headers: { origin: 'https://memoriza.app' },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(
      expect.objectContaining({
        ok: true,
        refundId: 're_refund_123',
        amountRefunded: 9900,
        currency: 'brl',
      })
    );
    expect(mocks.invoiceList).toHaveBeenCalledWith({
      customer: 'cus_refund_123',
      subscription: 'sub_refund_123',
      limit: 10,
    });
    expect(mocks.refundCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent: 'pi_refund_123',
        amount: 9900,
        reason: 'requested_by_customer',
        metadata: expect.objectContaining({
          user_id: 'user_refund',
          invoice_id: 'in_refund_123',
          source: 'self_service_refund',
        }),
      }),
      expect.objectContaining({
        idempotencyKey: 'refund:user_refund:in_refund_123',
      })
    );
    expect(mocks.subscriptionCancel).toHaveBeenCalledWith('sub_refund_123');
    expect(admin.profileState?.subscription_status).toBe('canceled');
    expect(admin.profileState?.subscription_tier).toBe('free');
    expect(admin.profileState?.is_pro).toBe(false);
    expect(admin.subscriptionState?.status).toBe('canceled');
    expect(admin.subscriptionState?.cancel_at_period_end).toBe(false);
  });

  it('rejects automatic refund when the 7-day window has expired', async () => {
    const supabase = createServerSupabaseClient({
      user: { id: 'user_refund_late', email: 'late@example.com' },
      profile: { stripe_customer_id: 'cus_refund_late' },
    });
    const admin = createAdminSupabaseClient({
      existingProfile: {
        id: 'user_refund_late',
        is_pro: true,
        subscription_status: 'active',
        subscription_tier: 'pro',
        subscription_period_end: 1710000000000,
        stripe_customer_id: 'cus_refund_late',
      },
      existingSubscription: {
        user_id: 'user_refund_late',
        stripe_subscription_id: 'sub_refund_late',
        stripe_customer_id: 'cus_refund_late',
        price_id: 'price_pro_test',
        status: 'active',
        current_period_start: 1700000000000,
        current_period_end: 1710000000000,
        cancel_at_period_end: false,
      },
    });

    mocks.createServerClient.mockResolvedValue(supabase.client);
    mocks.adminCreateClient.mockReturnValue(admin.client);
    mocks.subscriptionList.mockResolvedValue({
      data: [
        {
          id: 'sub_refund_late',
          status: 'active',
          cancel_at_period_end: false,
          current_period_start: Math.floor((Date.now() - (10 * 24 * 60 * 60 * 1000)) / 1000),
          current_period_end: Math.floor((Date.now() + (20 * 24 * 60 * 60 * 1000)) / 1000),
          items: { data: [{ price: { id: 'price_pro_test' } }] },
        },
      ],
    });
    mocks.invoiceList.mockResolvedValue({
      data: [
        {
          id: 'in_refund_late',
          status: 'paid',
          amount_paid: 9900,
          created: Math.floor((Date.now() - (10 * 24 * 60 * 60 * 1000)) / 1000),
          payment_intent: 'pi_refund_late',
        },
      ],
    });

    const { POST } = await import('@/app/api/stripe/refund-subscription/route');

    const request = new NextRequest('https://memoriza.app/api/stripe/refund-subscription', {
      method: 'POST',
      headers: { origin: 'https://memoriza.app' },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toContain('7 dias');
    expect(mocks.refundCreate).not.toHaveBeenCalled();
    expect(mocks.subscriptionCancel).not.toHaveBeenCalled();
    expect(admin.profilesUpdate).not.toHaveBeenCalled();
  });
});

describe('billing webhook', () => {
  it('processes checkout.session.completed and upgrades user', async () => {
    const admin = createAdminSupabaseClient();
    mocks.adminCreateClient.mockReturnValue(admin.client);
    mocks.webhookConstructEvent.mockReturnValue({
      id: 'evt_checkout_completed',
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'subscription',
          subscription: 'sub_123',
          customer: 'cus_123',
          metadata: { user_id: 'user_1' },
        },
      },
    });
    mocks.subscriptionRetrieve.mockResolvedValue({
      id: 'sub_123',
      current_period_start: 1700000000,
      current_period_end: 1710000000,
      cancel_at_period_end: false,
      items: {
        data: [{ price: { id: 'price_pro_test' } }],
      },
    });

    const { POST } = await import('@/app/api/stripe/webhook/route');

    const rawBody = JSON.stringify({ event: 'test' });
    const signature = `t=${Math.floor(Date.now() / 1000)},v1=test`;
    const request = new NextRequest('https://memoriza.app/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': signature,
        'x-vercel-forwarded-for': '3.18.12.63',
      },
      body: rawBody,
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true, outcome: 'applied' });
    expect(mocks.webhookConstructEvent).toHaveBeenCalledWith(
      rawBody,
      signature,
      'whsec_test'
    );
    expect(admin.profilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        is_pro: true,
        subscription_status: 'active',
        subscription_tier: 'pro',
        stripe_customer_id: 'cus_123',
      })
    );
    expect(admin.subscriptionsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe_subscription_id: 'sub_123',
        status: 'active',
      }),
      expect.objectContaining({
        onConflict: 'stripe_subscription_id',
      })
    );
    expect(mocks.finalizeEvent).toHaveBeenCalledWith(
      'evt_checkout_completed',
      'applied',
      expect.any(String),
      expect.any(Number)
    );
  });

  it('processes checkout.session.completed using subscription metadata fallback when session metadata is missing', async () => {
    const admin = createAdminSupabaseClient();
    mocks.adminCreateClient.mockReturnValue(admin.client);
    mocks.webhookConstructEvent.mockReturnValue({
      id: 'evt_checkout_completed_fallback',
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'subscription',
          subscription: 'sub_123_fallback',
          customer: 'cus_123_fallback',
          metadata: {},
        },
      },
    });
    mocks.subscriptionRetrieve.mockResolvedValue({
      id: 'sub_123_fallback',
      metadata: { user_id: 'user_from_subscription_metadata' },
      current_period_start: 1700000000,
      current_period_end: 1710000000,
      cancel_at_period_end: false,
      items: {
        data: [{ price: { id: 'price_pro_test' } }],
      },
    });

    const { POST } = await import('@/app/api/stripe/webhook/route');

    const request = new NextRequest('https://memoriza.app/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=test`,
        'x-vercel-forwarded-for': '3.18.12.63',
      },
      body: JSON.stringify({ event: 'checkout-fallback' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true, outcome: 'applied' });
    expect(admin.subscriptionsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user_from_subscription_metadata',
        stripe_subscription_id: 'sub_123_fallback',
        stripe_customer_id: 'cus_123_fallback',
        status: 'active',
      }),
      expect.objectContaining({
        onConflict: 'stripe_subscription_id',
      })
    );
  });

  it('processes customer.subscription.deleted and downgrades user', async () => {
    const admin = createAdminSupabaseClient({
      profileLookupByCustomer: { id: 'user_1' },
    });
    mocks.adminCreateClient.mockReturnValue(admin.client);
    mocks.webhookConstructEvent.mockReturnValue({
      id: 'evt_subscription_deleted',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_123',
        },
      },
    });

    const { POST } = await import('@/app/api/stripe/webhook/route');

    const request = new NextRequest('https://memoriza.app/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=test`,
        'x-vercel-forwarded-for': '3.18.12.63',
      },
      body: JSON.stringify({ event: 'test' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true, outcome: 'applied' });
    expect(admin.profilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        is_pro: false,
        subscription_status: 'canceled',
        subscription_tier: 'free',
      })
    );
    expect(admin.subscriptionsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe_subscription_id: 'sub_123',
        status: 'canceled',
      }),
      expect.objectContaining({
        onConflict: 'stripe_subscription_id',
      })
    );
    expect(mocks.finalizeEvent).toHaveBeenCalledWith(
      'evt_subscription_deleted',
      'applied',
      expect.any(String),
      expect.any(Number)
    );
  });

  it('returns 400 and records failed attempt when signature verification fails', async () => {
    const admin = createAdminSupabaseClient();
    mocks.adminCreateClient.mockReturnValue(admin.client);
    mocks.webhookConstructEvent.mockImplementation(() => {
      throw new Error('invalid signature');
    });

    const { POST } = await import('@/app/api/stripe/webhook/route');

    const request = new NextRequest('https://memoriza.app/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=bad`,
        'x-vercel-forwarded-for': '3.18.12.63',
      },
      body: JSON.stringify({ event: 'bad' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain('Signature verification failed');
    expect(mocks.recordFailedAttempt).toHaveBeenCalledWith('3.18.12.63');
    expect(mocks.checkEventIdempotencyAtomic).not.toHaveBeenCalled();
    expect(mocks.finalizeEvent).not.toHaveBeenCalled();
  });

  it('returns duplicate ack and skips processing when event is not new', async () => {
    const admin = createAdminSupabaseClient({
      profileLookupByCustomer: { id: 'user_1' },
    });
    mocks.adminCreateClient.mockReturnValue(admin.client);
    mocks.webhookConstructEvent.mockReturnValue({
      id: 'evt_duplicate_123',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_123',
        },
      },
    });
    mocks.checkEventIdempotencyAtomic.mockResolvedValue({ isNew: false });

    const { POST } = await import('@/app/api/stripe/webhook/route');

    const request = new NextRequest('https://memoriza.app/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=test`,
        'x-vercel-forwarded-for': '3.18.12.63',
      },
      body: JSON.stringify({ event: 'duplicate' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true, duplicate: true });
    expect(admin.profilesUpdate).not.toHaveBeenCalled();
    expect(admin.subscriptionsUpdate).not.toHaveBeenCalled();
    expect(mocks.finalizeEvent).not.toHaveBeenCalled();
  });

  it('syncs plan and period for existing subscriber on customer.subscription.updated', async () => {
    const admin = createAdminSupabaseClient({
      profileLookupByCustomer: { id: 'user_renew' },
      existingSubscription: {
        stripe_subscription_id: 'sub_renew_123',
        price_id: 'price_pro_old',
        status: 'active',
        current_period_start: 1700000000000,
        current_period_end: 1702500000000,
        cancel_at_period_end: false,
      },
    });
    mocks.adminCreateClient.mockReturnValue(admin.client);
    mocks.webhookConstructEvent.mockReturnValue({
      id: 'evt_subscription_renewed',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_renew_123',
          customer: 'cus_renew_123',
          status: 'active',
          cancel_at_period_end: false,
          current_period_start: 1710000000,
          current_period_end: 1712592000,
          items: {
            data: [{ price: { id: 'price_pro_test' } }],
          },
        },
      },
    });

    const { POST } = await import('@/app/api/stripe/webhook/route');

    const request = new NextRequest('https://memoriza.app/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=test`,
        'x-vercel-forwarded-for': '3.18.12.63',
      },
      body: JSON.stringify({ event: 'test' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true, outcome: 'applied' });
    expect(admin.profilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        is_pro: true,
        subscription_status: 'active',
        subscription_tier: 'pro',
        subscription_period_end: 1712592000000,
      })
    );
    expect(admin.subscriptionsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe_subscription_id: 'sub_renew_123',
        status: 'active',
        price_id: 'price_pro_test',
        current_period_start: 1710000000000,
        current_period_end: 1712592000000,
        cancel_at_period_end: false,
      }),
      expect.objectContaining({
        onConflict: 'stripe_subscription_id',
      })
    );
    expect(admin.subscriptionState?.price_id).toBe('price_pro_test');
    expect(admin.subscriptionState?.current_period_end).toBe(1712592000000);
    expect(mocks.finalizeEvent).toHaveBeenCalledWith(
      'evt_subscription_renewed',
      'applied',
      expect.any(String),
      expect.any(Number)
    );
  });

  it('syncs period from subscription item fields when root period fields are missing', async () => {
    const admin = createAdminSupabaseClient({
      profileLookupByCustomer: { id: 'user_item_period' },
      existingSubscription: {
        stripe_subscription_id: 'sub_item_period_123',
        price_id: 'price_pro_old',
        status: 'active',
        current_period_start: 1700000000000,
        current_period_end: 1702500000000,
        cancel_at_period_end: false,
      },
    });
    mocks.adminCreateClient.mockReturnValue(admin.client);
    mocks.webhookConstructEvent.mockReturnValue({
      id: 'evt_subscription_item_period',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_item_period_123',
          customer: 'cus_item_period_123',
          status: 'active',
          cancel_at_period_end: false,
          items: {
            data: [{
              price: { id: 'price_pro_test' },
              current_period_start: 1720000000,
              current_period_end: 1722592000,
            }],
          },
        },
      },
    });

    const { POST } = await import('@/app/api/stripe/webhook/route');

    const request = new NextRequest('https://memoriza.app/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=test`,
        'x-vercel-forwarded-for': '3.18.12.63',
      },
      body: JSON.stringify({ event: 'item-period' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true, outcome: 'applied' });
    expect(admin.profilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription_period_end: 1722592000000,
      })
    );
    expect(admin.subscriptionsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe_subscription_id: 'sub_item_period_123',
        current_period_start: 1720000000000,
        current_period_end: 1722592000000,
      }),
      expect.objectContaining({
        onConflict: 'stripe_subscription_id',
      })
    );
    expect(admin.subscriptionState?.current_period_start).toBe(1720000000000);
    expect(admin.subscriptionState?.current_period_end).toBe(1722592000000);
  });

  it('processes invoice.paid and confirms active paid renewal state', async () => {
    const admin = createAdminSupabaseClient({
      profileLookupByCustomer: { id: 'user_invoice_paid' },
      existingSubscription: {
        stripe_subscription_id: 'sub_invoice_paid_123',
        price_id: 'price_pro_old',
        status: 'past_due',
        current_period_start: 1720000000000,
        current_period_end: 1722592000000,
        cancel_at_period_end: false,
      },
    });
    mocks.adminCreateClient.mockReturnValue(admin.client);
    mocks.webhookConstructEvent.mockReturnValue({
      id: 'evt_invoice_paid_123',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_123',
          customer: 'cus_invoice_paid_123',
          subscription: 'sub_invoice_paid_123',
          lines: {
            data: [{
              price: { id: 'price_pro_test' },
              period: {
                start: 1730000000,
                end: 1732592000,
              },
            }],
          },
        },
      },
    });

    const { POST } = await import('@/app/api/stripe/webhook/route');

    const request = new NextRequest('https://memoriza.app/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=test`,
        'x-vercel-forwarded-for': '3.18.12.63',
      },
      body: JSON.stringify({ event: 'invoice-paid' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true, outcome: 'applied' });
    expect(admin.profilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        is_pro: true,
        subscription_status: 'active',
        subscription_tier: 'pro',
        subscription_period_end: 1732592000000,
      })
    );
    expect(admin.subscriptionsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe_subscription_id: 'sub_invoice_paid_123',
        status: 'active',
        price_id: 'price_pro_test',
        current_period_start: 1730000000000,
        current_period_end: 1732592000000,
      }),
      expect.objectContaining({
        onConflict: 'stripe_subscription_id',
      })
    );
    expect(admin.subscriptionState?.status).toBe('active');
    expect(admin.subscriptionState?.price_id).toBe('price_pro_test');
    expect(admin.subscriptionState?.current_period_end).toBe(1732592000000);
    expect(mocks.finalizeEvent).toHaveBeenCalledWith(
      'evt_invoice_paid_123',
      'applied',
      expect.any(String),
      expect.any(Number)
    );
  });

  it('processes invoice.paid resolving user via subscription mapping fallback', async () => {
    const admin = createAdminSupabaseClient({
      profileLookupByCustomer: null,
      existingSubscription: {
        user_id: 'user_from_subscription_row',
        stripe_subscription_id: 'sub_invoice_fallback_123',
        stripe_customer_id: 'cus_invoice_fallback_mapped',
        price_id: 'price_pro_old',
        status: 'past_due',
        current_period_start: 1720000000000,
        current_period_end: 1722592000000,
        cancel_at_period_end: false,
      },
    });
    mocks.adminCreateClient.mockReturnValue(admin.client);
    mocks.webhookConstructEvent.mockReturnValue({
      id: 'evt_invoice_paid_fallback_123',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_fallback_123',
          customer: 'cus_invoice_event_mismatch',
          subscription: 'sub_invoice_fallback_123',
          lines: {
            data: [{
              price: { id: 'price_pro_test' },
              period: {
                start: 1730000000,
                end: 1732592000,
              },
            }],
          },
        },
      },
    });

    const { POST } = await import('@/app/api/stripe/webhook/route');

    const request = new NextRequest('https://memoriza.app/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=test`,
        'x-vercel-forwarded-for': '3.18.12.63',
      },
      body: JSON.stringify({ event: 'invoice-paid-fallback' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true, outcome: 'applied' });
    expect(admin.subscriptionsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user_from_subscription_row',
        stripe_subscription_id: 'sub_invoice_fallback_123',
        stripe_customer_id: 'cus_invoice_fallback_mapped',
        status: 'active',
      }),
      expect.objectContaining({
        onConflict: 'stripe_subscription_id',
      })
    );
  });

  it('processes invoice.paid with multiple lines and picks the main subscription line', async () => {
    const admin = createAdminSupabaseClient({
      profileLookupByCustomer: { id: 'user_invoice_multi' },
      existingSubscription: {
        stripe_subscription_id: 'sub_invoice_multi_123',
        price_id: 'price_pro_old',
        status: 'past_due',
        current_period_start: 1720000000000,
        current_period_end: 1722592000000,
        cancel_at_period_end: false,
      },
    });
    mocks.adminCreateClient.mockReturnValue(admin.client);
    mocks.webhookConstructEvent.mockReturnValue({
      id: 'evt_invoice_paid_multi_123',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_multi_123',
          customer: 'cus_invoice_multi_123',
          subscription: 'sub_invoice_multi_123',
          lines: {
            data: [
              {
                price: { id: 'price_proration' },
                proration: true,
                type: 'subscription',
                period: {
                  start: 1725000000,
                  end: 1727000000,
                },
              },
              {
                price: { id: 'price_pro_test', recurring: { interval: 'month' } },
                proration: false,
                type: 'subscription',
                subscription_item: 'si_123',
                period: {
                  start: 1731000000,
                  end: 1733592000,
                },
              },
            ],
          },
        },
      },
    });

    const { POST } = await import('@/app/api/stripe/webhook/route');

    const request = new NextRequest('https://memoriza.app/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=test`,
        'x-vercel-forwarded-for': '3.18.12.63',
      },
      body: JSON.stringify({ event: 'invoice-paid-multi' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true, outcome: 'applied' });
    expect(admin.profilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription_tier: 'pro',
        subscription_period_end: 1733592000000,
      })
    );
    expect(admin.subscriptionsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe_subscription_id: 'sub_invoice_multi_123',
        price_id: 'price_pro_test',
        current_period_start: 1731000000000,
        current_period_end: 1733592000000,
      }),
      expect.objectContaining({
        onConflict: 'stripe_subscription_id',
      })
    );
  });

  it('ignores invoice.paid without subscription id and still acknowledges webhook', async () => {
    const admin = createAdminSupabaseClient({
      profileLookupByCustomer: { id: 'user_invoice_no_sub' },
    });
    mocks.adminCreateClient.mockReturnValue(admin.client);
    mocks.webhookConstructEvent.mockReturnValue({
      id: 'evt_invoice_paid_no_sub',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_no_sub_123',
          customer: 'cus_invoice_no_sub',
          lines: {
            data: [{
              price: { id: 'price_pro_test' },
              period: {
                start: 1731000000,
                end: 1733592000,
              },
            }],
          },
        },
      },
    });

    const { POST } = await import('@/app/api/stripe/webhook/route');

    const request = new NextRequest('https://memoriza.app/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=test`,
        'x-vercel-forwarded-for': '3.18.12.63',
      },
      body: JSON.stringify({ event: 'invoice-paid-no-sub' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true, outcome: 'ignored' });
    expect(admin.profilesUpdate).not.toHaveBeenCalled();
    expect(admin.subscriptionsUpdate).not.toHaveBeenCalled();
    expect(mocks.finalizeEvent).toHaveBeenCalledWith(
      'evt_invoice_paid_no_sub',
      'ignored',
      expect.any(String),
      expect.any(Number)
    );
  });

  it('returns duplicate ack and skips processing for duplicate invoice.paid event', async () => {
    const admin = createAdminSupabaseClient({
      profileLookupByCustomer: { id: 'user_invoice_dup' },
      existingSubscription: {
        stripe_subscription_id: 'sub_invoice_dup_123',
        price_id: 'price_pro_old',
        status: 'active',
        current_period_start: 1720000000000,
        current_period_end: 1722592000000,
        cancel_at_period_end: false,
      },
    });
    mocks.adminCreateClient.mockReturnValue(admin.client);
    mocks.webhookConstructEvent.mockReturnValue({
      id: 'evt_invoice_paid_dup_123',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_dup_123',
          customer: 'cus_invoice_dup',
          subscription: 'sub_invoice_dup_123',
          lines: {
            data: [{
              price: { id: 'price_pro_test' },
              period: {
                start: 1731000000,
                end: 1733592000,
              },
            }],
          },
        },
      },
    });
    mocks.checkEventIdempotencyAtomic.mockResolvedValue({ isNew: false });

    const { POST } = await import('@/app/api/stripe/webhook/route');

    const request = new NextRequest('https://memoriza.app/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=test`,
        'x-vercel-forwarded-for': '3.18.12.63',
      },
      body: JSON.stringify({ event: 'invoice-paid-dup' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true, duplicate: true });
    expect(admin.profilesUpdate).not.toHaveBeenCalled();
    expect(admin.subscriptionsUpdate).not.toHaveBeenCalled();
    expect(mocks.finalizeEvent).not.toHaveBeenCalled();
  });

  it('processes invoice.payment_failed and marks profile as past_due', async () => {
    const admin = createAdminSupabaseClient({
      profileLookupByCustomer: { id: 'user_invoice_failed' },
      existingSubscription: {
        stripe_subscription_id: 'sub_invoice_failed_123',
        price_id: 'price_pro_test',
        status: 'active',
        current_period_start: 1730000000000,
        current_period_end: 1732592000000,
        cancel_at_period_end: false,
      },
    });
    mocks.adminCreateClient.mockReturnValue(admin.client);
    mocks.webhookConstructEvent.mockReturnValue({
      id: 'evt_invoice_failed_123',
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_failed_123',
          customer: 'cus_invoice_failed_123',
          subscription: 'sub_invoice_failed_123',
        },
      },
    });

    const { POST } = await import('@/app/api/stripe/webhook/route');

    const request = new NextRequest('https://memoriza.app/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=test`,
        'x-vercel-forwarded-for': '3.18.12.63',
      },
      body: JSON.stringify({ event: 'invoice-failed' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true, outcome: 'applied' });
    expect(admin.profilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription_status: 'past_due',
      })
    );
    expect(admin.subscriptionsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe_subscription_id: 'sub_invoice_failed_123',
        status: 'past_due',
      }),
      expect.objectContaining({
        onConflict: 'stripe_subscription_id',
      })
    );
    expect(admin.subscriptionState?.status).toBe('past_due');
    expect(mocks.finalizeEvent).toHaveBeenCalledWith(
      'evt_invoice_failed_123',
      'applied',
      expect.any(String),
      expect.any(Number)
    );
  });

  it('covers checkout -> webhook upgrade -> cancelamento agendado -> downgrade por cancelamento efetivo', async () => {
    mocks.getSubscriptionTier.mockImplementation((priceId: string | null) => {
      if (priceId === 'price_enterprise_test') return 'enterprise';
      if (priceId === 'price_pro_test') return 'pro';
      return 'free';
    });

    const supabase = createServerSupabaseClient({
      user: { id: 'user_full_flow', email: 'flow@example.com', user_metadata: { name: 'Flow' } },
    });
    mocks.createServerClient.mockResolvedValue(supabase.client);
    mocks.getOrCreateCustomer.mockResolvedValue('cus_full_123');
    mocks.checkoutSessionCreate.mockResolvedValue({
      id: 'cs_full_123',
      url: 'https://checkout.stripe.com/full',
    });

    const admin = createAdminSupabaseClient({
      profileLookupByCustomer: { id: 'user_full_flow' },
      existingProfile: {
        id: 'user_full_flow',
        is_pro: false,
        subscription_status: 'free',
        subscription_tier: 'free',
        subscription_period_end: null,
        stripe_customer_id: null,
      },
    });
    mocks.adminCreateClient.mockReturnValue(admin.client);

    mocks.subscriptionRetrieve.mockResolvedValue({
      id: 'sub_full_123',
      current_period_start: 1700000000,
      current_period_end: 1710000000,
      cancel_at_period_end: false,
      items: {
        data: [{ price: { id: 'price_pro_test' } }],
      },
    });
    mocks.webhookConstructEvent
      .mockReturnValueOnce({
        id: 'evt_full_checkout',
        type: 'checkout.session.completed',
        data: {
          object: {
            mode: 'subscription',
            subscription: 'sub_full_123',
            customer: 'cus_full_123',
            metadata: { user_id: 'user_full_flow' },
          },
        },
      })
      .mockReturnValueOnce({
        id: 'evt_full_cancel_scheduled',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_full_123',
            customer: 'cus_full_123',
            status: 'active',
            cancel_at_period_end: true,
            current_period_start: 1710000000,
            current_period_end: 1712592000,
            items: {
              data: [{ price: { id: 'price_enterprise_test' } }],
            },
          },
        },
      })
      .mockReturnValueOnce({
        id: 'evt_full_deleted',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_full_123',
            customer: 'cus_full_123',
          },
        },
      });

    const { POST: checkoutPOST } = await import('@/app/api/stripe/create-checkout/route');
    const { POST: webhookPOST } = await import('@/app/api/stripe/webhook/route');

    const checkoutRequest = new NextRequest('https://memoriza.app/api/stripe/create-checkout', {
      method: 'POST',
      headers: { origin: 'https://memoriza.app', 'content-type': 'application/json' },
      body: JSON.stringify({ planKey: 'pro_monthly' }),
    });

    const checkoutResponse = await checkoutPOST(checkoutRequest);
    expect(checkoutResponse.status).toBe(200);

    const firstWebhookResponse = await webhookPOST(new NextRequest('https://memoriza.app/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=test`,
        'x-vercel-forwarded-for': '3.18.12.63',
      },
      body: JSON.stringify({ event: 'full-checkout' }),
    }));
    expect(firstWebhookResponse.status).toBe(200);
    expect(admin.profileState?.subscription_status).toBe('active');
    expect(admin.profileState?.subscription_tier).toBe('pro');
    expect(admin.profileState?.is_pro).toBe(true);

    const secondWebhookResponse = await webhookPOST(new NextRequest('https://memoriza.app/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=test`,
        'x-vercel-forwarded-for': '3.18.12.63',
      },
      body: JSON.stringify({ event: 'full-cancel-scheduled' }),
    }));
    expect(secondWebhookResponse.status).toBe(200);
    expect(admin.profileState?.subscription_status).toBe('active');
    expect(admin.profileState?.subscription_tier).toBe('enterprise');
    expect(admin.profileState?.is_pro).toBe(true);
    expect(admin.subscriptionState?.cancel_at_period_end).toBe(true);
    expect(admin.subscriptionState?.price_id).toBe('price_enterprise_test');

    const thirdWebhookResponse = await webhookPOST(new NextRequest('https://memoriza.app/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=test`,
        'x-vercel-forwarded-for': '3.18.12.63',
      },
      body: JSON.stringify({ event: 'full-deleted' }),
    }));
    expect(thirdWebhookResponse.status).toBe(200);
    expect(admin.profileState?.subscription_status).toBe('canceled');
    expect(admin.profileState?.subscription_tier).toBe('free');
    expect(admin.profileState?.is_pro).toBe(false);
    expect(admin.subscriptionState?.status).toBe('canceled');
  });

  it('covers falha de pagamento seguida de recuperação via invoice.paid', async () => {
    const admin = createAdminSupabaseClient({
      profileLookupByCustomer: { id: 'user_recovery' },
      existingProfile: {
        id: 'user_recovery',
        is_pro: true,
        subscription_status: 'active',
        subscription_tier: 'pro',
        subscription_period_end: 1732592000000,
        stripe_customer_id: 'cus_recovery',
      },
      existingSubscription: {
        stripe_subscription_id: 'sub_recovery_123',
        price_id: 'price_pro_test',
        status: 'active',
        current_period_start: 1730000000000,
        current_period_end: 1732592000000,
        cancel_at_period_end: false,
      },
    });
    mocks.adminCreateClient.mockReturnValue(admin.client);
    mocks.webhookConstructEvent
      .mockReturnValueOnce({
        id: 'evt_recovery_failed',
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'in_recovery_failed',
            customer: 'cus_recovery',
            parent: {
              subscription_details: {
                subscription: 'sub_recovery_123',
              },
            },
          },
        },
      })
      .mockReturnValueOnce({
        id: 'evt_recovery_paid',
        type: 'invoice.paid',
        data: {
          object: {
            id: 'in_recovery_paid',
            customer: 'cus_recovery',
            parent: {
              subscription_details: {
                subscription: 'sub_recovery_123',
              },
            },
            lines: {
              data: [{
                type: 'subscription',
                proration: false,
                subscription_item: 'si_recovery_123',
                price: { id: 'price_pro_test', recurring: { interval: 'month' } },
                period: {
                  start: 1740000000,
                  end: 1742592000,
                },
              }],
            },
          },
        },
      });

    const { POST } = await import('@/app/api/stripe/webhook/route');

    const failedResponse = await POST(new NextRequest('https://memoriza.app/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=test`,
        'x-vercel-forwarded-for': '3.18.12.63',
      },
      body: JSON.stringify({ event: 'recovery-failed' }),
    }));
    expect(failedResponse.status).toBe(200);
    expect(admin.profileState?.subscription_status).toBe('past_due');
    expect(admin.subscriptionState?.status).toBe('past_due');

    const paidResponse = await POST(new NextRequest('https://memoriza.app/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=test`,
        'x-vercel-forwarded-for': '3.18.12.63',
      },
      body: JSON.stringify({ event: 'recovery-paid' }),
    }));
    expect(paidResponse.status).toBe(200);
    expect(admin.profileState?.subscription_status).toBe('active');
    expect(admin.profileState?.subscription_tier).toBe('pro');
    expect(admin.profileState?.is_pro).toBe(true);
    expect(admin.profileState?.subscription_period_end).toBe(1742592000000);
    expect(admin.subscriptionState?.status).toBe('active');
    expect(admin.subscriptionState?.current_period_start).toBe(1740000000000);
    expect(admin.subscriptionState?.current_period_end).toBe(1742592000000);
  });

  // ================================================================
  // REGRESSION: permanent_failure outcomes
  // ================================================================

  it('returns permanent_failure when checkout.session.completed has no user_id', async () => {
    const admin = createAdminSupabaseClient();
    mocks.adminCreateClient.mockReturnValue(admin.client);
    mocks.webhookConstructEvent.mockReturnValue({
      id: 'evt_checkout_no_user',
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'subscription',
          subscription: 'sub_orphan_123',
          customer: 'cus_orphan_123',
          metadata: {},  // no user_id
        },
      },
    });
    mocks.subscriptionRetrieve.mockResolvedValue({
      id: 'sub_orphan_123',
      metadata: {},  // no user_id here either
      current_period_start: 1700000000,
      current_period_end: 1710000000,
      cancel_at_period_end: false,
      items: {
        data: [{ price: { id: 'price_pro_test' } }],
      },
    });

    const { POST } = await import('@/app/api/stripe/webhook/route');

    const request = new NextRequest('https://memoriza.app/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=test`,
        'x-vercel-forwarded-for': '3.18.12.63',
      },
      body: JSON.stringify({ event: 'checkout-no-user' }),
    });

    const response = await POST(request);
    const json = await response.json();

    // permanent_failure returns 200 to stop Stripe retries
    expect(response.status).toBe(200);
    expect(json.outcome).toBe('permanent_failure');
    expect(json.reason).toContain('user_id');
    // profile must NOT be updated
    expect(admin.profilesUpdate).not.toHaveBeenCalled();
    expect(admin.subscriptionsUpsert).not.toHaveBeenCalled();
    expect(mocks.finalizeEvent).toHaveBeenCalledWith(
      'evt_checkout_no_user',
      'permanent_failure',
      expect.any(String),
      expect.any(Number)
    );
  });

  it('returns permanent_failure when subscription.updated identity is unresolvable', async () => {
    // No profileLookupByCustomer → identity resolution returns null
    const admin = createAdminSupabaseClient();
    mocks.adminCreateClient.mockReturnValue(admin.client);
    mocks.webhookConstructEvent.mockReturnValue({
      id: 'evt_sub_updated_no_identity',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_ghost_123',
          customer: 'cus_ghost_123',
          status: 'active',
          cancel_at_period_end: false,
          current_period_start: 1710000000,
          current_period_end: 1712592000,
          items: {
            data: [{ price: { id: 'price_pro_test' } }],
          },
        },
      },
    });
    // Stripe fallback also returns no user metadata
    mocks.subscriptionRetrieve.mockResolvedValue({
      id: 'sub_ghost_123',
      customer: 'cus_ghost_123',
      metadata: {},
    });

    const { POST } = await import('@/app/api/stripe/webhook/route');

    const request = new NextRequest('https://memoriza.app/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=test`,
        'x-vercel-forwarded-for': '3.18.12.63',
      },
      body: JSON.stringify({ event: 'sub-updated-no-identity' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.outcome).toBe('permanent_failure');
    expect(json.reason).toContain('identity');
    expect(admin.profilesUpdate).not.toHaveBeenCalled();
    expect(mocks.finalizeEvent).toHaveBeenCalledWith(
      'evt_sub_updated_no_identity',
      'permanent_failure',
      expect.any(String),
      expect.any(Number)
    );
  });

  it('returns permanent_failure when subscription.deleted identity is unresolvable', async () => {
    const admin = createAdminSupabaseClient();
    mocks.adminCreateClient.mockReturnValue(admin.client);
    mocks.webhookConstructEvent.mockReturnValue({
      id: 'evt_sub_deleted_no_identity',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_vanished_123',
          customer: 'cus_vanished_123',
        },
      },
    });
    mocks.subscriptionRetrieve.mockResolvedValue({
      id: 'sub_vanished_123',
      customer: 'cus_vanished_123',
      metadata: {},
    });

    const { POST } = await import('@/app/api/stripe/webhook/route');

    const request = new NextRequest('https://memoriza.app/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=test`,
        'x-vercel-forwarded-for': '3.18.12.63',
      },
      body: JSON.stringify({ event: 'sub-deleted-no-identity' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.outcome).toBe('permanent_failure');
    expect(admin.profilesUpdate).not.toHaveBeenCalled();
    expect(admin.subscriptionsUpsert).not.toHaveBeenCalled();
    expect(mocks.finalizeEvent).toHaveBeenCalledWith(
      'evt_sub_deleted_no_identity',
      'permanent_failure',
      expect.any(String),
      expect.any(Number)
    );
  });

  it('returns permanent_failure when invoice.paid identity is unresolvable', async () => {
    const admin = createAdminSupabaseClient();
    mocks.adminCreateClient.mockReturnValue(admin.client);
    mocks.webhookConstructEvent.mockReturnValue({
      id: 'evt_invoice_paid_no_identity',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_orphan_123',
          customer: 'cus_nobody_123',
          parent: {
            subscription_details: {
              subscription: 'sub_nobody_123',
            },
          },
          lines: {
            data: [{
              price: { id: 'price_pro_test' },
              period: { start: 1730000000, end: 1732592000 },
            }],
          },
        },
      },
    });
    mocks.subscriptionRetrieve.mockResolvedValue({
      id: 'sub_nobody_123',
      customer: 'cus_nobody_123',
      metadata: {},
    });

    const { POST } = await import('@/app/api/stripe/webhook/route');

    const request = new NextRequest('https://memoriza.app/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=test`,
        'x-vercel-forwarded-for': '3.18.12.63',
      },
      body: JSON.stringify({ event: 'invoice-paid-no-identity' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.outcome).toBe('permanent_failure');
    expect(admin.profilesUpdate).not.toHaveBeenCalled();
    expect(mocks.finalizeEvent).toHaveBeenCalledWith(
      'evt_invoice_paid_no_identity',
      'permanent_failure',
      expect.any(String),
      expect.any(Number)
    );
  });

  // ================================================================
  // REGRESSION: transient_failure outcomes
  // ================================================================

  it('returns 500 (transient_failure) when profile update fails on checkout.session.completed', async () => {
    const admin = createAdminSupabaseClient();
    mocks.adminCreateClient.mockReturnValue(admin.client);
    // Override profilesUpdate to return a DB error
    admin.profilesUpdate.mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        error: { message: 'connection timeout', code: '57P01' },
      }),
    });

    mocks.webhookConstructEvent.mockReturnValue({
      id: 'evt_checkout_db_fail',
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'subscription',
          subscription: 'sub_dbfail_123',
          customer: 'cus_dbfail_123',
          metadata: { user_id: 'user_dbfail' },
        },
      },
    });
    mocks.subscriptionRetrieve.mockResolvedValue({
      id: 'sub_dbfail_123',
      current_period_start: 1700000000,
      current_period_end: 1710000000,
      cancel_at_period_end: false,
      items: {
        data: [{ price: { id: 'price_pro_test' } }],
      },
    });

    const { POST } = await import('@/app/api/stripe/webhook/route');

    const request = new NextRequest('https://memoriza.app/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=test`,
        'x-vercel-forwarded-for': '3.18.12.63',
      },
      body: JSON.stringify({ event: 'checkout-db-fail' }),
    });

    const response = await POST(request);
    const json = await response.json();

    // transient_failure returns 500 so Stripe retries
    expect(response.status).toBe(500);
    expect(json.outcome).toBe('transient_failure');
    expect(json.reason).toContain('Profile update failed');
    // subscription upsert must NOT have been called (profile update failed first)
    expect(admin.subscriptionsUpsert).not.toHaveBeenCalled();
    expect(mocks.finalizeEvent).toHaveBeenCalledWith(
      'evt_checkout_db_fail',
      'transient_failure',
      expect.any(String),
      expect.any(Number)
    );
  });

  it('returns 500 (transient_failure) when subscription upsert fails on customer.subscription.updated', async () => {
    const admin = createAdminSupabaseClient({
      profileLookupByCustomer: { id: 'user_sub_upsert_fail' },
    });
    mocks.adminCreateClient.mockReturnValue(admin.client);
    // Override subscriptionsUpsert to return a DB error
    admin.subscriptionsUpsert.mockResolvedValue({
      error: { message: 'deadlock detected', code: '40P01' },
    });

    mocks.webhookConstructEvent.mockReturnValue({
      id: 'evt_sub_updated_db_fail',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_upsert_fail_123',
          customer: 'cus_upsert_fail_123',
          status: 'active',
          cancel_at_period_end: false,
          current_period_start: 1710000000,
          current_period_end: 1712592000,
          items: {
            data: [{ price: { id: 'price_pro_test' } }],
          },
        },
      },
    });

    const { POST } = await import('@/app/api/stripe/webhook/route');

    const request = new NextRequest('https://memoriza.app/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=test`,
        'x-vercel-forwarded-for': '3.18.12.63',
      },
      body: JSON.stringify({ event: 'sub-updated-db-fail' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.outcome).toBe('transient_failure');
    expect(json.reason).toContain('Subscription upsert failed');
    // profile WAS updated (it succeeded), but sub failed
    expect(admin.profilesUpdate).toHaveBeenCalled();
    expect(mocks.finalizeEvent).toHaveBeenCalledWith(
      'evt_sub_updated_db_fail',
      'transient_failure',
      expect.any(String),
      expect.any(Number)
    );
  });
});

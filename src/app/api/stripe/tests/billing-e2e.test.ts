import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getOrCreateCustomer: vi.fn(),
  checkoutSessionCreate: vi.fn(),
  portalSessionCreate: vi.fn(),
  webhookConstructEvent: vi.fn(),
  subscriptionRetrieve: vi.fn(),
  getSubscriptionTier: vi.fn(),
  adminCreateClient: vi.fn(),
  runSecurityChecks: vi.fn(),
  getClientIP: vi.fn(),
  isStripeIP: vi.fn(),
  logWebhookAttempt: vi.fn(),
  recordFailedAttempt: vi.fn(),
  checkEventIdempotencyAtomic: vi.fn(),
  markEventProcessed: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createServerClient,
}));

vi.mock('@/lib/billing/stripe', () => ({
  stripe: {
    checkout: { sessions: { create: mocks.checkoutSessionCreate } },
    billingPortal: { sessions: { create: mocks.portalSessionCreate } },
    webhooks: { constructEvent: mocks.webhookConstructEvent },
    subscriptions: { retrieve: mocks.subscriptionRetrieve },
  },
  getOrCreateCustomer: mocks.getOrCreateCustomer,
  getSubscriptionTier: mocks.getSubscriptionTier,
  PRO_PRICE_ID: 'price_pro_test',
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
  markEventProcessed: mocks.markEventProcessed,
}));

function createServerSupabaseClient(options?: {
  user?: { id: string; email?: string | null; user_metadata?: { name?: string } } | null;
  authError?: unknown;
  profile?: { stripe_customer_id?: string | null } | null;
}) {
  const getUser = vi.fn().mockResolvedValue({
    data: { user: options?.user ?? null },
    error: options?.authError ?? null,
  });

  const profileSingle = vi.fn().mockResolvedValue({
    data: options?.profile ?? null,
    error: null,
  });

  const from = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: profileSingle,
      }),
    }),
  });

  return {
    client: {
      auth: { getUser },
      from,
    },
    profileSingle,
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
  mocks.markEventProcessed.mockResolvedValue(undefined);
  mocks.getSubscriptionTier.mockImplementation((priceId: string | null) => (
    priceId === 'price_pro_test' ? 'pro' : 'free'
  ));
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
      body: JSON.stringify({ priceId: 'price_pro_test' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      sessionId: 'cs_test_123',
      url: 'https://checkout.stripe.com/test',
    });
    expect(mocks.checkoutSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_123',
        mode: 'subscription',
        success_url: expect.stringContaining('https://memoriza.app/dashboard?checkout=success'),
        cancel_url: 'https://memoriza.app/dashboard?checkout=canceled',
      })
    );
  });

  it('rejects unallowed price id', async () => {
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
    expect(json).toEqual({ error: 'Invalid price ID' });
    expect(mocks.getOrCreateCustomer).not.toHaveBeenCalled();
    expect(mocks.checkoutSessionCreate).not.toHaveBeenCalled();
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
    expect(json).toEqual({ received: true });
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
    expect(mocks.markEventProcessed).toHaveBeenCalledWith(
      'evt_checkout_completed',
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
    expect(json).toEqual({ received: true });
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
    expect(json).toEqual({ received: true });
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
    expect(mocks.markEventProcessed).toHaveBeenCalledWith(
      'evt_subscription_deleted',
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
    expect(mocks.markEventProcessed).not.toHaveBeenCalled();
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
    expect(mocks.markEventProcessed).not.toHaveBeenCalled();
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
    expect(json).toEqual({ received: true });
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
    expect(mocks.markEventProcessed).toHaveBeenCalledWith(
      'evt_subscription_renewed',
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
    expect(json).toEqual({ received: true });
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
    expect(json).toEqual({ received: true });
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
    expect(mocks.markEventProcessed).toHaveBeenCalledWith(
      'evt_invoice_paid_123',
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
    expect(json).toEqual({ received: true });
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
    expect(json).toEqual({ received: true });
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
    expect(json).toEqual({ received: true });
    expect(admin.profilesUpdate).not.toHaveBeenCalled();
    expect(admin.subscriptionsUpdate).not.toHaveBeenCalled();
    expect(mocks.markEventProcessed).toHaveBeenCalledWith(
      'evt_invoice_paid_no_sub',
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
    expect(mocks.markEventProcessed).not.toHaveBeenCalled();
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
    expect(json).toEqual({ received: true });
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
    expect(mocks.markEventProcessed).toHaveBeenCalledWith(
      'evt_invoice_failed_123',
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
      body: JSON.stringify({ priceId: 'price_pro_test' }),
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
});

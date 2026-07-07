import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  ensureFreeTrialForUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  trackServer: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}));

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}));

vi.mock('@/lib/billing/free-trial', () => ({
  ensureFreeTrialForUser: mocks.ensureFreeTrialForUser,
}));

vi.mock('@/lib/analytics/server-tracker', () => ({
  trackServer: mocks.trackServer,
}));

function createAuthCallbackClient() {
  const insert = vi.fn(async () => ({ error: null }));
  const from = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(async () => ({ data: null, error: null })),
      })),
    })),
    insert,
  }));

  return {
    auth: {
      exchangeCodeForSession: vi.fn(async () => ({
        data: {
          user: {
            id: 'user_signup_trial',
            email: 'signup-trial@example.com',
          },
        },
        error: null,
      })),
      verifyOtp: vi.fn(),
    },
    from,
    insert,
  };
}

describe('auth callback free-trial cutover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('creates a missing profile and activates the free trial after signup confirmation', async () => {
    const client = createAuthCallbackClient();
    const admin = { from: vi.fn() };

    mocks.createClient.mockResolvedValue(client);
    mocks.getSupabaseAdmin.mockReturnValue(admin);
    mocks.ensureFreeTrialForUser.mockResolvedValue({
      activated: true,
      periodStart: 1_700_000_000_000,
      periodEnd: 1_702_592_000_000,
    });

    const { GET } = await import('@/app/auth/callback/route');
    const response = await GET(new NextRequest(
      'https://vimens.app/auth/callback?code=auth-code&type=signup',
    ));

    expect(response.headers.get('location')).toBe('https://vimens.app/email-confirmado');
    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledWith('auth-code');
    expect(client.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'user_signup_trial',
        is_pro: false,
        created_at: expect.any(Number),
        updated_at: expect.any(Number),
      }),
    );
    expect(mocks.ensureFreeTrialForUser).toHaveBeenCalledWith({
      admin,
      userId: 'user_signup_trial',
    });
    expect(mocks.trackServer).toHaveBeenCalledWith(
      'email_confirmed',
      'user_signup_trial',
      { method: 'signup' },
    );
  });
});

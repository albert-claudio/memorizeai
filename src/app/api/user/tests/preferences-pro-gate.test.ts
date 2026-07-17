import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getEffectiveProAccess: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}));

vi.mock('@/lib/billing/effective-pro-access', () => ({
  getEffectiveProAccess: mocks.getEffectiveProAccess,
}));

function request(body: unknown) {
  return new Request('https://memorize.ai/api/user/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeSupabase(existingPreferences: Record<string, unknown> = {}) {
  const upsert = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn(async () => ({
        data: { user_id: 'user_1', ...existingPreferences },
        error: null,
      })),
    })),
  }));

  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: 'user_1' } },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      if (table !== 'user_preferences') throw new Error(`Unexpected table ${table}`);
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { user_id: 'user_1', ...existingPreferences },
              error: null,
            })),
          })),
        })),
        upsert,
      };
    }),
    upsert,
  };
}

describe('/api/user/preferences Pro server gate', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('blocks free users from updating premium preference columns before persistence', async () => {
    const supabase = makeSupabase();
    mocks.createClient.mockResolvedValue(supabase);
    mocks.getEffectiveProAccess.mockResolvedValue(false);

    const { PUT } = await import('@/app/api/user/preferences/route');
    const response = await PUT(request({ fsrs_enabled: true }));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toMatchObject({
      code: 'PRO_REQUIRED',
      upgradeUrl: '/upgrade',
    });
    expect(supabase.upsert).not.toHaveBeenCalled();
  });

  it('masks premium preference values for free users on read', async () => {
    const supabase = makeSupabase({
      prioritize_weak: true,
      prioritize_near_exam: true,
      fsrs_enabled: true,
      daily_load_tolerance: 900,
    });
    mocks.createClient.mockResolvedValue(supabase);
    mocks.getEffectiveProAccess.mockResolvedValue(false);

    const { GET } = await import('@/app/api/user/preferences/route');
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      prioritize_weak: false,
      prioritize_near_exam: false,
      fsrs_enabled: false,
      daily_load_tolerance: 100,
      auto_reschedule_missed: false,
      bury_siblings: false,
    });
  });
});

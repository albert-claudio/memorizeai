import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authenticateCronRequest: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  getRedis: vi.fn(),
  isTelegramConfigured: vi.fn(),
  sendTelegramMessage: vi.fn(),
}));

vi.mock('@/lib/security/cron-auth', () => ({
  authenticateCronRequest: mocks.authenticateCronRequest,
}));

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}));

vi.mock('@/lib/redis', () => ({
  getRedis: mocks.getRedis,
}));

vi.mock('@/lib/telegram', () => ({
  isTelegramConfigured: mocks.isTelegramConfigured,
  sendTelegramMessage: mocks.sendTelegramMessage,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    elapsed: vi.fn(() => 0),
  }),
}));

type QueryResult = { count: number | null; error: { message: string } | null };

function createQuery(result: QueryResult = { count: 0, error: null }) {
  const query = {
    select: vi.fn(() => query),
    limit: vi.fn(() => query),
    is: vi.fn(() => query),
    eq: vi.fn(() => query),
    lt: vi.fn(() => query),
    gte: vi.fn(() => query),
    then: (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve),
  };

  return query;
}

function createSupabaseMock() {
  return {
    from: vi.fn(() => createQuery()),
  };
}

function request() {
  return new NextRequest('https://vimens.app/api/cron/system-report', {
    method: 'GET',
    headers: { authorization: 'Bearer cron-secret' },
  });
}

describe('/api/cron/system-report', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'https://vimens.app';
    process.env.QSTASH_CURRENT_SIGNING_KEY = 'current';
    process.env.QSTASH_NEXT_SIGNING_KEY = 'next';

    mocks.authenticateCronRequest.mockResolvedValue({ ok: true, mode: 'legacy' });
    mocks.getSupabaseAdmin.mockReturnValue(createSupabaseMock());
    mocks.getRedis.mockReturnValue({ ping: vi.fn().mockResolvedValue('PONG') });
    mocks.isTelegramConfigured.mockReturnValue(true);
    mocks.sendTelegramMessage.mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 200 })));
  });

  it('fails closed before touching dependencies when cron auth fails', async () => {
    mocks.authenticateCronRequest.mockResolvedValue({ ok: false, status: 401, error: 'Unauthorized' });

    const { GET } = await import('./route');
    const response = await GET(request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
    expect(mocks.sendTelegramMessage).not.toHaveBeenCalled();
  });

  it('returns 200 with delivery details when Telegram is not configured', async () => {
    mocks.isTelegramConfigured.mockReturnValue(false);
    mocks.sendTelegramMessage.mockResolvedValue({
      ok: false,
      error: 'TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be configured',
    });

    const { GET } = await import('./route');
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.delivered).toBe(false);
    expect(body.telegram).toEqual({
      ok: false,
      error: 'TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be configured',
    });
    expect(mocks.sendTelegramMessage).toHaveBeenCalledWith(expect.stringContaining('Telegram configured: false'));
  });

  it('returns a degraded report when Supabase admin initialization fails', async () => {
    mocks.getSupabaseAdmin.mockImplementation(() => {
      throw new Error('missing Supabase service role');
    });

    const { GET } = await import('./route');
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe('unhealthy');
    expect(body.checks.supabase.ok).toBe(false);
    expect(body.metrics.queued).toEqual({
      value: 0,
      ok: false,
      error: 'missing Supabase service role',
    });
    expect(body.delivered).toBe(true);
  });
});

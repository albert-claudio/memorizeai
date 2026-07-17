import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const upstashMocks = vi.hoisted(() => ({
  redisConstructor: vi.fn(),
  limit: vi.fn(),
  slidingWindow: vi.fn(() => ({})),
}));

vi.mock('@upstash/redis', () => ({
  Redis: upstashMocks.redisConstructor,
}));

vi.mock('@upstash/ratelimit', () => {
  function Ratelimit(this: { limit: typeof upstashMocks.limit }) {
    this.limit = upstashMocks.limit;
  }
  Ratelimit.slidingWindow = upstashMocks.slidingWindow;

  return { Ratelimit };
});

describe('applyRateLimit with Redis configured', () => {
  let applyRateLimit: typeof import('@/lib/security/rate-limiter').applyRateLimit;

  beforeAll(async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'redis_token';
    process.env.RATE_LIMIT_REDIS_TIMEOUT_MS = '25';
    upstashMocks.limit.mockRejectedValue(new Error('redis down'));

    ({ applyRateLimit } = await import('@/lib/security/rate-limiter'));
  });

  afterAll(() => {
    vi.resetModules();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.RATE_LIMIT_REDIS_TIMEOUT_MS;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to in-memory limiting when Redis is configured but unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await applyRateLimit('/api/runs/process', '127.0.0.1');

    expect(upstashMocks.limit).toHaveBeenCalledWith('127.0.0.1');
    expect(result).toMatchObject({
      success: true,
      limit: 20,
      remaining: 19,
      mode: 'memory',
    });
    expect(warn).toHaveBeenCalledWith(
      '[Rate Limiter] Redis limit failed. Falling back to in-memory rate limiting for this request.',
      expect.any(Error),
    );
  });
});

describe('applyRateLimit with memory fallback', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.RATE_LIMIT_REDIS_TIMEOUT_MS;
  });

  it('treats simulado follow-up routes as AI-cost routes', async () => {
    const { applyRateLimit } = await import('@/lib/security/rate-limiter');

    const flashcardsResult = await applyRateLimit('/api/simulado/reinforcement-flashcards', 'user:test-user');
    const recommendationsResult = await applyRateLimit('/api/simulado/study-recommendations', '127.0.0.1');

    expect(flashcardsResult).toMatchObject({
      success: true,
      limit: 20,
      mode: 'memory',
    });
    expect(recommendationsResult).toMatchObject({
      success: true,
      limit: 20,
      mode: 'memory',
    });
  });

  it('keeps run status polling out of the AI-cost limiter', async () => {
    const { applyRateLimit } = await import('@/lib/security/rate-limiter');

    const statusResult = await applyRateLimit('/api/runs', '127.0.0.1', 'GET');
    const createResult = await applyRateLimit('/api/runs', '127.0.0.1', 'POST');

    expect(statusResult).toMatchObject({
      success: true,
      limit: 240,
      mode: 'memory',
    });
    expect(createResult).toMatchObject({
      success: true,
      limit: 20,
      mode: 'memory',
    });
  });

  it('does not rate limit auth page loads as login attempts', async () => {
    const { applyRateLimit } = await import('@/lib/security/rate-limiter');

    await expect(applyRateLimit('/login', '127.0.0.1', 'GET')).resolves.toBeNull();
    await expect(applyRateLimit('/cadastro', '127.0.0.1', 'GET')).resolves.toBeNull();

    const loginAttempt = await applyRateLimit('/api/auth/login', '127.0.0.1', 'POST');
    expect(loginAttempt).toMatchObject({
      success: true,
      limit: 20,
      mode: 'memory',
    });
  });

  it('supports a custom daily user budget with in-memory fallback', async () => {
    const { applyCustomRateLimit } = await import('@/lib/security/rate-limiter');

    const first = await applyCustomRateLimit({
      prefix: 'simulado:reinforcement-flashcards:daily:test',
      identifier: 'user:daily-budget',
      maxRequests: 1,
      windowMs: 24 * 60 * 60_000,
      windowLabel: '24 h',
    });
    const second = await applyCustomRateLimit({
      prefix: 'simulado:reinforcement-flashcards:daily:test',
      identifier: 'user:daily-budget',
      maxRequests: 1,
      windowMs: 24 * 60 * 60_000,
      windowLabel: '24 h',
    });

    expect(first).toMatchObject({
      success: true,
      limit: 1,
      remaining: 0,
      mode: 'memory',
    });
    expect(second).toMatchObject({
      success: false,
      limit: 1,
      remaining: 0,
      mode: 'memory',
    });
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

describe('applyRateLimit', () => {
  afterEach(() => {
    vi.doUnmock('@upstash/redis');
    vi.doUnmock('@upstash/ratelimit');
    vi.restoreAllMocks();
    vi.resetModules();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it('falls back to in-memory limiting when Redis is configured but unavailable', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'redis_token';

    const limitMock = vi.fn().mockRejectedValue(new Error('redis down'));

    vi.doMock('@upstash/redis', () => ({
      Redis: vi.fn(),
    }));
    vi.doMock('@upstash/ratelimit', () => ({
      Ratelimit: class {
        static slidingWindow = vi.fn(() => ({}));
        limit = limitMock;
      },
    }));

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { applyRateLimit } = await import('@/lib/security/rate-limiter');

    const result = await applyRateLimit('/api/runs/process', '127.0.0.1');

    expect(limitMock).toHaveBeenCalledWith('127.0.0.1');
    expect(result).toMatchObject({
      success: true,
      limit: 10,
      remaining: 9,
      mode: 'memory',
    });
    expect(warn).toHaveBeenCalledWith(
      '[Rate Limiter] Redis limit failed. Falling back to in-memory rate limiting for this request.',
      expect.any(Error),
    );
  });
});

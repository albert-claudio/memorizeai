/**
 * Integration tests for Webhook Security module.
 *
 * Tests the public API surface:
 * - verifyWebhookTimestamp
 * - checkRateLimit (distributed, via Upstash Redis)
 * - recordFailedAttempt
 * - runSecurityChecks (orchestrator)
 *
 * Mocks Redis and Supabase to test business logic without external calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Redis ───────────────────────────────────────────────────────────────

const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisIncr = vi.fn();
const mockRedisExpire = vi.fn();
const mockRedisTtl = vi.fn();

vi.mock('@/lib/redis', () => ({
  getRedis: vi.fn(() => ({
    get: mockRedisGet,
    set: mockRedisSet,
    incr: mockRedisIncr,
    expire: mockRedisExpire,
    ttl: mockRedisTtl,
  })),
}));

// ── Mock Upstash Ratelimit ───────────────────────────────────────────────────
// The constructor receives {redis, limiter, prefix}.
// `Ratelimit.slidingWindow(...)` is a static factory that returns a limiter config.
// The instance exposes `.limit(ip)`.

const mockLimit = vi.fn();

function MockRatelimit() {
  return { limit: mockLimit };
}
MockRatelimit.slidingWindow = vi.fn().mockReturnValue('sliding-window-config');

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: MockRatelimit,
}));

// ── Mock Supabase ────────────────────────────────────────────────────────────

const mockInsert = vi.fn().mockReturnValue(Promise.resolve({ error: null }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: mockInsert,
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    })),
  })),
}));

// ── Import after mocks ──────────────────────────────────────────────────────

import {
  verifyWebhookTimestamp,
  checkRateLimit,
  recordFailedAttempt,
  runSecurityChecks,
} from '../webhook-security';

describe('verifyWebhookTimestamp', () => {
  it('rejects when no t= component in signature', () => {
    const result = verifyWebhookTimestamp('v1=abc123');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('timestamp');
  });

  it('accepts a fresh timestamp', () => {
    const freshTs = Math.floor(Date.now() / 1000);
    const result = verifyWebhookTimestamp(`t=${freshTs},v1=abc123`);
    expect(result.valid).toBe(true);
  });

  it('rejects a timestamp older than 5 minutes', () => {
    const oldTs = Math.floor(Date.now() / 1000) - 6 * 60;
    const result = verifyWebhookTimestamp(`t=${oldTs},v1=abc123`);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('old');
  });
});

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows request when under the limit', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockLimit.mockResolvedValue({ success: true, remaining: 90, reset: Date.now() + 60000 });

    const result = await checkRateLimit('1.2.3.4');
    expect(result.allowed).toBe(true);
    expect(result.blocked).toBe(false);
  });

  it('blocks a banned IP', async () => {
    mockRedisGet.mockResolvedValue('1');
    mockRedisTtl.mockResolvedValue(3000);

    const result = await checkRateLimit('1.2.3.4');
    expect(result.allowed).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('rejects when rate limit exceeded', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockLimit.mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 30000 });

    const result = await checkRateLimit('1.2.3.4');
    expect(result.allowed).toBe(false);
    expect(result.blocked).toBe(false);
    expect(result.reason).toContain('Rate limit');
  });
});

describe('recordFailedAttempt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('increments the fail counter and sets TTL on first failure', async () => {
    mockRedisIncr.mockResolvedValue(1);

    const result = await recordFailedAttempt('1.2.3.4');
    expect(result.blocked).toBe(false);
    expect(result.failCount).toBe(1);
    expect(mockRedisExpire).toHaveBeenCalled();
  });

  it('blocks IP after reaching threshold', async () => {
    mockRedisIncr.mockResolvedValue(10);

    const result = await recordFailedAttempt('1.2.3.4');
    expect(result.blocked).toBe(true);
    expect(result.failCount).toBe(10);
    expect(mockRedisSet).toHaveBeenCalled();
  });
});

describe('runSecurityChecks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes when rate limit is OK and no signature provided', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockLimit.mockResolvedValue({ success: true, remaining: 50, reset: Date.now() + 60000 });

    const result = await runSecurityChecks('1.2.3.4', null);
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when IP is rate-limited', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockLimit.mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 30000 });

    const result = await runSecurityChecks('1.2.3.4', null);
    expect(result.passed).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('fails when timestamp is stale', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockLimit.mockResolvedValue({ success: true, remaining: 50, reset: Date.now() + 60000 });

    const oldTs = Math.floor(Date.now() / 1000) - 6 * 60;
    const result = await runSecurityChecks('1.2.3.4', `t=${oldTs},v1=abc`);
    expect(result.passed).toBe(false);
    expect(result.errors.some((e: string) => e.toLowerCase().includes('old'))).toBe(true);
  });
});

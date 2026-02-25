/**
 * Integration tests for AI Cost Guard
 *
 * Tests daily run quota checking and circuit breaker logic.
 * Mocks Supabase and Redis to verify business logic without DB calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Supabase ────────────────────────────────────────────────────────────

const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockNeq = vi.fn();
const mockGte = vi.fn();
const mockSingle = vi.fn();

function buildChain() {
  mockSelect.mockReturnValue({ eq: mockEq });
  mockEq.mockReturnValue({ neq: mockNeq });
  mockNeq.mockReturnValue({ gte: mockGte });
  mockGte.mockReturnValue(Promise.resolve({ count: 0, error: null }));
  mockSingle.mockReturnValue(Promise.resolve({ data: null, error: null }));
}

const mockFrom = vi.fn(() => ({
  select: mockSelect,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

// ── Mock Redis ───────────────────────────────────────────────────────────────

const mockRedisGet = vi.fn();
const mockRedisIncr = vi.fn();
const mockRedisExpire = vi.fn();
const mockRedisDel = vi.fn();
const mockRedisTtl = vi.fn();

vi.mock('@/lib/redis', () => ({
  getRedis: vi.fn(() => ({
    get: mockRedisGet,
    incr: mockRedisIncr,
    expire: mockRedisExpire,
    del: mockRedisDel,
    ttl: mockRedisTtl,
  })),
}));

// ── Import after mocks ──────────────────────────────────────────────────────

import {
  checkDailyRunQuota,
  checkCircuitBreaker,
  recordAISuccess,
  recordAIFailure,
  DAILY_RUN_LIMITS,
  CIRCUIT_BREAKER,
} from '../cost-guard';

describe('checkDailyRunQuota', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildChain();
  });

  it('allows a free user under the limit', async () => {
    mockGte.mockReturnValue(Promise.resolve({ count: 2, error: null }));

    const result = await checkDailyRunQuota('user-1', false);
    expect(result.allowed).toBe(true);
  });

  it('blocks a free user at the limit', async () => {
    mockGte.mockReturnValue(
      Promise.resolve({ count: DAILY_RUN_LIMITS.free, error: null })
    );

    const result = await checkDailyRunQuota('user-1', false);
    expect(result.allowed).toBe(false);
    expect('reason' in result && result.reason).toContain('Daily run limit');
  });

  it('allows a pro user with higher quota', async () => {
    // Count that exceeds free limit but is under pro limit
    mockGte.mockReturnValue(Promise.resolve({ count: 5, error: null }));

    const result = await checkDailyRunQuota('user-1', true);
    expect(result.allowed).toBe(true);
  });

  it('blocks a pro user at their limit', async () => {
    mockGte.mockReturnValue(
      Promise.resolve({ count: DAILY_RUN_LIMITS.pro, error: null })
    );

    const result = await checkDailyRunQuota('user-1', true);
    expect(result.allowed).toBe(false);
  });

  it('fails open when supabase errors', async () => {
    mockGte.mockReturnValue(
      Promise.resolve({ count: null, error: { message: 'DB down' } })
    );

    const result = await checkDailyRunQuota('user-1', false);
    expect(result.allowed).toBe(true);
  });
});

describe('checkCircuitBreaker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows when failure count is below threshold', async () => {
    mockRedisGet.mockResolvedValue(CIRCUIT_BREAKER.threshold - 1);

    const result = await checkCircuitBreaker('groq');
    expect(result.allowed).toBe(true);
  });

  it('blocks when failure count reaches threshold', async () => {
    mockRedisGet.mockResolvedValue(CIRCUIT_BREAKER.threshold);
    mockRedisTtl.mockResolvedValue(300);

    const result = await checkCircuitBreaker('groq');
    expect(result.allowed).toBe(false);
    expect('reason' in result && result.reason).toContain('circuit breaker');
  });

  it('allows when no failure count exists', async () => {
    mockRedisGet.mockResolvedValue(null);

    const result = await checkCircuitBreaker('gemini');
    expect(result.allowed).toBe(true);
  });
});

describe('recordAISuccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes the failure counter key', async () => {
    await recordAISuccess('groq');
    expect(mockRedisDel).toHaveBeenCalledWith('ai:cb:groq');
  });
});

describe('recordAIFailure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('increments and sets TTL on first failure', async () => {
    mockRedisIncr.mockResolvedValue(1);

    await recordAIFailure('groq');
    expect(mockRedisIncr).toHaveBeenCalledWith('ai:cb:groq');
    expect(mockRedisExpire).toHaveBeenCalled();
  });

  it('logs warning when threshold is reached', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockRedisIncr.mockResolvedValue(CIRCUIT_BREAKER.threshold);

    await recordAIFailure('groq');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('OPENED')
    );

    warnSpy.mockRestore();
  });
});

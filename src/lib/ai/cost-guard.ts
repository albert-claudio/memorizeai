/**
 * AI Cost Guard
 *
 * 1. Daily run quota — enforced via Supabase (free: 3/day, pro: 20/day).
 *    Note: weekly *upload* quota is enforced elsewhere — this guards *generations*.
 *
 * 2. Circuit breaker — Redis-backed consecutive failure counter.
 *    After 5 failures within a window, pause AI calls for 10 minutes.
 *    This protects against runaway spend during API outages.
 */

import { createClient } from '@supabase/supabase-js';
import { getRedis } from '@/lib/redis';

// ── Configuration ─────────────────────────────────────────────────────────────

export const DAILY_RUN_LIMITS = {
  free: 3,
  pro:  20,
} as const;

export const CIRCUIT_BREAKER = {
  /** Consecutive failures before opening the circuit */
  threshold: 5,
  /** How long to keep the circuit open (ms) */
  durationMs: 10 * 60 * 1000, // 10 minutes
  /** Redis key prefix */
  keyPrefix: 'ai:cb',
} as const;

// ── Supabase admin (server-only) ──────────────────────────────────────────────

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type GuardResult =
  | { allowed: true }
  | { allowed: false; reason: string; retryAfterMs?: number };

// ── 1. Daily quota check ──────────────────────────────────────────────────────

/**
 * Returns { allowed: true } if the user has not exceeded their daily run limit.
 * Counts runs created today (UTC midnight boundary) with status != 'erro'.
 */
export async function checkDailyRunQuota(
  userId: string,
  isPro: boolean
): Promise<GuardResult> {
  const supabase = getAdmin();
  const limit = isPro ? DAILY_RUN_LIMITS.pro : DAILY_RUN_LIMITS.free;

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('runs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .neq('status', 'erro')
    .gte('created_at', todayStart.getTime());

  if (error) {
    // Fail-open: don't block the user if we can't count
    console.error('[CostGuard] Failed to count daily runs:', error.message);
    return { allowed: true };
  }

  const used = count ?? 0;

  if (used >= limit) {
    const tomorrowMs = todayStart.getTime() + 24 * 60 * 60 * 1000;
    return {
      allowed: false,
      reason: `Daily run limit reached (${used}/${limit}). ${isPro ? 'Resets at midnight UTC.' : 'Upgrade to Pro for more runs.'}`,
      retryAfterMs: tomorrowMs - Date.now(),
    };
  }

  return { allowed: true };
}

// ── 2. Circuit breaker ────────────────────────────────────────────────────────

function cbKey(model: string) {
  return `${CIRCUIT_BREAKER.keyPrefix}:${model}`;
}

/**
 * Check if the circuit breaker is open for a given model.
 * Returns { allowed: false } if too many recent failures have been recorded.
 */
export async function checkCircuitBreaker(model: string): Promise<GuardResult> {
  const redis = getRedis();
  if (!redis) return { allowed: true }; // No Redis → fail-open

  const count = await redis.get<number>(cbKey(model));

  if (count !== null && count >= CIRCUIT_BREAKER.threshold) {
    const ttlSec = await redis.ttl(cbKey(model));
    return {
      allowed: false,
      reason: `AI circuit breaker open for ${model} — too many recent failures. Retrying in ${Math.ceil(ttlSec / 60)} min.`,
      retryAfterMs: ttlSec * 1000,
    };
  }

  return { allowed: true };
}

/**
 * Record a successful AI call — resets the failure counter for the model.
 */
export async function recordAISuccess(model: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.del(cbKey(model));
}

/**
 * Record a failed AI call — increments the failure counter.
 * Opens the circuit breaker if the threshold is exceeded.
 */
export async function recordAIFailure(model: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const key = cbKey(model);
  const failures = await redis.incr(key);

  // Set/refresh TTL on every increment so the window is rolling
  const ttlSec = Math.ceil(CIRCUIT_BREAKER.durationMs / 1000);
  await redis.expire(key, ttlSec);

  if (failures >= CIRCUIT_BREAKER.threshold) {
    console.warn(`[CostGuard] Circuit breaker OPENED for ${model} after ${failures} failures`);
  }
}

// ── 3. Weekly token budget ────────────────────────────────────────────────────

export const WEEKLY_TOKEN_LIMITS = {
  free: 50_000,
  pro:  500_000,
} as const;

/** At this fraction of the limit, Pro users get downgraded to Groq */
const TOKEN_DEGRADE_THRESHOLD = 0.8;

/** Expected max tokens for a single run — anything above is anomalous */
const ANOMALY_THRESHOLD_TOKENS = 20_000;

export interface TokenBudgetResult {
  allowed: boolean;
  reason?: string;
  shouldDegradeModel: boolean;
  tokensUsed: number;
  tokenLimit: number;
}

/**
 * Get the start of the current ISO week (Monday 00:00 UTC) as epoch ms.
 */
function getWeekStartMs(): number {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.getTime();
}

/**
 * Check accumulated token usage for the current week.
 * - Free: 50 000 tokens/week  (hard cap)
 * - Pro: 500 000 tokens/week  (soft-degrade at 80 %, hard cap at 100 %)
 */
export async function checkWeeklyTokenBudget(
  userId: string,
  isPro: boolean,
): Promise<TokenBudgetResult> {
  const supabase = getAdmin();
  const limit = isPro ? WEEKLY_TOKEN_LIMITS.pro : WEEKLY_TOKEN_LIMITS.free;
  const weekStart = getWeekStartMs();

  const { data, error } = await supabase
    .from('runs')
    .select('token_count')
    .eq('user_id', userId)
    .gte('created_at', weekStart)
    .neq('status', 'erro');

  if (error) {
    console.error('[CostGuard] Failed to sum weekly tokens:', error.message);
    // Fail-open
    return { allowed: true, shouldDegradeModel: false, tokensUsed: 0, tokenLimit: limit };
  }

  const tokensUsed = (data ?? []).reduce(
    (sum: number, row: { token_count?: number }) =>
      sum + (typeof row.token_count === 'number' ? row.token_count : 0),
    0,
  );

  // Hard cap
  if (tokensUsed >= limit) {
    return {
      allowed: false,
      reason: `Limite semanal de tokens atingido (${tokensUsed.toLocaleString('pt-BR')}/${limit.toLocaleString('pt-BR')}). ${isPro ? 'Renova na próxima segunda-feira.' : 'Faça upgrade para Pro para mais tokens.'}`,
      shouldDegradeModel: false,
      tokensUsed,
      tokenLimit: limit,
    };
  }

  // Soft cap (Pro only): degrade model at 80 %
  const shouldDegradeModel = isPro && tokensUsed >= limit * TOKEN_DEGRADE_THRESHOLD;

  return { allowed: true, shouldDegradeModel, tokensUsed, tokenLimit: limit };
}

// ── 4. Token anomaly logging ──────────────────────────────────────────────────

/**
 * Log a warning if a single run consumed an anomalous amount of tokens.
 * Called after successful AI calls for monitoring / alerting.
 */
export function logTokenAnomaly(
  runId: string,
  userId: string,
  model: string,
  tokenCount: number,
): void {
  if (tokenCount > ANOMALY_THRESHOLD_TOKENS) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'token_anomaly',
        runId,
        userId,
        model,
        tokenCount,
        threshold: ANOMALY_THRESHOLD_TOKENS,
        message: `Run consumed ${tokenCount} tokens (>${ANOMALY_THRESHOLD_TOKENS} threshold)`,
      }),
    );
  }
}


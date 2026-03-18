import { createClient } from '@supabase/supabase-js';
import { Ratelimit } from '@upstash/ratelimit';
import { getRedis } from '@/lib/redis';

// ============================================================================
// WEBHOOK SECURITY MODULE
// ============================================================================
// Provides defense-in-depth for Stripe webhooks:
// 1. Timestamp verification (replay attack protection)
// 2. Event idempotency (duplicate detection, DB-backed)
// 3. Audit logging
// 4. Distributed rate limiting + IP blocking (Upstash Redis)

// Admin client for security operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Timestamp: reject events older than 5 minutes
  MAX_EVENT_AGE_MS: 5 * 60 * 1000,

  // Rate limiting: max requests per window (sliding window in Redis)
  RATE_LIMIT_WINDOW_SEC: 60,       // 1 minute
  RATE_LIMIT_MAX_REQUESTS: 100,    // 100 requests per minute per IP

  // Brute force: block after N failed attempts
  BLOCK_THRESHOLD: 10,             // Block after 10 failed attempts
  BLOCK_DURATION_SEC: 60 * 60,     // 1 hour

  // Failed-attempt counter TTL (reset window)
  FAIL_WINDOW_SEC: 60 * 60,        // Track failures for 1 hour

  // Idempotency: how long to remember processed events
  EVENT_CACHE_TTL_MS: 24 * 60 * 60 * 1000, // 24 hours
} as const;

// ============================================================================
// REDIS KEY HELPERS
// ============================================================================

const redisKey = {
  /** Per-IP block flag: "wh:block:<ip>" → "1" until expiry */
  block: (ip: string) => `wh:block:${ip}`,
  /** Per-IP failure counter: "wh:fail:<ip>" → integer */
  fail:  (ip: string) => `wh:fail:${ip}`,
};

// ============================================================================
// 1. TIMESTAMP VERIFICATION
// ============================================================================

export interface TimestampResult {
  valid: boolean;
  ageMs: number;
  reason?: string;
}

/**
 * Verify webhook timestamp to prevent replay attacks.
 * Stripe includes a timestamp in the signature header.
 */
export function verifyWebhookTimestamp(
  stripeSignature: string
): TimestampResult {
  const timestampMatch = stripeSignature.match(/t=(\d+)/);

  if (!timestampMatch) {
    return {
      valid: false,
      ageMs: 0,
      reason: 'No timestamp found in signature header',
    };
  }

  const eventTimestamp = parseInt(timestampMatch[1], 10) * 1000;
  const now = Date.now();
  const ageMs = now - eventTimestamp;

  if (ageMs > CONFIG.MAX_EVENT_AGE_MS) {
    return {
      valid: false,
      ageMs,
      reason: `Event too old: ${Math.round(ageMs / 1000)}s (max: ${CONFIG.MAX_EVENT_AGE_MS / 1000}s)`,
    };
  }

  // Guard against future timestamps (clock skew attack)
  if (ageMs < -60_000) {
    return {
      valid: false,
      ageMs,
      reason: 'Event timestamp is in the future',
    };
  }

  return { valid: true, ageMs };
}

// ============================================================================
// 2. IDEMPOTENCY CHECK (atomic, DB-backed — already distributed)
// ============================================================================

export interface IdempotencyResult {
  isNew: boolean;
  reason?: string;
}

/**
 * ATOMIC idempotency check that allows retries after transient failures.
 *
 * Logic:
 * 1. event_id exists with success=true  → BLOCK (already processed)
 * 2. event_id exists with success=false → DELETE and ALLOW retry
 * 3. event_id absent                    → INSERT placeholder and ALLOW
 */
export async function checkEventIdempotencyAtomic(
  eventId: string,
  ip: string,
  eventType: string
): Promise<IdempotencyResult> {
  try {
    const { data: existing } = await supabaseAdmin
      .from('webhook_logs')
      .select('id, success')
      .eq('event_id', eventId)
      .single();

    if (existing) {
      if (existing.success === true) {
        return {
          isNew: false,
          reason: `Event ${eventId} already processed successfully`,
        };
      }
      // Previous attempt failed — delete to allow retry
      await supabaseAdmin
        .from('webhook_logs')
        .delete()
        .eq('id', existing.id);
      console.log(`[Webhook Security] Deleted failed attempt for ${eventId}, allowing retry`);
    }

    // Insert processing placeholder (success=false, updated after handler)
    const { error } = await supabaseAdmin
      .from('webhook_logs')
      .insert({
        event_id: eventId,
        event_type: eventType,
        ip_address: ip,
        success: false,
        signature_valid: true,
        timestamp_valid: true,
        processing_time_ms: 0,
        created_at: Date.now(),
      });

    if (error && error.code === '23505') {
      // Race condition: another request just inserted — let that one handle it
      return {
        isNew: false,
        reason: `Event ${eventId} is being processed by another request`,
      };
    }

    return { isNew: true };
  } catch (error) {
    console.error('[Webhook Security] Idempotency check failed:', error);
    return { isNew: true }; // Fail-open to avoid blocking legitimate events
  }
}

/**
 * Webhook event processing outcomes.
 *
 * - applied:           Business logic change was applied to the user.
 * - ignored:           Event is not relevant to our business logic (intentional skip).
 * - transient_failure: Retriable problem (DB timeout, race condition, sync delay).
 *                      Stripe will retry delivery when we respond with a non-2xx status.
 * - permanent_failure: Unrecoverable issue (missing identity, broken payload).
 *                      We respond 200 to stop retries and log for manual review.
 */
export type WebhookOutcome = 'applied' | 'ignored' | 'transient_failure' | 'permanent_failure';

/**
 * Finalize a webhook event with an explicit outcome.
 *
 * Rules:
 * - applied / ignored   → success=true  (blocks future retries via idempotency)
 * - transient_failure    → success=false (idempotency allows retry on next delivery)
 * - permanent_failure    → success=true  (blocks retries — manual intervention needed)
 *                          + logged as console.error alert
 */
export async function finalizeEvent(
  eventId: string,
  outcome: WebhookOutcome,
  outcomeReason: string,
  processingTimeMs: number,
): Promise<void> {
  // applied / ignored / permanent_failure → mark success=true to block idempotency retries
  // transient_failure → leave success=false so idempotency allows retry
  const successFlag = outcome !== 'transient_failure';

  if (outcome === 'permanent_failure') {
    console.error(
      `[Webhook ALERT] Permanent failure for event ${eventId}: ${outcomeReason}. ` +
      'Manual review required.'
    );
    // Fire async alert — never blocks event processing
    sendPermanentFailureAlert(eventId, outcomeReason).catch(() => {});
  }

  try {
    await supabaseAdmin
      .from('webhook_logs')
      .update({
        success: successFlag,
        processing_time_ms: processingTimeMs,
        outcome,
        outcome_reason: outcomeReason || null,
      })
      .eq('event_id', eventId);
  } catch (error) {
    console.error('[Webhook Security] Failed to finalize event:', error);
  }
}

/**
 * Fire an operational alert when a webhook event reaches permanent_failure.
 * Sends an HTTP POST to `WEBHOOK_ALERT_URL` (Discord, Slack, PagerDuty, etc.).
 * Silently no-ops when the env var is not configured.
 */
async function sendPermanentFailureAlert(
  eventId: string,
  reason: string,
): Promise<void> {
  const alertUrl = process.env.WEBHOOK_ALERT_URL;
  if (!alertUrl) return;

  const payload = {
    // Generic format — works with Slack, Discord (via content), or custom endpoints
    text: `🚨 *Webhook permanent_failure*\n\n*Event:* \`${eventId}\`\n*Reason:* ${reason}\n*Time:* ${new Date().toISOString()}\n\nReview in \`webhook_logs\` → \`SELECT * FROM webhook_logs WHERE event_id = '${eventId}'\``,
    // Discord-compatible
    content: `🚨 **Webhook permanent_failure**\n**Event:** \`${eventId}\`\n**Reason:** ${reason}\n**Time:** ${new Date().toISOString()}`,
  };

  try {
    const response = await fetch(alertUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.warn(`[Webhook Alert] Alert endpoint returned ${response.status}`);
    }
  } catch (error) {
    console.warn('[Webhook Alert] Failed to send alert:', error);
  }
}

/**
 * Mark a webhook event as successfully processed.
 * @deprecated Use finalizeEvent() with an explicit outcome instead.
 */
export async function markEventProcessed(eventId: string, processingTimeMs: number): Promise<void> {
  await finalizeEvent(eventId, 'applied', '', processingTimeMs);
}

// ============================================================================
// 3. AUDIT LOGGING
// ============================================================================

export interface WebhookAttempt {
  ip: string;
  eventId: string | null;
  eventType: string | null;
  success: boolean;
  error?: string;
  signatureValid: boolean;
  timestampValid: boolean;
  processingTimeMs: number;
}

/**
 * Log webhook attempt for security auditing.
 * Uses UPSERT to avoid conflicts with idempotency placeholder rows.
 */
export async function logWebhookAttempt(attempt: WebhookAttempt): Promise<void> {
  try {
    await supabaseAdmin.from('webhook_logs').upsert(
      {
        ip_address: attempt.ip,
        event_id: attempt.eventId,
        event_type: attempt.eventType,
        success: attempt.success,
        error_message: attempt.error || null,
        signature_valid: attempt.signatureValid,
        timestamp_valid: attempt.timestampValid,
        processing_time_ms: attempt.processingTimeMs,
        created_at: Date.now(),
      },
      { onConflict: 'event_id', ignoreDuplicates: false }
    );
  } catch (error) {
    console.error('[Webhook Security] Failed to log attempt:', error);
  }
}

// ============================================================================
// 4. DISTRIBUTED RATE LIMITING + IP BLOCKING (Upstash Redis)
// ============================================================================

export interface RateLimitResult {
  allowed: boolean;
  blocked: boolean;
  remainingRequests: number;
  retryAfterMs?: number;
  reason?: string;
}

/**
 * Build a per-IP sliding-window Ratelimit instance.
 * We create it lazily so the Redis client is always fresh.
 */
function buildRatelimiter(): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;

  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(
      CONFIG.RATE_LIMIT_MAX_REQUESTS,
      `${CONFIG.RATE_LIMIT_WINDOW_SEC} s`
    ),
    prefix: 'wh:rl', // Redis key prefix: "wh:rl:<ip>"
  });
}

/**
 * Distributed rate limit + block check.
 *
 * Falls back to allow-all if Redis is unavailable (local dev / missing env).
 */
export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  const redis = getRedis();

  // ── Block check ─────────────────────────────────────────────────────────
  if (redis) {
    const blocked = await redis.get(redisKey.block(ip));
    if (blocked) {
      const ttl = await redis.ttl(redisKey.block(ip));
      return {
        allowed: false,
        blocked: true,
        remainingRequests: 0,
        retryAfterMs: ttl > 0 ? ttl * 1000 : CONFIG.BLOCK_DURATION_SEC * 1000,
        reason: `IP ${ip} is temporarily blocked`,
      };
    }
  }

  // ── Rate-limit check ─────────────────────────────────────────────────────
  const limiter = buildRatelimiter();
  if (!limiter) {
    // Redis unavailable — fail-open
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[Webhook Security] Redis not configured, rate limiting skipped');
    }
    return {
      allowed: true,
      blocked: false,
      remainingRequests: CONFIG.RATE_LIMIT_MAX_REQUESTS,
    };
  }

  const { success, remaining, reset } = await limiter.limit(ip);

  if (!success) {
    const retryAfterMs = reset - Date.now();
    return {
      allowed: false,
      blocked: false,
      remainingRequests: 0,
      retryAfterMs: retryAfterMs > 0 ? retryAfterMs : 0,
      reason: 'Rate limit exceeded',
    };
  }

  return {
    allowed: true,
    blocked: false,
    remainingRequests: remaining,
  };
}

/**
 * Increment distributed failure counter for an IP.
 * Blocks the IP in Redis once BLOCK_THRESHOLD is reached.
 */
export async function recordFailedAttempt(
  ip: string
): Promise<{ blocked: boolean; failCount: number }> {
  const redis = getRedis();

  if (!redis) {
    // Redis unavailable — no-op, not worth crashing the handler
    return { blocked: false, failCount: 0 };
  }

  const key = redisKey.fail(ip);

  // Atomic increment; set TTL only on first write
  const failCount = await redis.incr(key);
  if (failCount === 1) {
    await redis.expire(key, CONFIG.FAIL_WINDOW_SEC);
  }

  if (failCount >= CONFIG.BLOCK_THRESHOLD) {
    await redis.set(redisKey.block(ip), '1', { ex: CONFIG.BLOCK_DURATION_SEC });
    console.warn(`[Webhook Security] IP ${ip} BLOCKED after ${failCount} failed attempts`);
    return { blocked: true, failCount };
  }

  return { blocked: false, failCount };
}

// ============================================================================
// 5. COMBINED ASYNC SECURITY CHECK
// ============================================================================

export interface SecurityCheckResult {
  passed: boolean;
  rateLimitResult: RateLimitResult;
  timestampResult?: TimestampResult;
  errors: string[];
}

/**
 * Run all pre-signature security checks asynchronously.
 *
 * Replaces the former synchronous runSecurityChecks().
 */
export async function runSecurityChecks(
  ip: string,
  stripeSignature: string | null,
): Promise<SecurityCheckResult> {
  const errors: string[] = [];

  // 1. Distributed rate limit + block check
  const rateLimitResult = await checkRateLimit(ip);
  if (!rateLimitResult.allowed) {
    errors.push(rateLimitResult.reason ?? 'Rate limit exceeded');
    return { passed: false, rateLimitResult, errors };
  }

  // 2. Timestamp check (if signature present)
  let timestampResult: TimestampResult | undefined;
  if (stripeSignature) {
    timestampResult = verifyWebhookTimestamp(stripeSignature);
    if (!timestampResult.valid) {
      errors.push(timestampResult.reason ?? 'Invalid timestamp');
    }
  }

  return {
    passed: errors.length === 0,
    rateLimitResult,
    timestampResult,
    errors,
  };
}

// ============================================================================
// 6. GET CLIENT IP (SECURE)
// ============================================================================

/**
 * Extract client IP from request headers securely.
 *
 * Priority:
 * 1. x-vercel-forwarded-for — Vercel Edge, cannot be spoofed
 * 2. x-forwarded-for        — Fallback for local dev (WARN in production)
 * 3. 'unknown'              — Final fallback
 */
export function getClientIP(headers: Headers): string {
  const vercelIP = headers.get('x-vercel-forwarded-for');
  if (vercelIP) return vercelIP.split(',')[0].trim();

  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '[Webhook Security] WARNING: Falling back to x-forwarded-for header. ' +
        'This header is spoofable. Check deployment platform configuration.'
      );
    }
    return forwardedFor.split(',')[0].trim();
  }

  return 'unknown';
}

// ============================================================================
// 7. STRIPE IP ALLOWLIST (defense-in-depth, warn-only)
// ============================================================================

/**
 * Known Stripe webhook IP addresses.
 * Source: https://docs.stripe.com/ips  (last updated 2026-02-10)
 *
 * Used as defense-in-depth WARNING only — does NOT block requests.
 * The primary security gate remains HMAC signature verification.
 */
const STRIPE_WEBHOOK_IPS: readonly string[] = [
  '3.18.12.63',
  '3.130.192.231',
  '13.235.14.237',
  '13.235.122.149',
  '18.211.135.69',
  '35.154.171.200',
  '52.15.183.38',
  '54.88.130.119',
  '54.88.130.237',
  '54.187.174.169',
  '54.187.205.235',
  '54.187.216.72',
] as const;

export function isStripeIP(ip: string): boolean {
  return STRIPE_WEBHOOK_IPS.includes(ip);
}

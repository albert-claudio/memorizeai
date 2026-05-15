/**
 * Retry Policy for AI provider failures.
 *
 * Provides exponential backoff with jitter for retrying failed runs.
 * Used by the processor to schedule next_attempt_at when a run fails temporarily.
 */

// ── Configuration (overridable via env) ───────────────────────────────────────

const BASE_DELAY_MS = parseInt(process.env.AI_RETRY_BASE_DELAY_MS || '30000', 10);
const MAX_ATTEMPTS = parseInt(process.env.AI_RETRY_MAX_ATTEMPTS || '5', 10);

/** Delay schedule per attempt number (1-indexed) */
const DELAY_SCHEDULE_MS = [
  BASE_DELAY_MS,          // attempt 1 → +30s
  BASE_DELAY_MS * 3,      // attempt 2 → +90s
  BASE_DELAY_MS * 6,      // attempt 3 → +180s
  BASE_DELAY_MS * 10,     // attempt 4 → +300s
  BASE_DELAY_MS * 20,     // attempt 5 → +600s
];

// ── Types ─────────────────────────────────────────────────────────────────────

export type AIErrorCode =
  | 'rate_limit'
  | 'timeout'
  | 'provider_unavailable'
  | 'payload_too_large'
  | 'invalid_json'
  | 'transient_data'
  | 'fatal_business_rule';

const TRANSIENT_DATA_RETRY_MS = parseInt(
  process.env.AI_RETRY_TRANSIENT_DATA_DELAY_MS || '5000',
  10,
);

export interface RetryDecision {
  /** Whether the run should be retried */
  shouldRetry: boolean;
  /** When to schedule the next attempt (epoch ms). Undefined if fatal. */
  nextAttemptAt?: number;
  /** New status for the run */
  newStatus: 'retry_wait' | 'erro';
  /** Whether the payload should be reduced on retry */
  reducePayload: boolean;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get the maximum number of retry attempts allowed.
 */
export function getMaxAttempts(): number {
  return MAX_ATTEMPTS;
}

/**
 * Determine whether and when a failed run should be retried.
 *
 * @param attemptCount Current attempt_count of the run
 * @param errorCode The classified error code from the provider
 */
export function getRetryDecision(
  attemptCount: number,
  errorCode: AIErrorCode,
): RetryDecision {
  // Fatal errors never retry
  if (errorCode === 'fatal_business_rule') {
    return { shouldRetry: false, newStatus: 'erro', reducePayload: false };
  }

  // invalid_json gets limited retries (2 max)
  if (errorCode === 'invalid_json' && attemptCount >= 2) {
    return { shouldRetry: false, newStatus: 'erro', reducePayload: false };
  }

  // Check attempt limit
  if (attemptCount >= MAX_ATTEMPTS) {
    return { shouldRetry: false, newStatus: 'erro', reducePayload: false };
  }

  if (errorCode === 'transient_data') {
    return {
      shouldRetry: true,
      nextAttemptAt: Date.now() + TRANSIENT_DATA_RETRY_MS,
      newStatus: 'retry_wait',
      reducePayload: false,
    };
  }

  // Compute backoff with jitter
  const scheduleIdx = Math.min(attemptCount, DELAY_SCHEDULE_MS.length - 1);
  const baseDelay = DELAY_SCHEDULE_MS[scheduleIdx];
  const jitter = baseDelay * (0.8 + Math.random() * 0.4); // 0.8x to 1.2x
  const nextAttemptAt = Date.now() + Math.round(jitter);

  const reducePayload = errorCode === 'payload_too_large';

  return {
    shouldRetry: true,
    nextAttemptAt,
    newStatus: 'retry_wait',
    reducePayload,
  };
}

/**
 * Classify an AI provider error into a known error code.
 *
 * @param error The error from the AI call
 * @param httpStatus Optional HTTP status code if available
 */
export function classifyAIError(
  error: unknown,
  httpStatus?: number,
): AIErrorCode {
  const message = error instanceof Error ? error.message : String(error);
  const msgLower = message.toLowerCase();

  // HTTP status-based classification
  if (httpStatus === 429 || msgLower.includes('429') || msgLower.includes('rate_limit') || msgLower.includes('rate limit')) {
    return 'rate_limit';
  }

  if (httpStatus === 413 || msgLower.includes('413') || msgLower.includes('payload too large') || msgLower.includes('request too large')) {
    return 'payload_too_large';
  }

  if (httpStatus && httpStatus >= 500 && httpStatus < 600) {
    return 'provider_unavailable';
  }

  // Message-based classification
  if (msgLower.includes('timed out') || msgLower.includes('timeout') || msgLower.includes('aborted')) {
    return 'timeout';
  }

  if (msgLower.includes('econnreset') || msgLower.includes('econnrefused') ||
      msgLower.includes('dns') || msgLower.includes('network') ||
      msgLower.includes('fetch failed') || msgLower.includes('socket hang up')) {
    return 'provider_unavailable';
  }

  if (msgLower.includes('failed to parse') || msgLower.includes('invalid json') ||
      msgLower.includes('no valid questions') || msgLower.includes('no valid') ||
      msgLower.includes('empty or invalid response')) {
    return 'invalid_json';
  }

  if (
    msgLower.includes('transient chunk lookup') ||
    msgLower.includes('chunk join missing') ||
    msgLower.includes('chunk lookup retry')
  ) {
    return 'transient_data';
  }

  // Business logic errors
  if (msgLower.includes('source not found') || msgLower.includes('access denied') ||
      msgLower.includes('ownership mismatch') || msgLower.includes('deck ownership mismatch') ||
      msgLower.includes('not found') ||
      msgLower.includes('não encontrad') || msgLower.includes('não permitido')) {
    return 'fatal_business_rule';
  }

  // Default: treat unknown 5xx-like failures as provider_unavailable
  if (httpStatus && httpStatus >= 400) {
    return 'provider_unavailable';
  }

  return 'timeout'; // Default to retryable
}

/**
 * Extract HTTP status from an AI error message string.
 * Many errors embed the status like "Groq API error: 429 - ..."
 */
export function extractHttpStatus(error: unknown): number | undefined {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/(?:error|status)[:\s]*(\d{3})/i);
  return match ? parseInt(match[1], 10) : undefined;
}

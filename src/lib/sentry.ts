import * as Sentry from "@sentry/nextjs";

// ============================================================================
// SENTRY UTILITIES — Centralized error capture for Vimens
// ============================================================================
// Every API route and critical client hook should use these helpers instead of
// raw console.error(). This ensures errors reach the Sentry dashboard with
// proper context, tags, and severity.

interface ApiErrorContext {
  /** Route name, e.g. '/api/runs' or 'webhook' */
  route: string;
  /** Authenticated user ID, if available */
  userId?: string | null;
  /** Additional key-value tags for filtering in Sentry */
  tags?: Record<string, string>;
  /** Extra structured data attached to the event */
  extra?: Record<string, unknown>;
}

/**
 * Capture an API route error with full context.
 * Use in catch blocks of API route handlers.
 *
 * Also logs to console.error for local dev / log aggregator visibility.
 */
export function captureApiError(
  error: unknown,
  context: ApiErrorContext,
): void {
  const err = error instanceof Error ? error : new Error(String(error));

  console.error(`[${context.route}]`, err.message);

  Sentry.withScope((scope) => {
    scope.setLevel("error");
    scope.setTag("route", context.route);
    scope.setTag("app", "vimens");

    if (context.userId) {
      scope.setUser({ id: context.userId });
    }

    if (context.tags) {
      for (const [key, value] of Object.entries(context.tags)) {
        scope.setTag(key, value);
      }
    }

    if (context.extra) {
      for (const [key, value] of Object.entries(context.extra)) {
        scope.setExtra(key, value);
      }
    }

    Sentry.captureException(err);
  });
}

interface WarningContext {
  /** Route or component name */
  route: string;
  /** Authenticated user ID, if available */
  userId?: string | null;
  /** Additional tags */
  tags?: Record<string, string>;
  /** Extra structured data */
  extra?: Record<string, unknown>;
}

/**
 * Capture a warning-level event (not an exception).
 * Use for things like: unmapped price IDs, identity resolution failures,
 * transient webhook failures, IDOR detection, etc.
 */
export function captureWarning(
  message: string,
  context: WarningContext,
): void {
  console.warn(`[${context.route}]`, message);

  Sentry.withScope((scope) => {
    scope.setLevel("warning");
    scope.setTag("route", context.route);
    scope.setTag("app", "vimens");

    if (context.userId) {
      scope.setUser({ id: context.userId });
    }

    if (context.tags) {
      for (const [key, value] of Object.entries(context.tags)) {
        scope.setTag(key, value);
      }
    }

    if (context.extra) {
      for (const [key, value] of Object.entries(context.extra)) {
        scope.setExtra(key, value);
      }
    }

    Sentry.captureMessage(message, "warning");
  });
}

/**
 * Set the Sentry user context for all subsequent events.
 * Call this early in request handling after authentication.
 */
export function setSentryUser(user: { id: string; email?: string | null }): void {
  Sentry.setUser({
    id: user.id,
    email: user.email ?? undefined,
  });
}

/**
 * Clear user context (e.g. on logout).
 */
export function clearSentryUser(): void {
  Sentry.setUser(null);
}

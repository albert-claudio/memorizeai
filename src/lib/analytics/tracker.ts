'use client';

// ============================================================================
// LIGHTWEIGHT FUNNEL ANALYTICS TRACKER
// ============================================================================
// Tracks user journey events via the backend analytics route.

let _sessionId: string | null = null;

function getSessionId(): string {
  if (_sessionId) return _sessionId;

  if (typeof window !== 'undefined') {
    const stored = sessionStorage.getItem('analytics_session_id');
    if (stored) {
      _sessionId = stored;
      return stored;
    }
    const id = crypto.randomUUID();
    sessionStorage.setItem('analytics_session_id', id);
    _sessionId = id;
    return id;
  }

  return 'ssr';
}

// Debounce buffer — batch events from the same tick
let _buffer: Array<{
  event: string;
  sessionId: string;
  properties: Record<string, unknown>;
}> = [];
let _flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  if (_buffer.length === 0) return;

  const events = [..._buffer];
  _buffer = [];
  _flushTimer = null;

  try {
    await fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
      keepalive: true,
      credentials: 'same-origin',
    });
  } catch {
    // Silently fail — analytics should never break the app
  }
}

/**
 * Track a funnel event.
 *
 * @example
 * track('landing_view');
 * track('signup_click', { source: 'hero_cta' });
 * track('upload_start', { fileSize: 1024 });
 */
export function track(
  event: string,
  properties: Record<string, unknown> = {}
): void {
  if (typeof window === 'undefined') return;

  _buffer.push({
    event,
    sessionId: getSessionId(),
    properties,
  });

  if (_flushTimer) clearTimeout(_flushTimer);
  _flushTimer = setTimeout(flush, 300);
}

/**
 * Track with auto-detected user from Supabase session.
 * Use this when you know the user should be logged in.
 */
export async function trackAuthenticated(
  event: string,
  properties: Record<string, unknown> = {}
): Promise<void> {
  track(event, properties);
}

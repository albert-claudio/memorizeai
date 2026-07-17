export const ALLOWED_ANALYTICS_EVENTS = [
  'landing_view',
  'signup_click',
  'signup_submit',
  'email_confirmed',
  'login_success',
  'dashboard_view',
  'upload_start',
  'upload_complete',
  'run_created',
  'run_completed',
  'notification_created',
  'upgrade_view',
  'checkout_click',
  'checkout_complete',
  'subscription_canceled',
] as const;

export type AnalyticsEventName = (typeof ALLOWED_ANALYTICS_EVENTS)[number];

const ALLOWED_ANALYTICS_EVENT_SET = new Set<string>(ALLOWED_ANALYTICS_EVENTS);
const CLIENT_TRACKABLE_ANALYTICS_EVENT_SET = new Set<string>([
  'landing_view',
  'signup_click',
  'signup_submit',
  'login_success',
  'dashboard_view',
  'upload_start',
  'upload_complete',
  'upgrade_view',
  'checkout_click',
]);

export interface AnalyticsEventInput {
  event: string;
  sessionId?: string;
  properties?: Record<string, unknown>;
}

export interface SanitizedAnalyticsEvent {
  event: AnalyticsEventName;
  sessionId: string;
  properties: Record<string, unknown>;
}

export function isAllowedAnalyticsEvent(event: string): event is AnalyticsEventName {
  return ALLOWED_ANALYTICS_EVENT_SET.has(event);
}

export function isClientTrackableAnalyticsEvent(event: string): event is AnalyticsEventName {
  return CLIENT_TRACKABLE_ANALYTICS_EVENT_SET.has(event);
}

export function sanitizeAnalyticsProperties(
  value: unknown,
  maxBytes: number = 2048,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const plain = value as Record<string, unknown>;
  const sanitizedEntries = Object.entries(plain).slice(0, 20).map(([key, rawValue]) => {
    const cleanKey = key.trim().slice(0, 50);

    if (typeof rawValue === 'string') {
      return [cleanKey, rawValue.slice(0, 500)];
    }

    if (
      typeof rawValue === 'number' ||
      typeof rawValue === 'boolean' ||
      rawValue === null
    ) {
      return [cleanKey, rawValue];
    }

    return [cleanKey, String(rawValue).slice(0, 500)];
  });

  const sanitized = Object.fromEntries(sanitizedEntries);
  const bytes = Buffer.byteLength(JSON.stringify(sanitized), 'utf8');

  return bytes <= maxBytes ? sanitized : {};
}

export function sanitizeAnalyticsEvent(
  input: unknown,
): SanitizedAnalyticsEvent | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }

  const raw = input as AnalyticsEventInput;
  const event = typeof raw.event === 'string' ? raw.event.trim() : '';
  const sessionId = typeof raw.sessionId === 'string' ? raw.sessionId.trim() : '';

  if (!event || !isAllowedAnalyticsEvent(event) || !sessionId) {
    return null;
  }

  return {
    event,
    sessionId: sessionId.slice(0, 120),
    properties: sanitizeAnalyticsProperties(raw.properties),
  };
}

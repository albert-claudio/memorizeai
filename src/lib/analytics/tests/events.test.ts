import {
  isAllowedAnalyticsEvent,
  isClientTrackableAnalyticsEvent,
  sanitizeAnalyticsEvent,
  sanitizeAnalyticsProperties,
} from '@/lib/analytics/events';

describe('analytics events', () => {
  it('accepts only whitelisted events', () => {
    expect(isAllowedAnalyticsEvent('landing_view')).toBe(true);
    expect(isAllowedAnalyticsEvent('made_up_event')).toBe(false);
  });

  it('separates public client events from server-only events', () => {
    expect(isClientTrackableAnalyticsEvent('landing_view')).toBe(true);
    expect(isClientTrackableAnalyticsEvent('signup_submit')).toBe(true);
    expect(isClientTrackableAnalyticsEvent('run_completed')).toBe(false);
    expect(isClientTrackableAnalyticsEvent('checkout_complete')).toBe(false);
    expect(isClientTrackableAnalyticsEvent('subscription_canceled')).toBe(false);
  });

  it('sanitizes valid client analytics payloads', () => {
    expect(
      sanitizeAnalyticsEvent({
        event: 'signup_click',
        sessionId: 'session-123',
        properties: { source: 'hero', count: 1, nested: { ignored: true } },
      })
    ).toEqual({
      event: 'signup_click',
      sessionId: 'session-123',
      properties: {
        source: 'hero',
        count: 1,
        nested: '[object Object]',
      },
    });
  });

  it('rejects invalid analytics payloads', () => {
    expect(
      sanitizeAnalyticsEvent({
        event: 'signup_click',
        properties: {},
      })
    ).toBeNull();

    expect(
      sanitizeAnalyticsEvent({
        event: 'made_up_event',
        sessionId: 'session-123',
      })
    ).toBeNull();
  });

  it('drops oversized properties payloads', () => {
    const oversized = sanitizeAnalyticsProperties(
      Object.fromEntries(
        Array.from({ length: 10 }, (_, index) => [`field_${index}`, 'x'.repeat(500)])
      )
    );

    expect(oversized).toEqual({});
  });
});

import {
  isAllowedAnalyticsEvent,
  sanitizeAnalyticsEvent,
  sanitizeAnalyticsProperties,
} from '@/lib/analytics/events';

describe('analytics events', () => {
  it('accepts only whitelisted events', () => {
    expect(isAllowedAnalyticsEvent('landing_view')).toBe(true);
    expect(isAllowedAnalyticsEvent('made_up_event')).toBe(false);
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

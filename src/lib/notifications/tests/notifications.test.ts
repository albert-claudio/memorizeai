import { describe, expect, it } from 'vitest';
import {
  buildDefaultNotificationPreference,
  getNotificationImportance,
} from '@/lib/notifications/defaults';
import {
  buildContentReadyNotification,
  buildDailyGoalMissedNotification,
  buildPlanRenewalNotification,
  buildReviewReminderNotification,
  buildStreakAlertNotification,
  buildTestNotification,
} from '@/lib/notifications/emitters';
import {
  buildNotificationEmailHtml,
  mapPreferenceToLegacyField,
  normalizeNotificationCtaUrl,
  validateNotificationType,
  validateNotificationUpdates,
} from '@/lib/notifications/service';

describe('notification defaults', () => {
  it('inherits push toggle from legacy prefs', () => {
    const pref = buildDefaultNotificationPreference('user_1', 'review_reminder', {
      notify_review: true,
      push_enabled: false,
    });

    expect(pref.enabled).toBe(true);
    expect(pref.browser_enabled).toBe(false);
    expect(pref.in_app_enabled).toBe(true);
  });

  it('marks plan renewal as high importance', () => {
    expect(getNotificationImportance('plan_renewal')).toBe('high');
  });
});

describe('notification validation helpers', () => {
  it('accepts valid notification types', () => {
    expect(validateNotificationType('content_ready')).toBe('content_ready');
  });

  it('rejects invalid notification types', () => {
    expect(() => validateNotificationType('unknown')).toThrow('Tipo de notificação inválido');
  });

  it('filters unsupported update keys', () => {
    expect(validateNotificationUpdates({
      enabled: false,
      browser_enabled: true,
      ignored: 'x',
    })).toEqual({
      enabled: false,
      browser_enabled: true,
    });
  });

  it('maps legacy flags correctly', () => {
    expect(mapPreferenceToLegacyField('marketing')).toBe('email_marketing');
    expect(mapPreferenceToLegacyField('content_ready')).toBe('notify_content_ready');
  });

  it('uses the expected default channels for the requested matrix', () => {
    const dailyGoal = buildDefaultNotificationPreference('user_1', 'daily_goal_missed');
    const contentReady = buildDefaultNotificationPreference('user_1', 'content_ready');
    const streakAlert = buildDefaultNotificationPreference('user_1', 'streak_alert');
    const planRenewal = buildDefaultNotificationPreference('user_1', 'plan_renewal');

    expect(dailyGoal.email_enabled).toBe(true);
    expect(dailyGoal.browser_enabled).toBe(true);
    expect(contentReady.email_enabled).toBe(false);
    expect(contentReady.browser_enabled).toBe(true);
    expect(streakAlert.email_enabled).toBe(false);
    expect(streakAlert.browser_enabled).toBe(true);
    expect(planRenewal.email_enabled).toBe(true);
    expect(planRenewal.browser_enabled).toBe(false);
  });
});

describe('notification emitters', () => {
  it('builds a content-ready notification from source context', () => {
    const notification = buildContentReadyNotification({
      userId: 'user_1',
      sourceId: 'source_1',
      sourceFilename: 'edital.pdf',
      processedChunks: 42,
      reusedChunks: 3,
    });

    expect(notification.type).toBe('content_ready');
    expect(notification.userId).toBe('user_1');
    expect(notification.dedupeKey).toBe('content-ready:source_1');
    expect(notification.metadata).toMatchObject({
      sourceId: 'source_1',
      filename: 'edital.pdf',
      chunks: 42,
      reusedChunks: 3,
    });
  });

  it('builds a plan renewal notification with billing metadata', () => {
    const notification = buildPlanRenewalNotification({
      userId: 'user_1',
      invoiceId: 'inv_1',
      subscriptionId: 'sub_1',
      billingReason: 'subscription_cycle',
      tier: 'pro',
      paidPeriodEnd: Date.UTC(2026, 2, 31),
    });

    expect(notification.type).toBe('plan_renewal');
    expect(notification.importance).toBe('high');
    expect(notification.dedupeKey).toBe('plan-renewal:inv_1');
    expect(notification.metadata).toMatchObject({
      invoiceId: 'inv_1',
      subscriptionId: 'sub_1',
      billingReason: 'subscription_cycle',
      tier: 'pro',
    });
  });

  it('builds study-session notifications with contextual dedupe keys', () => {
    const review = buildReviewReminderNotification({
      userId: 'user_1',
      overdueCount: 8,
      dateKey: '2026-03-28',
    });
    const dailyGoal = buildDailyGoalMissedNotification({
      userId: 'user_1',
      reviewedToday: 12,
      dailyReviews: 30,
      remaining: 18,
      dateKey: '2026-03-28',
    });
    const streak = buildStreakAlertNotification({
      userId: 'user_1',
      streak: 5,
      dateKey: '2026-03-28',
    });

    expect(review.dedupeKey).toBe('review-reminder:user_1:2026-03-28');
    expect(dailyGoal.dedupeKey).toBe('daily-goal:user_1:2026-03-28');
    expect(streak.dedupeKey).toBe('streak-alert:user_1:2026-03-28');
  });

  it('builds the manual test notification in settings context', () => {
    const notification = buildTestNotification({
      userId: 'user_1',
    });

    expect(notification.type).toBe('content_ready');
    expect(notification.ctaUrl).toBe('/dashboard/settings');
    expect(notification.metadata).toEqual({ source: 'manual_test' });
  });
});

describe('notification XSS hardening', () => {
  it('accepts only internal notification paths', () => {
    expect(normalizeNotificationCtaUrl('/dashboard/settings')).toBe('/dashboard/settings');
    expect(normalizeNotificationCtaUrl('dashboard/settings')).toBe('/dashboard/settings');
  });

  it('rejects dangerous or external notification urls', () => {
    expect(normalizeNotificationCtaUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeNotificationCtaUrl('https://evil.example/payload')).toBeNull();
    expect(normalizeNotificationCtaUrl('//evil.example/payload')).toBeNull();
  });

  it('escapes html in notification emails', () => {
    const html = buildNotificationEmailHtml({
      title: '<script>alert(1)</script>',
      body: '<img src=x onerror=alert(1)>',
      cta_label: '<b>Clique aqui</b>',
      cta_url: '/dashboard/settings',
    });

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;b&gt;Clique aqui&lt;/b&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
  });

  it('drops invalid call-to-action links from notification emails', () => {
    const html = buildNotificationEmailHtml({
      title: 'Teste',
      body: 'Mensagem',
      cta_label: 'Clique aqui',
      cta_url: 'javascript:alert(1)',
    });

    expect(html).not.toContain('href=');
  });
});

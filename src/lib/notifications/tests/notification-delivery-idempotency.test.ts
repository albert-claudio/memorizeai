import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDefaultNotificationPreference } from '@/lib/notifications/defaults';
import { NOTIFICATION_TYPES, type NotificationInboxRecord } from '@/lib/notifications/types';

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
  trackServer: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}));

vi.mock('@/lib/analytics/server-tracker', () => ({
  trackServer: mocks.trackServer,
}));

import { createAppNotification } from '@/lib/notifications/service';

describe('notification delivery idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not replay delivery channels when the dedupe key already exists', async () => {
    const existing: NotificationInboxRecord = {
      id: 'notification_1',
      user_id: 'user_1',
      notification_type: 'daily_goal_missed',
      importance: 'medium',
      title: 'Meta diária ainda não batida',
      body: 'Faltam 30 revisões.',
      cta_label: 'Voltar a estudar',
      cta_url: '/dashboard',
      metadata: {},
      dedupe_key: 'daily-goal:user_1:2026-07-16',
      read_at: null,
      created_at: Date.now(),
      expires_at: null,
    };

    const preferences = NOTIFICATION_TYPES.map((type) => ({
      ...buildDefaultNotificationPreference('user_1', type),
      browser_enabled: false,
    }));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const from = vi.fn((table: string) => {
      if (table === 'user_preferences') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { notify_daily_goal: true, push_enabled: false },
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === 'notification_preferences') {
        return {
          select: () => ({
            eq: async () => ({ data: preferences, error: null }),
          }),
        };
      }

      if (table === 'notification_inbox') {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({
                data: null,
                error: { code: '23505', message: 'duplicate key' },
              }),
            }),
          }),
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({ data: existing, error: null }),
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    const getUserById = vi.fn();
    mocks.getSupabaseAdmin.mockReturnValue({
      from,
      auth: { admin: { getUserById } },
    });

    const result = await createAppNotification({
      userId: 'user_1',
      type: 'daily_goal_missed',
      title: existing.title,
      body: existing.body,
      ctaLabel: existing.cta_label,
      ctaUrl: existing.cta_url,
      dedupeKey: existing.dedupe_key,
    });

    expect(result).toEqual(existing);
    expect(getUserById).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalledWith('notification_deliveries');
    expect(mocks.trackServer).not.toHaveBeenCalled();
  });
});

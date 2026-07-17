import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  BROWSER_PERMISSION_STATES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_IMPORTANCES,
  NOTIFICATION_TYPES,
  type BrowserPermissionState,
  type NotificationChannel,
  type NotificationImportance,
  type NotificationInboxRecord,
  type NotificationPreferenceRecord,
  type NotificationType,
} from '@/lib/notifications/types';
import {
  NOTIFICATION_DEFINITIONS,
  buildDefaultNotificationPreference,
  getNotificationImportance,
} from '@/lib/notifications/defaults';
import { escapeHtml, sanitizeAppNavigationPath } from '@/lib/security/xss';
import { trackServer } from '@/lib/analytics/server-tracker';

type LegacyNotificationPrefs = Partial<{
  notify_review: boolean;
  notify_daily_goal: boolean;
  notify_streak: boolean;
  notify_content_ready: boolean;
  notify_plan_renewal: boolean;
  email_marketing: boolean;
  push_enabled: boolean;
}>;

export type CreateNotificationParams = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  importance?: NotificationImportance;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  metadata?: Record<string, unknown>;
  dedupeKey?: string | null;
  expiresAt?: number | null;
};

type NotificationPreferenceUpdates = Partial<Pick<
  NotificationPreferenceRecord,
  'enabled' | 'in_app_enabled' | 'browser_enabled' | 'email_enabled'
>>;

type BrowserFeedItem = {
  notificationId: string;
  title: string;
  body: string;
  ctaUrl: string | null;
  importance: NotificationImportance;
  createdAt: number;
};

type PostgrestLikeError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

function isNotificationType(value: string): value is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

function isNotificationImportance(value: string): value is NotificationImportance {
  return (NOTIFICATION_IMPORTANCES as readonly string[]).includes(value);
}

function isNotificationChannel(value: string): value is NotificationChannel {
  return (NOTIFICATION_CHANNELS as readonly string[]).includes(value);
}

function isBrowserPermissionState(value: string): value is BrowserPermissionState {
  return (BROWSER_PERMISSION_STATES as readonly string[]).includes(value);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? '');
  }
  return String(error ?? '');
}

function isNotificationSchemaMissing(error: unknown): boolean {
  const err = error as PostgrestLikeError | null | undefined;
  const message = getErrorMessage(error).toLowerCase();
  const code = err?.code;

  if (code === '42P01' || code === 'PGRST205') return true;
  if (code === '42703' && message.includes('notification_')) return true;

  return (
    message.includes('notification_') &&
    (message.includes('does not exist') || message.includes('could not find'))
  );
}

function buildDefaultPreferenceMap(
  userId: string,
  legacyPrefs: LegacyNotificationPrefs = {}
): Record<NotificationType, NotificationPreferenceRecord> {
  return Object.fromEntries(
    NOTIFICATION_TYPES.map((type) => [type, buildDefaultNotificationPreference(userId, type, legacyPrefs)])
  ) as Record<NotificationType, NotificationPreferenceRecord>;
}

export function getNotificationDefinition(type: NotificationType) {
  return NOTIFICATION_DEFINITIONS[type];
}

export async function ensureNotificationPreferences(
  userId: string,
  legacyPrefs: LegacyNotificationPrefs = {}
): Promise<Record<NotificationType, NotificationPreferenceRecord>> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    if (isNotificationSchemaMissing(error)) {
      return buildDefaultPreferenceMap(userId, legacyPrefs);
    }
    throw new Error(`Erro ao carregar preferências de notificação: ${error.message}`);
  }

  const current = new Map<NotificationType, NotificationPreferenceRecord>();
  for (const row of (data ?? []) as NotificationPreferenceRecord[]) {
    if (isNotificationType(row.notification_type)) {
      current.set(row.notification_type, row);
    }
  }

  const missing = NOTIFICATION_TYPES
    .filter((type) => !current.has(type))
    .map((type) => buildDefaultNotificationPreference(userId, type, legacyPrefs));

  if (missing.length > 0) {
    const { data: inserted, error: insertError } = await (admin
      .from('notification_preferences') as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .upsert(missing, { onConflict: 'user_id,notification_type' })
      .select('*');

    if (insertError) {
      if (isNotificationSchemaMissing(insertError)) {
        return buildDefaultPreferenceMap(userId, legacyPrefs);
      }
      throw new Error(`Erro ao inicializar preferências de notificação: ${insertError.message}`);
    }

    for (const row of (inserted ?? []) as NotificationPreferenceRecord[]) {
      if (isNotificationType(row.notification_type)) {
        current.set(row.notification_type, row);
      }
    }
  }
  return Object.fromEntries(
    NOTIFICATION_TYPES.map((type) => [type, current.get(type) ?? buildDefaultNotificationPreference(userId, type, legacyPrefs)])
  ) as Record<NotificationType, NotificationPreferenceRecord>;
}

export async function listNotificationPreferences(userId: string) {
  const prefs = await ensureNotificationPreferences(userId);
  return NOTIFICATION_TYPES.map((type) => ({
    ...prefs[type],
    label: NOTIFICATION_DEFINITIONS[type].label,
    description: NOTIFICATION_DEFINITIONS[type].description,
    default_importance: NOTIFICATION_DEFINITIONS[type].importance,
  }));
}

export async function updateNotificationPreference(
  userId: string,
  type: NotificationType,
  updates: NotificationPreferenceUpdates
) {
  const admin = getSupabaseAdmin();
  const current = await ensureNotificationPreferences(userId, await getLegacyNotificationPrefs(userId));

  const payload = {
    user_id: userId,
    notification_type: type,
    ...updates,
    updated_at: Date.now(),
  };

  const { data, error } = await (admin
    .from('notification_preferences') as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .upsert(payload, { onConflict: 'user_id,notification_type' })
    .select('*')
    .single();

  if (error) {
    if (isNotificationSchemaMissing(error)) {
      return {
        ...current[type],
        ...updates,
        updated_at: Date.now(),
      } as NotificationPreferenceRecord;
    }
    throw new Error(`Erro ao salvar preferência de notificação: ${error.message}`);
  }

  return data as NotificationPreferenceRecord;
}

async function getLegacyNotificationPrefs(userId: string): Promise<LegacyNotificationPrefs> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('user_preferences')
      .select('notify_review, notify_daily_goal, notify_streak, notify_content_ready, notify_plan_renewal, email_marketing, push_enabled')
      .eq('user_id', userId)
      .single();

    if (error) {
      // Missing table/column → return empty defaults silently
      if (isNotificationSchemaMissing(error) || error.code === 'PGRST116') {
        return {};
      }
      console.warn('[Notifications] getLegacyNotificationPrefs query error:', error.message);
      return {};
    }

    return (data ?? {}) as LegacyNotificationPrefs;
  } catch (err) {
    console.warn('[Notifications] getLegacyNotificationPrefs unexpected error:', err instanceof Error ? err.message : err);
    return {};
  }
}

async function hasGrantedBrowserDevice(userId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { count, error } = await admin
    .from('browser_notification_devices')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('permission', 'granted');

  if (error) return false;
  return (count ?? 0) > 0;
}

async function resolveChannels(
  userId: string,
  type: NotificationType
): Promise<{ channels: NotificationChannel[]; preference: NotificationPreferenceRecord }> {
  const prefs = await ensureNotificationPreferences(userId, await getLegacyNotificationPrefs(userId));
  const pref = prefs[type];

  if (!pref.enabled) {
    return { channels: [], preference: pref };
  }

  const channels: NotificationChannel[] = [];

  if (pref.in_app_enabled) channels.push('in_app');
  if (pref.browser_enabled && await hasGrantedBrowserDevice(userId)) channels.push('browser');
  if (pref.email_enabled) {
    channels.push('email');
  }

  return { channels, preference: pref };
}

export function normalizeNotificationCtaUrl(path: string | null | undefined): string | null {
  return sanitizeAppNavigationPath(path, process.env.NEXT_PUBLIC_APP_URL ?? null);
}

function buildAbsoluteUrl(path: string | null | undefined): string | null {
  const normalizedPath = normalizeNotificationCtaUrl(path);
  if (!normalizedPath) return null;

  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

export function buildNotificationEmailHtml(notification: Pick<NotificationInboxRecord, 'title' | 'body' | 'cta_label' | 'cta_url'>): string {
  const ctaUrl = buildAbsoluteUrl(notification.cta_url);
  const safeTitle = escapeHtml(notification.title);
  const safeBody = escapeHtml(notification.body);
  const safeCtaLabel = escapeHtml(notification.cta_label || 'Abrir no app');

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;background:#0b0b0c;color:#f5f5f5;padding:24px">
      <div style="max-width:560px;margin:0 auto;background:#151518;border:1px solid #26262b;border-radius:16px;padding:24px">
        <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#a1a1aa;margin-bottom:12px">Vimens</div>
        <h1 style="font-size:22px;line-height:1.2;margin:0 0 12px">${safeTitle}</h1>
        <p style="font-size:15px;line-height:1.6;color:#d4d4d8;margin:0 0 20px">${safeBody}</p>
        ${ctaUrl ? `<a href="${ctaUrl}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600">${safeCtaLabel}</a>` : ''}
      </div>
    </div>
  `.trim();
}

async function getUserEmail(userId: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) return null;
  return data.user?.email ?? null;
}

async function sendEmailNotification(
  userId: string,
  notification: NotificationInboxRecord
): Promise<{ status: 'sent' | 'failed' | 'skipped'; externalId?: string | null; reason?: string }> {
  const apiKey = process.env.NEXT_RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { status: 'skipped', reason: 'NEXT_RESEND_API_KEY não configurada' };
  }

  const to = await getUserEmail(userId);
  if (!to) {
    return { status: 'failed', reason: 'Usuário sem email cadastrado' };
  }

  const from = process.env.NOTIFICATIONS_FROM_EMAIL?.trim() || 'Vimens <noreply@vimens.com.br>';
  const html = buildNotificationEmailHtml(notification);

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: notification.title,
        html,
      }),
      signal: AbortSignal.timeout(8000),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { status: 'failed', reason: body?.message || `HTTP ${response.status}` };
    }

    return { status: 'sent', externalId: body?.id ?? null };
  } catch (error) {
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message : 'Falha ao enviar email',
    };
  }
}

async function upsertDelivery(params: {
  notificationId: string;
  userId: string;
  channel: NotificationChannel;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  provider?: string | null;
  attempts?: number;
  externalId?: string | null;
  failureReason?: string | null;
}) {
  const admin = getSupabaseAdmin();
  const now = Date.now();
  const { error } = await (admin
    .from('notification_deliveries') as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .upsert({
      notification_id: params.notificationId,
      user_id: params.userId,
      channel: params.channel,
      status: params.status,
      provider: params.provider ?? null,
      attempts: params.attempts ?? 0,
      external_id: params.externalId ?? null,
      failure_reason: params.failureReason ?? null,
      delivered_at: params.status === 'sent' ? now : null,
      updated_at: now,
      created_at: now,
    }, {
      onConflict: 'notification_id,channel',
    });

  if (error) {
    if (isNotificationSchemaMissing(error)) return;
    throw new Error(`Erro ao registrar entrega de notificação: ${error.message}`);
  }
}

export async function createAppNotification(params: CreateNotificationParams) {
  const admin = getSupabaseAdmin();
  const importance = params.importance ?? getNotificationImportance(params.type);
  const { channels } = await resolveChannels(params.userId, params.type);

  if (channels.length === 0) {
    return null;
  }

  const insertPayload = {
    user_id: params.userId,
    notification_type: params.type,
    importance,
    title: params.title,
    body: params.body,
    cta_label: params.ctaLabel ?? null,
    cta_url: normalizeNotificationCtaUrl(params.ctaUrl ?? null),
    metadata: params.metadata ?? {},
    dedupe_key: params.dedupeKey ?? null,
    expires_at: params.expiresAt ?? null,
    created_at: Date.now(),
  };

  let notification: NotificationInboxRecord | null = null;
  const { data, error } = await (admin
    .from('notification_inbox') as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .insert(insertPayload)
    .select('*')
    .single();

  if (error) {
    if (isNotificationSchemaMissing(error)) {
      return null;
    }
    const duplicate = typeof error.code === 'string' && error.code === '23505';
    if (!duplicate || !params.dedupeKey) {
      throw new Error(`Erro ao criar notificação: ${error.message}`);
    }

    const { data: existing, error: existingError } = await admin
      .from('notification_inbox')
      .select('*')
      .eq('user_id', params.userId)
      .eq('dedupe_key', params.dedupeKey)
      .single();

    if (existingError) {
      throw new Error(`Erro ao recuperar notificação existente: ${existingError.message}`);
    }

    // The first insert already started the delivery pipeline. Replaying the
    // channels for a deduplicated event would resend the same email on every
    // cron or webhook retry.
    return existing as NotificationInboxRecord;
  } else {
    notification = data as NotificationInboxRecord;
  }

  if (!notification) return null;

  if (channels.includes('in_app')) {
    await upsertDelivery({
      notificationId: notification.id,
      userId: params.userId,
      channel: 'in_app',
      status: 'sent',
      provider: 'notification_inbox',
      attempts: 1,
    });
  }

  if (channels.includes('browser')) {
    await upsertDelivery({
      notificationId: notification.id,
      userId: params.userId,
      channel: 'browser',
      status: 'pending',
      provider: 'browser-notification-api',
    });
  }

  if (channels.includes('email')) {
    const result = await sendEmailNotification(params.userId, notification);
    await upsertDelivery({
      notificationId: notification.id,
      userId: params.userId,
      channel: 'email',
      status: result.status,
      provider: 'resend',
      attempts: 1,
      externalId: result.externalId ?? null,
      failureReason: result.reason ?? null,
    });
  }

  trackServer('notification_created', params.userId, {
    type: params.type,
    importance,
    channels,
  });

  return notification;
}

export async function registerBrowserNotificationDevice(params: {
  userId: string;
  deviceKey: string;
  permission: BrowserPermissionState;
  userAgent?: string | null;
}) {
  const admin = getSupabaseAdmin();
  const now = Date.now();
  const { error } = await (admin
    .from('browser_notification_devices') as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .upsert({
      user_id: params.userId,
      device_key: params.deviceKey,
      permission: params.permission,
      user_agent: params.userAgent ?? null,
      last_seen_at: now,
      updated_at: now,
      created_at: now,
    }, {
      onConflict: 'user_id,device_key',
    });

  if (error) {
    if (isNotificationSchemaMissing(error)) return;
    throw new Error(`Erro ao registrar dispositivo do navegador: ${error.message}`);
  }
}

export async function listNotificationInbox(userId: string, limit = 20) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('notification_inbox')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (isNotificationSchemaMissing(error)) return [];
    throw new Error(`Erro ao listar inbox de notificações: ${error.message}`);
  }

  return ((data ?? []) as NotificationInboxRecord[]).map((notification) => ({
    ...notification,
    cta_url: normalizeNotificationCtaUrl(notification.cta_url),
  }));
}

export async function markNotificationsRead(userId: string, ids: string[]) {
  if (ids.length === 0) return;
  const admin = getSupabaseAdmin();
  const { error } = await (admin
    .from('notification_inbox') as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .update({ read_at: Date.now() })
    .eq('user_id', userId)
    .in('id', ids);

  if (error) {
    if (isNotificationSchemaMissing(error)) return;
    throw new Error(`Erro ao marcar notificações como lidas: ${error.message}`);
  }
}

export async function listPendingBrowserNotifications(userId: string, limit = 10): Promise<BrowserFeedItem[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('notification_deliveries')
    .select(`
      notification_id,
      notification:notification_inbox!inner (
        id,
        title,
        body,
        cta_url,
        importance,
        created_at
      )
    `)
    .eq('user_id', userId)
    .eq('channel', 'browser')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    if (isNotificationSchemaMissing(error)) return [];
    throw new Error(`Erro ao buscar fila de navegador: ${error.message}`);
  }

  return ((data ?? []) as Array<{ notification?: Record<string, unknown> | Record<string, unknown>[] | null }>).flatMap((row) => {
    const notification = Array.isArray(row.notification) ? row.notification[0] : row.notification;
    if (!notification) return [];
    const importance = typeof notification.importance === 'string' && isNotificationImportance(notification.importance)
      ? notification.importance
      : 'medium';

    return [{
      notificationId: String(notification.id),
      title: String(notification.title),
      body: String(notification.body),
      ctaUrl: normalizeNotificationCtaUrl(notification.cta_url ? String(notification.cta_url) : null),
      importance,
      createdAt: Number(notification.created_at ?? Date.now()),
    }];
  });
}

export async function markBrowserNotificationsDelivered(userId: string, notificationIds: string[]) {
  const filtered = notificationIds.filter(Boolean);
  if (filtered.length === 0) return;

  const admin = getSupabaseAdmin();
  const now = Date.now();
  const { error } = await (admin
    .from('notification_deliveries') as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .update({
      status: 'sent',
      delivered_at: now,
      attempts: 1,
      updated_at: now,
    })
    .eq('user_id', userId)
    .eq('channel', 'browser')
    .eq('status', 'pending')
    .in('notification_id', filtered);

  if (error) {
    if (isNotificationSchemaMissing(error)) return;
    throw new Error(`Erro ao confirmar entrega no navegador: ${error.message}`);
  }
}

export function validateNotificationType(value: string): NotificationType {
  if (!isNotificationType(value)) {
    throw new Error('Tipo de notificação inválido');
  }
  return value;
}

export function validateBrowserPermissionState(value: string): BrowserPermissionState {
  if (!isBrowserPermissionState(value)) {
    throw new Error('Permissão do navegador inválida');
  }
  return value;
}

export function validateNotificationUpdates(updates: Record<string, unknown>): NotificationPreferenceUpdates {
  const allowed = ['enabled', 'in_app_enabled', 'browser_enabled', 'email_enabled'] as const;
  const result: NotificationPreferenceUpdates = {};

  for (const key of allowed) {
    if (typeof updates[key] === 'boolean') {
      result[key] = updates[key];
    }
  }

  return result;
}

export function mapPreferenceToLegacyField(type: NotificationType): keyof LegacyNotificationPrefs | null {
  const legacyKey = NOTIFICATION_DEFINITIONS[type].legacyKey;
  return legacyKey ?? null;
}

export function normalizeNotificationChannel(value: string): NotificationChannel {
  if (!isNotificationChannel(value)) {
    throw new Error('Canal inválido');
  }
  return value;
}

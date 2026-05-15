import type {
  NotificationImportance,
  NotificationPreferenceRecord,
  NotificationType,
} from '@/lib/notifications/types';

type LegacyNotificationPrefs = Partial<{
  notify_review: boolean;
  notify_daily_goal: boolean;
  notify_streak: boolean;
  notify_content_ready: boolean;
  notify_plan_renewal: boolean;
  email_marketing: boolean;
  push_enabled: boolean;
}>;

type NotificationDefinition = {
  label: string;
  description: string;
  importance: NotificationImportance;
  defaultChannels: {
    in_app: boolean;
    browser: boolean;
    email: boolean;
  };
  legacyKey?: keyof LegacyNotificationPrefs;
};

export const NOTIFICATION_DEFINITIONS: Record<NotificationType, NotificationDefinition> = {
  review_reminder: {
    label: 'Lembrete de revisar',
    description: 'Avisa quando existem revisões pendentes dentro do seu horário configurado.',
    importance: 'medium',
    defaultChannels: { in_app: true, browser: true, email: false },
    legacyKey: 'notify_review',
  },
  daily_goal_missed: {
    label: 'Meta diária não batida',
    description: 'Dispara quando o dia está acabando e sua meta de revisões ainda não foi atingida.',
    importance: 'medium',
    defaultChannels: { in_app: true, browser: true, email: true },
    legacyKey: 'notify_daily_goal',
  },
  streak_alert: {
    label: 'Aviso de sequência (streak)',
    description: 'Lembra você antes de quebrar uma sequência ativa de estudos.',
    importance: 'high',
    defaultChannels: { in_app: true, browser: true, email: false },
    legacyKey: 'notify_streak',
  },
  content_ready: {
    label: 'Conteúdo novo processado',
    description: 'Confirma quando um PDF ou documento terminou de ser processado.',
    importance: 'medium',
    defaultChannels: { in_app: true, browser: true, email: false },
    legacyKey: 'notify_content_ready',
  },
  plan_renewal: {
    label: 'Renovação do plano',
    description: 'Confirma cobranças, renovações e eventos importantes do seu plano.',
    importance: 'high',
    defaultChannels: { in_app: true, browser: false, email: true },
    legacyKey: 'notify_plan_renewal',
  },
  marketing: {
    label: 'Email marketing',
    description: 'Campanhas, lançamentos e novidades comerciais.',
    importance: 'low',
    defaultChannels: { in_app: false, browser: false, email: true },
    legacyKey: 'email_marketing',
  },
};

export function buildDefaultNotificationPreference(
  userId: string,
  type: NotificationType,
  legacy: LegacyNotificationPrefs = {}
): NotificationPreferenceRecord {
  const definition = NOTIFICATION_DEFINITIONS[type];
  const now = Date.now();
  const legacyEnabled = definition.legacyKey ? legacy[definition.legacyKey] : undefined;
  const pushEnabled = legacy.push_enabled ?? true;
  const enabled = legacyEnabled ?? true;

  return {
    user_id: userId,
    notification_type: type,
    enabled,
    in_app_enabled: enabled && definition.defaultChannels.in_app,
    browser_enabled: enabled && pushEnabled && definition.defaultChannels.browser,
    email_enabled: enabled && definition.defaultChannels.email,
    created_at: now,
    updated_at: now,
  };
}

export function getNotificationImportance(type: NotificationType): NotificationImportance {
  return NOTIFICATION_DEFINITIONS[type].importance;
}

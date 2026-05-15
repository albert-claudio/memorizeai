export const NOTIFICATION_TYPES = [
  'review_reminder',
  'daily_goal_missed',
  'streak_alert',
  'content_ready',
  'plan_renewal',
  'marketing',
] as const;

export const NOTIFICATION_IMPORTANCES = ['low', 'medium', 'high', 'critical'] as const;
export const NOTIFICATION_CHANNELS = ['in_app', 'browser', 'email'] as const;
export const BROWSER_PERMISSION_STATES = ['default', 'granted', 'denied'] as const;

export type NotificationType = typeof NOTIFICATION_TYPES[number];
export type NotificationImportance = typeof NOTIFICATION_IMPORTANCES[number];
export type NotificationChannel = typeof NOTIFICATION_CHANNELS[number];
export type BrowserPermissionState = typeof BROWSER_PERMISSION_STATES[number];

export interface NotificationPreferenceRecord {
  id?: string;
  user_id: string;
  notification_type: NotificationType;
  enabled: boolean;
  in_app_enabled: boolean;
  browser_enabled: boolean;
  email_enabled: boolean;
  created_at?: number;
  updated_at?: number;
}

export interface NotificationInboxRecord {
  id: string;
  user_id: string;
  notification_type: NotificationType;
  importance: NotificationImportance;
  title: string;
  body: string;
  cta_label: string | null;
  cta_url: string | null;
  metadata: Record<string, unknown>;
  dedupe_key: string | null;
  read_at: number | null;
  created_at: number;
  expires_at: number | null;
}

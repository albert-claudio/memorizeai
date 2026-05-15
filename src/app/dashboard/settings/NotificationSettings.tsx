'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { NOTIFICATIONS_REFRESH_EVENT } from '@/lib/notifications/browser-events';
import {
  SectionCard,
  SettingRow,
  Toggle,
} from './components';

type NotificationType =
  | 'review_reminder'
  | 'daily_goal_missed'
  | 'streak_alert'
  | 'content_ready'
  | 'plan_renewal'
  | 'marketing';

type NotificationPreferenceItem = {
  notification_type: NotificationType;
  enabled: boolean;
  in_app_enabled: boolean;
  browser_enabled: boolean;
  email_enabled: boolean;
  label: string;
  description: string;
  default_importance: 'low' | 'medium' | 'high' | 'critical';
};

type LegacyPrefs = {
  notify_review: boolean;
  notify_daily_goal: boolean;
  notify_streak: boolean;
  notify_content_ready: boolean;
  notify_plan_renewal: boolean;
  email_marketing: boolean;
  push_enabled: boolean;
};

type Props = {
  legacyPrefs: LegacyPrefs;
  updateLegacyPref: (key: keyof LegacyPrefs, value: boolean) => void;
};

const TYPE_TO_LEGACY: Partial<Record<NotificationType, keyof LegacyPrefs>> = {
  review_reminder: 'notify_review',
  daily_goal_missed: 'notify_daily_goal',
  streak_alert: 'notify_streak',
  content_ready: 'notify_content_ready',
  plan_renewal: 'notify_plan_renewal',
  marketing: 'email_marketing',
};

function getOrCreateDeviceKey() {
  const storageKey = 'vimens.notificationDeviceKey';
  const existing = window.localStorage.getItem(storageKey);
  if (existing) return existing;

  const created = `${Date.now()}-${crypto.randomUUID()}`;
  window.localStorage.setItem(storageKey, created);
  return created;
}

function getPermissionLabel(permission: NotificationPermission | 'unsupported') {
  if (permission === 'granted') return 'Ativado';
  if (permission === 'denied') return 'Bloqueado';
  if (permission === 'default') return 'Pendente';
  return 'Indisponível';
}

export function NotificationSettings({ legacyPrefs, updateLegacyPref }: Props) {
  const [items, setItems] = useState<NotificationPreferenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const [workingType, setWorkingType] = useState<string | null>(null);
  const [sendingTest, setSendingTest] = useState(false);
  const [recent, setRecent] = useState<Array<{
    id: string;
    title: string;
    body: string;
    read_at: number | null;
    created_at: number;
  }>>([]);

  const browserSupported = typeof window !== 'undefined' && 'Notification' in window;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prefsRes, inboxRes] = await Promise.all([
        fetch('/api/notifications/preferences', { cache: 'no-store' }),
        fetch('/api/notifications/inbox?limit=6', { cache: 'no-store' }),
      ]);

      if (prefsRes.ok) {
        const body = await prefsRes.json();
        setItems(Array.isArray(body?.items) ? body.items : []);
      }

      if (inboxRes.ok) {
        const body = await inboxRes.json();
        setRecent(Array.isArray(body?.items) ? body.items : []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPermission(browserSupported ? Notification.permission : 'unsupported');
    load().catch(() => {});
  }, [browserSupported, load]);

  const pushEnabled = useMemo(
    () => items.some((item) => item.browser_enabled),
    [items]
  );

  const patchPreference = useCallback(async (
    type: NotificationType,
    updates: Partial<Pick<NotificationPreferenceItem, 'enabled' | 'in_app_enabled' | 'browser_enabled' | 'email_enabled'>>
  ) => {
    setWorkingType(type);
    try {
      const response = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, updates }),
      });

      if (!response.ok) {
        throw new Error('Falha ao salvar preferência');
      }

      const updated = await response.json();
      setItems((current) => current.map((item) => (
        item.notification_type === type ? { ...item, ...updated } : item
      )));

      const legacyKey = TYPE_TO_LEGACY[type];
      if (legacyKey && typeof updates.enabled === 'boolean') {
        updateLegacyPref(legacyKey, updates.enabled);
      }
    } finally {
      setWorkingType(null);
    }
  }, [updateLegacyPref]);

  const handleBrowserPermission = useCallback(async () => {
    if (!browserSupported) return;
    const result = await Notification.requestPermission();
    setPermission(result);
    await fetch('/api/notifications/browser/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceKey: getOrCreateDeviceKey(),
        permission: result,
        userAgent: navigator.userAgent,
      }),
    }).catch(() => {});

    if (result === 'granted') {
      window.dispatchEvent(new Event(NOTIFICATIONS_REFRESH_EVENT));
      await load();
    }
  }, [browserSupported, load]);

  const handleToggleAllBrowser = useCallback(async (enabled: boolean) => {
    await Promise.all(items.map((item) => patchPreference(item.notification_type, { browser_enabled: enabled })));
    updateLegacyPref('push_enabled', enabled);
  }, [items, patchPreference, updateLegacyPref]);

  const handleTestNotification = useCallback(async () => {
    setSendingTest(true);
    try {
      const response = await fetch('/api/notifications/test', { method: 'POST' });
      if (!response.ok) {
        throw new Error('Falha ao enviar notificacao de teste');
      }

      window.dispatchEvent(new Event(NOTIFICATIONS_REFRESH_EVENT));
      await load();
    } finally {
      setSendingTest(false);
    }
  }, [load]);

  const unreadIds = recent.filter((item) => !item.read_at).map((item) => item.id);

  const markAllRead = useCallback(async () => {
    if (unreadIds.length === 0) return;
    await fetch('/api/notifications/inbox', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: unreadIds }),
    }).catch(() => {});
    await load();
  }, [load, unreadIds]);

  return (
    <>
      <SectionCard title="Notificações" icon="🔔">
        <SettingRow
          label="Permissão do navegador"
          description="Ativa alertas nativos no browser enquanto houver uma sessão do app aberta."
        >
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: permission === 'granted' ? '#86efac' : permission === 'denied' ? '#fca5a5' : '#a1a1aa' }}>
              {getPermissionLabel(permission)}
            </span>
            <button
              onClick={handleBrowserPermission}
              disabled={!browserSupported || permission === 'denied'}
              style={{
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.05)',
                color: '#f4f4f5',
                borderRadius: 10,
                padding: '10px 14px',
                cursor: !browserSupported || permission === 'denied' ? 'not-allowed' : 'pointer',
              }}
            >
              {permission === 'granted' ? 'Atualizar permissão' : 'Ativar no navegador'}
            </button>
          </div>
        </SettingRow>

        <SettingRow
          label="Push notifications"
          description="Liga ou desliga o canal do navegador para todos os tipos de notificação."
        >
          <Toggle value={pushEnabled || legacyPrefs.push_enabled} onChange={handleToggleAllBrowser} disabled={loading} />
        </SettingRow>

        <SettingRow
          label="Teste de notificação"
          description="Cria uma notificacao real de teste e forca uma checagem imediata no navegador."
        >
          <button
            onClick={handleTestNotification}
            disabled={sendingTest}
            style={{
              border: '1px solid rgba(99,102,241,0.35)',
              background: 'rgba(99,102,241,0.14)',
              color: '#c7d2fe',
              borderRadius: 10,
              padding: '10px 14px',
              cursor: sendingTest ? 'not-allowed' : 'pointer',
            }}
          >
            {sendingTest ? 'Enviando...' : 'Enviar teste'}
          </button>
        </SettingRow>
      </SectionCard>

      <SectionCard title="Preferências Por Evento" icon="⚙️">
        {loading ? (
          <div style={{ color: '#a1a1aa', fontSize: 14 }}>Carregando preferências...</div>
        ) : items.map((item) => (
          <div key={item.notification_type} style={{
            padding: '16px 0',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#f4f4f5', marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 12, color: '#a1a1aa', lineHeight: 1.6 }}>{item.description}</div>
              </div>
              <div style={{ fontSize: 12, color: item.default_importance === 'high' ? '#fbbf24' : '#71717a' }}>
                Importância: {item.default_importance}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 12, color: '#71717a', marginBottom: 8 }}>Ativo</div>
                <Toggle
                  value={item.enabled}
                  onChange={(value) => patchPreference(item.notification_type, { enabled: value })}
                  disabled={workingType === item.notification_type}
                />
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 12, color: '#71717a', marginBottom: 8 }}>Central do app</div>
                <Toggle
                  value={item.in_app_enabled}
                  onChange={(value) => patchPreference(item.notification_type, { in_app_enabled: value })}
                  disabled={workingType === item.notification_type || !item.enabled}
                />
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 12, color: '#71717a', marginBottom: 8 }}>Navegador</div>
                <Toggle
                  value={item.browser_enabled}
                  onChange={(value) => patchPreference(item.notification_type, { browser_enabled: value })}
                  disabled={workingType === item.notification_type || !item.enabled || permission !== 'granted'}
                />
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 12, color: '#71717a', marginBottom: 8 }}>Email</div>
                <Toggle
                  value={item.email_enabled}
                  onChange={(value) => patchPreference(item.notification_type, { email_enabled: value })}
                  disabled={workingType === item.notification_type || !item.enabled}
                />
              </div>
            </div>
          </div>
        ))}
      </SectionCard>

      <SectionCard title="Inbox Recente" icon="📥">
        <SettingRow
          label="Notificações recentes"
          description="Histórico persistente do que já foi emitido para o usuário."
        >
          <button
            onClick={markAllRead}
            disabled={unreadIds.length === 0}
            style={{
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'transparent',
              color: unreadIds.length === 0 ? '#71717a' : '#f4f4f5',
              borderRadius: 10,
              padding: '10px 14px',
              cursor: unreadIds.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            Marcar todas como lidas
          </button>
        </SettingRow>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {recent.length === 0 && (
            <div style={{ fontSize: 13, color: '#71717a' }}>Nenhuma notificação registrada ainda.</div>
          )}

          {recent.map((item) => (
            <div key={item.id} style={{
              border: '1px solid rgba(255,255,255,0.06)',
              background: item.read_at ? 'rgba(255,255,255,0.02)' : 'rgba(99,102,241,0.08)',
              borderRadius: 12,
              padding: 14,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#f4f4f5' }}>{item.title}</div>
                <div style={{ fontSize: 11, color: '#71717a' }}>
                  {new Date(item.created_at).toLocaleString('pt-BR')}
                </div>
              </div>
              <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.6, color: '#c4c4cb' }}>{item.body}</div>
            </div>
          ))}
        </div>
      </SectionCard>
    </>
  );
}

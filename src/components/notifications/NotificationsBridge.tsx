'use client';

import { useEffect, useRef } from 'react';
import { NOTIFICATIONS_REFRESH_EVENT } from '@/lib/notifications/browser-events';
import { sanitizeAppNavigationPath } from '@/lib/security/xss';

const POLL_INTERVAL_MS = 15000;
const DEVICE_KEY_STORAGE = 'vimens.notificationDeviceKey';

type BrowserFeedItem = {
  notificationId: string;
  title: string;
  body: string;
  ctaUrl: string | null;
  importance: 'low' | 'medium' | 'high' | 'critical';
  createdAt: number;
};

function getOrCreateDeviceKey() {
  if (typeof window === 'undefined') return '';
  const existing = window.localStorage.getItem(DEVICE_KEY_STORAGE);
  if (existing) return existing;
  const created = `${Date.now()}-${crypto.randomUUID()}`;
  window.localStorage.setItem(DEVICE_KEY_STORAGE, created);
  return created;
}

export function NotificationsBridge() {
  const shownRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;

    let cancelled = false;
    let intervalId: number | null = null;
    let polling = false;

    const syncDevice = async () => {
      const permission = Notification.permission;
      const deviceKey = getOrCreateDeviceKey();
      if (!deviceKey) return;

      await fetch('/api/notifications/browser/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceKey,
          permission,
          userAgent: navigator.userAgent,
        }),
      }).catch(() => {});
    };

    const showBrowserNotification = async (item: BrowserFeedItem) => {
      if (shownRef.current.has(item.notificationId)) return;
      shownRef.current.add(item.notificationId);

      const safePath = sanitizeAppNavigationPath(item.ctaUrl, window.location.origin);
      const absoluteUrl = safePath
        ? new URL(safePath, window.location.origin).toString()
        : window.location.origin;

      const registration = await navigator.serviceWorker.getRegistration().catch(() => null);
      if (registration?.showNotification) {
        await registration.showNotification(item.title, {
          body: item.body,
          tag: item.notificationId,
          data: { url: absoluteUrl, notificationId: item.notificationId },
        });
      } else {
        const notification = new Notification(item.title, { body: item.body, tag: item.notificationId });
        notification.onclick = () => {
          window.focus();
          window.location.href = absoluteUrl;
          notification.close();
        };
      }
    };

    const poll = async () => {
      if (polling) return;
      polling = true;

      try {
        if (Notification.permission !== 'granted') return;
        const response = await fetch('/api/notifications/browser-feed?limit=5', { cache: 'no-store' }).catch(() => null);
        if (!response?.ok) return;

        const body = await response.json().catch(() => ({ items: [] }));
        const items = Array.isArray(body?.items) ? body.items as BrowserFeedItem[] : [];
        if (items.length === 0) return;

        for (const item of items) {
          if (cancelled) return;
          await showBrowserNotification(item).catch(() => {});
        }

        await fetch('/api/notifications/browser-deliveries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notificationIds: items.map((item) => item.notificationId) }),
        }).catch(() => {});
      } finally {
        polling = false;
      }
    };

    const handleRefresh = () => {
      if (Notification.permission !== 'granted') return;
      void poll();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleRefresh();
      }
    };

    const boot = async () => {
      await navigator.serviceWorker.register('/notification-sw.js').catch(() => {});
      await syncDevice();
      await poll();
      intervalId = window.setInterval(poll, POLL_INTERVAL_MS);
    };

    boot().catch(() => {});
    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, handleRefresh);
    window.addEventListener('focus', handleRefresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
      window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, handleRefresh);
      window.removeEventListener('focus', handleRefresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return null;
}

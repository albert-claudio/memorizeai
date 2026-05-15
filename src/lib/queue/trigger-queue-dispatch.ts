import { getBaseUrl } from '@/lib/url';

/**
 * Best-effort internal dispatcher kick.
 *
 * Used to keep the queue draining without waiting for the next external cron
 * interval after a slot is released.
 */
export function triggerQueueDispatch(reason?: string): void {
  const secret = process.env.RUNS_PROCESS_INTERNAL_SECRET?.trim();
  if (!secret) return;

  const baseUrl = getBaseUrl();
  const body = reason ? JSON.stringify({ reason }) : '{}';

  fetch(`${baseUrl}/api/cron/process-queue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': secret,
    },
    body,
  }).catch(() => {});
}

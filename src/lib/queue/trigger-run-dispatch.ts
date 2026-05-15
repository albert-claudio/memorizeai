import { getBaseUrl } from '@/lib/url';

/**
 * Best-effort immediate dispatch when a new run is created.
 *
 * The normal queue/cron path remains the source of truth. This just removes
 * the "wait for the next cron tick" penalty for fresh runs.
 */
export function triggerRunDispatch(runId: string): void {
  const secret = process.env.RUNS_PROCESS_INTERNAL_SECRET?.trim();
  if (!secret) return;

  const baseUrl = getBaseUrl();
  fetch(`${baseUrl}/api/runs/process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': secret,
    },
    body: JSON.stringify({ runId }),
  }).catch(() => {});
}

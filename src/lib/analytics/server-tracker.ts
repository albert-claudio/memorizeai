/**
 * Server-side analytics — for tracking events from API routes, server actions, webhooks.
 * Writes directly to Supabase using the service role key.
 */

import { createClient } from '@supabase/supabase-js';
import { isAllowedAnalyticsEvent } from '@/lib/analytics/events';

let _supabaseAdmin: ReturnType<typeof createClient> | null = null;

function getAdmin() {
  if (_supabaseAdmin) return _supabaseAdmin;
  _supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  return _supabaseAdmin;
}

/**
 * Track a server-side event (fire-and-forget).
 *
 * @example
 * trackServer('run_completed', userId, { runId, itemsGenerated: 10 });
 * trackServer('checkout_complete', userId, { priceId });
 */
export function trackServer(
  event: string,
  userId?: string,
  properties: Record<string, unknown> = {}
): void {
  if (!isAllowedAnalyticsEvent(event)) {
    return;
  }

  const supabase = getAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase.from('app_events') as any)
    .insert({
      event,
      user_id: userId || null,
      session_id: null,
      properties,
    })
    .then(() => {})
    .catch(() => {});
}

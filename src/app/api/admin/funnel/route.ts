import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin, isAdminSuccess } from '@/lib/auth/admin-guard';

/**
 * GET /api/admin/funnel?days=7
 *
 * Returns aggregated funnel metrics from app_events.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (!isAdminSuccess(authResult)) return authResult;

  const { searchParams } = new URL(request.url);
  const days = Math.min(Math.max(1, parseInt(searchParams.get('days') || '7')), 90);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Get counts per event type and distinct user/session tracking
  const { data: events, error } = await supabase
    .from('app_events')
    .select('event, user_id, session_id')
    .gte('created_at', since);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Aggregate counts
  const counts: Record<string, number> = {};
  const uniqueUsers = new Set<string>();
  const uniqueSessions = new Set<string>();

  for (const row of events ?? []) {
    counts[row.event] = (counts[row.event] || 0) + 1;
    if (row.user_id) uniqueUsers.add(row.user_id);
    if (row.session_id) uniqueSessions.add(row.session_id);
  }

  // Ordered funnel stages
  const funnel = [
    'landing_view',
    'signup_click',
    'signup_submit',
    'email_confirmed',
    'login_success',
    'dashboard_view',
    'upload_start',
    'upload_complete',
    'run_created',
    'run_completed',
    'upgrade_view',
    'checkout_click',
    'checkout_complete',
    'subscription_canceled',
  ];

  const funnelData = funnel.map(stage => ({
    stage,
    count: counts[stage] || 0,
  }));

  return NextResponse.json({
    days,
    since,
    funnel: funnelData,
    otherEvents: Object.entries(counts)
      .filter(([event]) => !funnel.includes(event))
      .map(([event, count]) => ({ event, count })),
    totals: {
      events: events?.length ?? 0,
      uniqueUsers: uniqueUsers.size,
      uniqueSessions: uniqueSessions.size,
    },
  });
}

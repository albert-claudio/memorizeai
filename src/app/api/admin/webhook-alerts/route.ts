import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin, isAdminSuccess } from '@/lib/auth/admin-guard';

// Service role client for admin queries (bypasses RLS)
function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ============================================================================
// GET /api/admin/webhook-alerts
// Returns recent webhook events with permanent_failure or transient_failure outcomes.
// Supports ?hours=N (default 24) and ?outcome=permanent_failure|transient_failure.
// ============================================================================

export async function GET(request: Request) {
  // Admin guard
  const authResult = await requireAdmin(request);
  if (!isAdminSuccess(authResult)) return authResult;

  const url = new URL(request.url);
  const hoursParam = parseInt(url.searchParams.get('hours') ?? '24', 10);
  const hours = Number.isFinite(hoursParam) && hoursParam > 0 ? Math.min(hoursParam, 720) : 24;
  const outcomeFilter = url.searchParams.get('outcome'); // null = both

  const supabase = getAdmin();
  const cutoffMs = Date.now() - hours * 60 * 60 * 1000;

  try {
    let query = supabase
      .from('webhook_logs')
      .select('event_id, event_type, outcome, outcome_reason, success, error_message, processing_time_ms, created_at')
      .gte('created_at', new Date(cutoffMs).toISOString())
      .order('created_at', { ascending: false })
      .limit(100);

    if (outcomeFilter === 'permanent_failure' || outcomeFilter === 'transient_failure') {
      query = query.eq('outcome', outcomeFilter);
    } else {
      query = query.in('outcome', ['permanent_failure', 'transient_failure']);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Admin Webhook Alerts] Query error:', error);
      return NextResponse.json({ error: 'Erro ao buscar alertas.' }, { status: 500 });
    }

    // Summary counts
    const permanent = (data ?? []).filter(r => r.outcome === 'permanent_failure').length;
    const transient = (data ?? []).filter(r => r.outcome === 'transient_failure').length;

    return NextResponse.json({
      period: `last ${hours}h`,
      summary: {
        permanent_failure: permanent,
        transient_failure: transient,
        total: permanent + transient,
      },
      events: data ?? [],
    });
  } catch (err) {
    console.error('[Admin Webhook Alerts] Error:', err);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}

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

export async function GET(request: Request) {
  // 1. Admin guard
  const authResult = await requireAdmin(request);
  if (!isAdminSuccess(authResult)) return authResult;

  const supabase = getAdmin();
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();
  const sevenDaysAgoMs = now - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgoMs = now - 30 * 24 * 60 * 60 * 1000;

  try {
    // 2. Total users
    const { count: totalUsers } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null);

    // 3. Pro users (is_pro OR admin_override_pro)
    const { count: proUsers } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .or('is_pro.eq.true,admin_override_pro.eq.true');

    // 4. Runs today
    const { count: runsToday } = await supabase
      .from('runs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayStartMs);

    // 5. Runs last 7 days
    const { count: runs7d } = await supabase
      .from('runs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgoMs);

    // 6. Tokens by model (last 30 days)
    const { data: runsData } = await supabase
      .from('runs')
      .select('model_used, token_count')
      .gte('created_at', thirtyDaysAgoMs)
      .not('model_used', 'is', null);

    // Aggregate tokens by model in JS (Supabase doesn't support GROUP BY in REST)
    const modelMap = new Map<string, { totalTokens: number; totalRuns: number }>();
    for (const run of runsData ?? []) {
      const model = run.model_used || 'unknown';
      const existing = modelMap.get(model) ?? { totalTokens: 0, totalRuns: 0 };
      existing.totalTokens += run.token_count ?? 0;
      existing.totalRuns += 1;
      modelMap.set(model, existing);
    }

    const tokensByModel = Array.from(modelMap.entries()).map(([model, data]) => ({
      model,
      totalTokens: data.totalTokens,
      totalRuns: data.totalRuns,
    }));

    return NextResponse.json({
      totalUsers: totalUsers ?? 0,
      proUsers: proUsers ?? 0,
      runsToday: runsToday ?? 0,
      runs7d: runs7d ?? 0,
      tokensByModel,
    });
  } catch (err) {
    console.error('[Admin Stats] Error:', err);
    return NextResponse.json(
      { error: 'Erro ao carregar estatísticas.' },
      { status: 500 }
    );
  }
}

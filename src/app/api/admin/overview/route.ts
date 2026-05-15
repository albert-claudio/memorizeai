import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAdminSuccess } from '@/lib/auth/admin-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type ProfileStatusRow = {
  subscription_status: string | null;
  subscription_tier: string | null;
  subscription_period_end: number | null;
};

type SubscriptionRow = {
  status: string;
  current_period_end: number | null;
  created_at: number;
};

type RunModelRow = {
  model_used: string | null;
  token_count: number | null;
  status: string;
};

type ReviewGradeRow = {
  grade: number;
};

type ActivityRow = {
  id: string;
  event: string;
  user_id: string | null;
  properties: Record<string, unknown> | null;
  created_at: string;
};

type RunQueueRow = {
  id: string;
  user_id: string;
  objective: string;
  status: string;
  model_used: string | null;
  error_message: string | null;
  created_at: number;
  updated_at: number;
};

const ESTIMATED_COST_PER_1K_TOKENS_USD = 0.002;

function startOfTodayMs() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

async function safeCount(
  table: string,
  build?: (query: ReturnType<ReturnType<typeof getSupabaseAdmin>['from']>['select']) => unknown
) {
  const supabase = getSupabaseAdmin();
  let query = supabase.from(table).select('id', { count: 'exact', head: true });
  if (build) query = build(query as never) as typeof query;
  const { count, error } = await query;
  if (error) {
    console.warn(`[Admin Overview] count ${table} failed:`, error.message);
    return 0;
  }
  return count ?? 0;
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (!isAdminSuccess(authResult)) return authResult;

  const supabase = getSupabaseAdmin();
  const now = Date.now();
  const today = startOfTodayMs();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const sevenDaysIso = new Date(sevenDaysAgo).toISOString();
  const thirtyDaysIso = new Date(thirtyDaysAgo).toISOString();

  const [
    totalUsers,
    proUsers,
    newUsers7d,
    active7d,
    active30d,
    runsQueued,
    runsProcessing,
    runsErrored24h,
    runsCompleted7d,
    totalSources,
    sourcesQueued,
    sourcesProcessing,
    sourcesCompleted,
    sourcesErrored,
    totalDecks,
    totalCards,
    reviews7d,
    pendingEmailDeliveries,
    failedEmailDeliveries,
    webhookFailures24h,
  ] = await Promise.all([
    safeCount('profiles', (q) => q.is('deleted_at', null)),
    safeCount('profiles', (q) => q.is('deleted_at', null).or('is_pro.eq.true,admin_override_pro.eq.true')),
    safeCount('profiles', (q) => q.is('deleted_at', null).gte('created_at', sevenDaysAgo)),
    safeCount('app_events', (q) => q.gte('created_at', sevenDaysIso).not('user_id', 'is', null)),
    safeCount('app_events', (q) => q.gte('created_at', thirtyDaysIso).not('user_id', 'is', null)),
    safeCount('runs', (q) => q.is('deleted_at', null).eq('status', 'queued')),
    safeCount('runs', (q) => q.is('deleted_at', null).eq('status', 'processando')),
    safeCount('runs', (q) => q.is('deleted_at', null).eq('status', 'erro').gte('updated_at', now - 24 * 60 * 60 * 1000)),
    safeCount('runs', (q) => q.is('deleted_at', null).eq('status', 'concluido').gte('created_at', sevenDaysAgo)),
    safeCount('sources', (q) => q.is('deleted_at', null)),
    safeCount('sources', (q) => q.is('deleted_at', null).eq('status', 'na_fila')),
    safeCount('sources', (q) => q.is('deleted_at', null).eq('status', 'processando')),
    safeCount('sources', (q) => q.is('deleted_at', null).eq('status', 'concluido')),
    safeCount('sources', (q) => q.is('deleted_at', null).eq('status', 'erro')),
    safeCount('decks', (q) => q.is('deleted_at', null)),
    safeCount('cards', (q) => q.is('deleted_at', null)),
    safeCount('card_reviews', (q) => q.gte('reviewed_at', sevenDaysAgo)),
    safeCount('notification_deliveries', (q) => q.eq('channel', 'email').eq('status', 'pending')),
    safeCount('notification_deliveries', (q) => q.eq('channel', 'email').eq('status', 'failed')),
    safeCount('webhook_logs', (q) => q.gte('created_at', now - 24 * 60 * 60 * 1000).or('success.eq.false,outcome.in.(permanent_failure,transient_failure)')),
  ]);

  const { data: profiles } = await supabase
    .from('profiles')
    .select('subscription_status, subscription_tier, subscription_period_end')
    .is('deleted_at', null);

  const statusCounts = new Map<string, number>();
  for (const profile of (profiles ?? []) as ProfileStatusRow[]) {
    const status = profile.subscription_status || 'free';
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
  }

  const { data: subscriptions } = await supabase
    .from('subscriptions')
    .select('status, current_period_end, created_at')
    .order('created_at', { ascending: false })
    .limit(500);

  const subscriptionRows = (subscriptions ?? []) as SubscriptionRow[];
  const activeSubscriptions = subscriptionRows.filter((sub) =>
    ['active', 'trialing'].includes(sub.status)
  ).length;
  const canceledSubscriptions = subscriptionRows.filter((sub) =>
    ['canceled', 'unpaid'].includes(sub.status)
  ).length;

  const { data: runsByModel } = await supabase
    .from('runs')
    .select('model_used, token_count, status')
    .gte('created_at', thirtyDaysAgo)
    .not('model_used', 'is', null)
    .limit(1000);

  const modelMap = new Map<string, { totalTokens: number; totalRuns: number; errors: number }>();
  for (const run of (runsByModel ?? []) as RunModelRow[]) {
    const model = run.model_used || 'unknown';
    const item = modelMap.get(model) ?? { totalTokens: 0, totalRuns: 0, errors: 0 };
    item.totalTokens += run.token_count ?? 0;
    item.totalRuns += 1;
    if (run.status === 'erro') item.errors += 1;
    modelMap.set(model, item);
  }

  const tokensByModel = Array.from(modelMap.entries()).map(([model, data]) => ({ model, ...data }));
  const totalTokens30d = tokensByModel.reduce((sum, row) => sum + row.totalTokens, 0);

  const { data: reviewGrades } = await supabase
    .from('card_reviews')
    .select('grade')
    .gte('reviewed_at', thirtyDaysAgo)
    .limit(5000);

  const reviewRows = (reviewGrades ?? []) as ReviewGradeRow[];
  const successfulReviews = reviewRows.filter((review) => review.grade >= 2).length;
  const retentionRate30d = reviewRows.length > 0 ? successfulReviews / reviewRows.length : 0;

  const { data: queueRows } = await supabase
    .from('runs')
    .select('id, user_id, objective, status, model_used, error_message, created_at, updated_at')
    .is('deleted_at', null)
    .in('status', ['queued', 'na_fila', 'pendente', 'processando', 'erro'])
    .order('updated_at', { ascending: false })
    .limit(12);

  const { data: recentActivities } = await supabase
    .from('app_events')
    .select('id, event, user_id, properties, created_at')
    .order('created_at', { ascending: false })
    .limit(12);

  const { data: recentErrors } = await supabase
    .from('runs')
    .select('id, user_id, status, model_used, error_message, last_error_code, last_error_provider, updated_at')
    .eq('status', 'erro')
    .order('updated_at', { ascending: false })
    .limit(10);

  return NextResponse.json({
    metrics: {
      totalUsers,
      proUsers,
      newUsers7d,
      active7d,
      active30d,
      conversionRate: totalUsers > 0 ? proUsers / totalUsers : 0,
      runsQueued,
      runsProcessing,
      runsErrored24h,
      runsCompleted7d,
      totalSources,
      sourcesQueued,
      sourcesProcessing,
      sourcesCompleted,
      sourcesErrored,
      sourceSuccessRate: sourcesCompleted + sourcesErrored > 0
        ? sourcesCompleted / (sourcesCompleted + sourcesErrored)
        : 0,
      totalDecks,
      totalCards,
      reviews7d,
      reviews30d: reviewRows.length,
      retentionRate30d,
      pendingEmailDeliveries,
      failedEmailDeliveries,
      webhookFailures24h,
    },
    finance: {
      activeSubscriptions,
      canceledSubscriptions,
      statusCounts: Object.fromEntries(statusCounts.entries()),
      mrr: null,
      churn: activeSubscriptions + canceledSubscriptions > 0
        ? canceledSubscriptions / (activeSubscriptions + canceledSubscriptions)
        : 0,
    },
    usage: {
      tokensByModel,
      totalTokens30d,
      estimatedCostUsd30d: (totalTokens30d / 1000) * ESTIMATED_COST_PER_1K_TOKENS_USD,
      recentErrors: recentErrors ?? [],
    },
    pipeline: {
      queue: (queueRows ?? []) as RunQueueRow[],
      queueStatus: [
        { label: 'Na fila', value: runsQueued + sourcesQueued },
        { label: 'Processando', value: runsProcessing + sourcesProcessing },
        { label: 'Erro 24h', value: runsErrored24h + sourcesErrored },
        { label: 'Concluidos 7d', value: runsCompleted7d },
      ],
    },
    learning: {
      retentionRate30d,
      reviewSample30d: reviewRows.length,
      successfulReviews30d: successfulReviews,
      studyHeatmap: [
        { label: '06-10', value: Math.round(active7d * 0.17) },
        { label: '10-14', value: Math.round(active7d * 0.22) },
        { label: '14-18', value: Math.round(active7d * 0.25) },
        { label: '18-22', value: Math.round(active7d * 0.31) },
        { label: '22-02', value: Math.round(active7d * 0.05) },
      ],
    },
    activity: ((recentActivities ?? []) as ActivityRow[]).map((item) => ({
      id: item.id,
      user: item.user_id ? `@${item.user_id.slice(0, 8)}` : '@visitante',
      action: item.event,
      status: eventStatus(item.event),
      time: item.created_at,
      properties: item.properties ?? {},
    })),
    generatedAt: new Date().toISOString(),
    period: {
      todayStart: today,
      sevenDaysAgo,
      thirtyDaysAgo,
    },
  });
}

function eventStatus(event: string) {
  if (event.includes('complete') || event.includes('confirmed') || event.includes('success')) {
    return 'concluido';
  }

  if (event.includes('start') || event.includes('created') || event.includes('click')) {
    return 'processando';
  }

  return 'registrado';
}

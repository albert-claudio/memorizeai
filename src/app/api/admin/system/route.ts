import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAdminSuccess } from '@/lib/auth/admin-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

async function count(table: string, build: (query: ReturnType<ReturnType<typeof getSupabaseAdmin>['from']>['select']) => unknown) {
  const supabase = getSupabaseAdmin();
  let query = supabase.from(table).select('id', { count: 'exact', head: true });
  query = build(query as never) as typeof query;
  const { count: total, error } = await query;
  if (error) {
    console.warn(`[Admin System] count ${table} failed:`, error.message);
    return 0;
  }
  return total ?? 0;
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (!isAdminSuccess(authResult)) return authResult;

  const supabase = getSupabaseAdmin();
  const now = Date.now();

  const [
    queued,
    retryWait,
    processing,
    staleProcessing,
    failed24h,
    pendingEmails,
    failedEmails,
  ] = await Promise.all([
    count('runs', (q) => q.is('deleted_at', null).eq('status', 'queued')),
    count('runs', (q) => q.is('deleted_at', null).eq('status', 'retry_wait')),
    count('runs', (q) => q.is('deleted_at', null).eq('status', 'processando')),
    count('runs', (q) => q.is('deleted_at', null).eq('status', 'processando').lt('lease_expires_at', now)),
    count('runs', (q) => q.is('deleted_at', null).eq('status', 'erro').gte('updated_at', now - 24 * 60 * 60 * 1000)),
    count('notification_deliveries', (q) => q.eq('channel', 'email').eq('status', 'pending')),
    count('notification_deliveries', (q) => q.eq('channel', 'email').eq('status', 'failed')),
  ]);

  const { data: queue } = await supabase
    .from('runs')
    .select('id, user_id, status, objective, model_preference, model_used, attempt_count, provider_attempt_count, next_attempt_at, lease_expires_at, last_error_code, last_error_provider, error_message, created_at, updated_at')
    .in('status', ['queued', 'retry_wait', 'processando', 'erro'])
    .order('updated_at', { ascending: false })
    .limit(50);

  const { data: emailDeliveries } = await supabase
    .from('notification_deliveries')
    .select('id, user_id, channel, status, provider, attempts, failure_reason, created_at, updated_at')
    .in('status', ['pending', 'failed'])
    .order('updated_at', { ascending: false })
    .limit(30);

  const { data: webhookLogs } = await supabase
    .from('webhook_logs')
    .select('event_id, event_type, success, error_message, processing_time_ms, created_at')
    .eq('success', false)
    .order('created_at', { ascending: false })
    .limit(30);

  return NextResponse.json({
    summary: {
      queued,
      retryWait,
      processing,
      staleProcessing,
      failed24h,
      pendingEmails,
      failedEmails,
      qstashConfigured: Boolean(
        process.env.QSTASH_CURRENT_SIGNING_KEY ||
        process.env.QSTASH_NEXT_SIGNING_KEY ||
        process.env.QSTASH_REGION
      ),
      cronSecretConfigured: Boolean(process.env.CRON_SECRET),
      aiKeysConfigured: {
        openai: Boolean(process.env.OPENAI_API_KEY),
        gemini: Boolean(process.env.GEMINI_API_KEY),
        groq: Boolean(process.env.GROQ_API_KEY),
      },
    },
    queue: queue ?? [],
    emailDeliveries: emailDeliveries ?? [],
    webhookLogs: webhookLogs ?? [],
    generatedAt: new Date().toISOString(),
  });
}

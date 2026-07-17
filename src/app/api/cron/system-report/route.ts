import { NextRequest, NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';
import { authenticateCronRequest } from '@/lib/security/cron-auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createLogger } from '@/lib/logger';
import { isTelegramConfigured, sendTelegramMessage } from '@/lib/telegram';

type HealthStatus = 'healthy' | 'attention' | 'unhealthy';
type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

interface CheckResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

interface CountMetric {
  value: number;
  ok: boolean;
  error?: string;
}

type CountQuery = PromiseLike<{
  count: number | null;
  error: { message: string } | null;
}>;

async function runCheck(name: string, fn: () => Promise<void>): Promise<[string, CheckResult]> {
  const start = Date.now();

  try {
    await fn();
    return [name, { ok: true, latencyMs: Date.now() - start }];
  } catch (error) {
    return [
      name,
      {
        ok: false,
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      },
    ];
  }
}

async function countMetric(query: CountQuery): Promise<CountMetric> {
  try {
    const { count, error } = await query;
    if (error) return { value: 0, ok: false, error: error.message };
    return { value: count ?? 0, ok: true };
  } catch (error) {
    return {
      value: 0,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function failedMetric(error: string): CountMetric {
  return { value: 0, ok: false, error };
}

function formatCheck(name: string, check: CheckResult): string {
  const suffix = check.ok ? `${check.latencyMs}ms` : check.error ?? 'failed';
  return `- ${name}: ${check.ok ? 'OK' : 'FAIL'} (${suffix})`;
}

function formatMetric(name: string, metric: CountMetric): string {
  return `- ${name}: ${metric.value}${metric.ok ? '' : ` (query failed: ${metric.error})`}`;
}

function getStatus(checks: Record<string, CheckResult>, metrics: Record<string, CountMetric>): HealthStatus {
  const hasFailedChecks = Object.values(checks).some((check) => !check.ok);
  const hasFailedQueries = Object.values(metrics).some((metric) => !metric.ok);

  if (hasFailedChecks || hasFailedQueries) return 'unhealthy';

  if (
    metrics.staleProcessing.value > 0 ||
    metrics.failedRuns24h.value > 0 ||
    metrics.failedWebhooks24h.value > 0 ||
    metrics.failedEmails.value > 0
  ) {
    return 'attention';
  }

  return 'healthy';
}

function hasQStashAuthConfigured(): boolean {
  return Boolean(process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY);
}

function formatReport(params: {
  status: HealthStatus;
  checks: Record<string, CheckResult>;
  metrics: Record<string, CountMetric>;
  durationMs: number;
  generatedAt: string;
}) {
  const { status, checks, metrics, durationMs, generatedAt } = params;

  return [
    'Vimens system report',
    `Status: ${status.toUpperCase()}`,
    `Generated at: ${generatedAt}`,
    `Report duration: ${durationMs}ms`,
    '',
    'Health checks',
    formatCheck('Public app URL', checks.publicApp),
    formatCheck('Supabase', checks.supabase),
    formatCheck('Redis', checks.redis),
    '',
    'Queue',
    formatMetric('Queued runs', metrics.queued),
    formatMetric('Retry wait runs', metrics.retryWait),
    formatMetric('Processing runs', metrics.processing),
    formatMetric('Stale processing runs', metrics.staleProcessing),
    '',
    'Runs in last 24h',
    formatMetric('Created', metrics.createdRuns24h),
    formatMetric('Completed', metrics.completedRuns24h),
    formatMetric('Failed', metrics.failedRuns24h),
    '',
    'Webhooks and notifications',
    formatMetric('Failed webhooks 24h', metrics.failedWebhooks24h),
    formatMetric('Pending emails', metrics.pendingEmails),
    formatMetric('Failed emails', metrics.failedEmails),
    '',
    'Runtime config',
    `- QStash auth configured: ${hasQStashAuthConfigured()}`,
    `- CRON_SECRET fallback configured: ${Boolean(process.env.CRON_SECRET?.trim())}`,
    `- Telegram configured: ${isTelegramConfigured()}`,
    `- AI keys: openai=${Boolean(process.env.OPENAI_API_KEY)}, gemini=${Boolean(process.env.GEMINI_API_KEY)}, groq=${Boolean(process.env.GROQ_API_KEY)}`,
  ].join('\n');
}

function buildFailedMetrics(error: string): Record<string, CountMetric> {
  return {
    queued: failedMetric(error),
    retryWait: failedMetric(error),
    processing: failedMetric(error),
    staleProcessing: failedMetric(error),
    createdRuns24h: failedMetric(error),
    completedRuns24h: failedMetric(error),
    failedRuns24h: failedMetric(error),
    failedWebhooks24h: failedMetric(error),
    pendingEmails: failedMetric(error),
    failedEmails: failedMetric(error),
  };
}

async function collectChecks(params: {
  supabase: SupabaseAdminClient | null;
  supabaseInitError: string | null;
  publicAppUrl?: string;
}): Promise<Record<string, CheckResult>> {
  const { supabase, supabaseInitError, publicAppUrl } = params;

  const checkEntries = await Promise.all([
    runCheck('publicApp', async () => {
      if (!publicAppUrl) throw new Error('NEXT_PUBLIC_APP_URL is not configured');
      const response = await fetch(publicAppUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
      });

      if (response.status >= 500) {
        throw new Error(`Public app returned ${response.status}`);
      }
    }),
    runCheck('supabase', async () => {
      if (!supabase) throw new Error(supabaseInitError ?? 'Supabase admin client is not available');
      const { error } = await supabase.from('profiles').select('id').limit(1);
      if (error) throw new Error(error.message);
    }),
    runCheck('redis', async () => {
      const redis = getRedis();
      if (!redis) throw new Error('Redis is not configured');
      await redis.ping();
    }),
  ]);

  return Object.fromEntries(checkEntries) as Record<string, CheckResult>;
}

async function collectMetrics(params: {
  supabase: SupabaseAdminClient | null;
  supabaseInitError: string | null;
  now: number;
  last24h: number;
}): Promise<Record<string, CountMetric>> {
  const { supabase, supabaseInitError, now, last24h } = params;
  if (!supabase) return buildFailedMetrics(supabaseInitError ?? 'Supabase admin client is not available');

  const [
    queued,
    retryWait,
    processing,
    staleProcessing,
    createdRuns24h,
    completedRuns24h,
    failedRuns24h,
    failedWebhooks24h,
    pendingEmails,
    failedEmails,
  ] = await Promise.all([
    countMetric(supabase.from('runs').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'queued')),
    countMetric(supabase.from('runs').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'retry_wait')),
    countMetric(supabase.from('runs').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'processando')),
    countMetric(supabase.from('runs').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'processando').lt('lease_expires_at', now)),
    countMetric(supabase.from('runs').select('id', { count: 'exact', head: true }).is('deleted_at', null).gte('created_at', last24h)),
    countMetric(supabase.from('runs').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'concluido').gte('updated_at', last24h)),
    countMetric(supabase.from('runs').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'erro').gte('updated_at', last24h)),
    countMetric(supabase.from('webhook_logs').select('id', { count: 'exact', head: true }).eq('success', false).gte('created_at', last24h)),
    countMetric(supabase.from('notification_deliveries').select('id', { count: 'exact', head: true }).eq('channel', 'email').eq('status', 'pending')),
    countMetric(supabase.from('notification_deliveries').select('id', { count: 'exact', head: true }).eq('channel', 'email').eq('status', 'failed')),
  ]);

  return {
    queued,
    retryWait,
    processing,
    staleProcessing,
    createdRuns24h,
    completedRuns24h,
    failedRuns24h,
    failedWebhooks24h,
    pendingEmails,
    failedEmails,
  };
}

export async function GET(request: NextRequest) {
  const logger = createLogger({ component: 'system-report-cron' });
  const startedAt = Date.now();

  const auth = await authenticateCronRequest(request);
  if (!auth.ok) {
    const log = auth.status >= 500 ? logger.error.bind(logger) : logger.warn.bind(logger);
    log('cron_auth_failed', { status: auth.status, reason: auth.error });
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let supabase: SupabaseAdminClient | null = null;
  let supabaseInitError: string | null = null;
  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    supabaseInitError = error instanceof Error ? error.message : String(error);
    logger.error('supabase_admin_init_failed', { error: supabaseInitError });
  }

  const now = Date.now();
  const last24h = now - 24 * 60 * 60 * 1000;
  const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  const [checks, metrics] = await Promise.all([
    collectChecks({ supabase, supabaseInitError, publicAppUrl }),
    collectMetrics({ supabase, supabaseInitError, now, last24h }),
  ]);

  const status = getStatus(checks, metrics);
  const generatedAt = new Date().toISOString();
  const report = formatReport({
    status,
    checks,
    metrics,
    generatedAt,
    durationMs: Date.now() - startedAt,
  });

  const telegram = await sendTelegramMessage(report);
  if (!telegram.ok) {
    logger.error('telegram_report_failed', { healthStatus: status, status: telegram.status, error: telegram.error });
  } else {
    const log = status === 'healthy' ? logger.info.bind(logger) : logger.warn.bind(logger);
    log('telegram_report_sent', { status, checks, metrics });
  }

  return NextResponse.json({
    ok: true,
    status,
    checks,
    metrics,
    telegram,
    delivered: telegram.ok,
    generatedAt,
  });
}

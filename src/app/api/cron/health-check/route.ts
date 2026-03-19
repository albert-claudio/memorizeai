import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';
import { getRedis } from '@/lib/redis';
import { authenticateCronRequest } from '@/lib/security/cron-auth';

/**
 * GET /api/cron/health-check
 *
 * Scheduled job (every 10 minutes).
 * Checks Supabase DB and Redis connectivity.
 * Sends Discord alert if any check fails.
 */
export async function GET(request: NextRequest) {
  const logger = createLogger({ component: 'health-check' });

  const auth = await authenticateCronRequest(request);
  if (!auth.ok) {
    const log = auth.status >= 500 ? logger.error.bind(logger) : logger.warn.bind(logger);
    log('cron_auth_failed', { status: auth.status, reason: auth.error });
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const checks: Record<string, { ok: boolean; latencyMs: number; error?: string }> = {};

  try {
    const start = Date.now();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { error } = await supabase.from('profiles').select('id').limit(1);
    const latencyMs = Date.now() - start;
    checks.supabase = { ok: !error, latencyMs, error: error?.message };
  } catch (err) {
    checks.supabase = { ok: false, latencyMs: 0, error: String(err) };
  }

  try {
    const start = Date.now();
    const redis = getRedis();
    if (redis) {
      await redis.ping();
      checks.redis = { ok: true, latencyMs: Date.now() - start };
    } else {
      checks.redis = { ok: false, latencyMs: 0, error: 'Redis not configured' };
    }
  } catch (err) {
    checks.redis = { ok: false, latencyMs: 0, error: String(err) };
  }

  const allOk = Object.values(checks).every(c => c.ok);
  const maxLatency = Math.max(...Object.values(checks).map(c => c.latencyMs));
  const slow = maxLatency > 2000;

  if (!allOk || slow) {
    logger.error('health_check_failed', { checks, maxLatency });

    const alertUrl = process.env.WEBHOOK_ALERT_URL;
    if (alertUrl) {
      const failures = Object.entries(checks)
        .filter(([, c]) => !c.ok)
        .map(([name, c]) => `**${name}**: ${c.error || 'timeout'}`)
        .join('\n');

      const msg = slow && allOk
        ? `⚠️ **Health Check Slow**\nMax latency: ${maxLatency}ms\n${Object.entries(checks).map(([name, check]) => `${name}: ${check.latencyMs}ms`).join('\n')}`
        : `🔴 **Health Check Failed**\n${failures}`;

      fetch(alertUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: msg }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    }
  } else {
    logger.info('health_check_ok', { checks });
  }

  return NextResponse.json(
    {
      ok: allOk && !slow,
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 }
  );
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';
import { getRedis } from '@/lib/redis';
import { authenticateCronRequest } from '@/lib/security/cron-auth';
import { dispatchOperationalAlert } from '@/lib/operational-alerts';

/**
 * GET /api/cron/health-check
 *
 * Scheduled job (every 10 minutes).
 * Checks Supabase DB and Redis connectivity, alerting both Telegram and the
 * configured external webhook when a check fails or is slow.
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
  } catch (error) {
    checks.supabase = { ok: false, latencyMs: 0, error: String(error) };
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
  } catch (error) {
    checks.redis = { ok: false, latencyMs: 0, error: String(error) };
  }

  const allOk = Object.values(checks).every((check) => check.ok);
  const maxLatency = Math.max(...Object.values(checks).map((check) => check.latencyMs));
  const slow = maxLatency > 2000;

  let delivery = null;
  if (!allOk || slow) {
    logger.error('health_check_failed', { checks, maxLatency });

    const failures = Object.entries(checks)
      .filter(([, check]) => !check.ok)
      .map(([name, check]) => `**${name}**: ${check.error || 'timeout'}`)
      .join('\n');
    const message = slow && allOk
      ? `[ATENCAO] Health check lento\nLatencia maxima: ${maxLatency}ms\n${Object.entries(checks).map(([name, check]) => `${name}: ${check.latencyMs}ms`).join('\n')}`
      : `[CRITICO] Health check falhou\n${failures}`;

    delivery = await dispatchOperationalAlert(message);
    logger[delivery.telegram.ok || delivery.webhook.ok ? 'warn' : 'error'](
      'health_check_alert_dispatched',
      { checks, maxLatency, delivery },
    );
  } else {
    logger.info('health_check_ok', { checks });
  }

  return NextResponse.json(
    {
      ok: allOk && !slow,
      checks,
      delivery,
      timestamp: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 }
  );
}

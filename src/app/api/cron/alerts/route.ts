import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';

const WINDOW_MS = 30 * 60 * 1000; // 30 minutes

// Thresholds for alerting
const THRESHOLDS = {
  runErrors: 3,       // Alert if > 3 run errors in 30 min
  webhookFailures: 2, // Alert if > 2 webhook failures in 30 min
};

/**
 * GET /api/cron/alerts
 *
 * Vercel Cron job (every 30 minutes).
 * Scans for anomalies in runs, webhooks, and dispatches aggregated Discord alerts.
 */
export async function GET(request: NextRequest) {
  const logger = createLogger({ component: 'alerts-cron' });

  // Auth
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const cutoff = Date.now() - WINDOW_MS;
  const alerts: string[] = [];

  // ── 1. Run errors ──────────────────────────────────────────────────────
  const { count: runErrorCount } = await supabase
    .from('runs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'erro')
    .gt('updated_at', cutoff);

  if ((runErrorCount ?? 0) > THRESHOLDS.runErrors) {
    alerts.push(`🔴 **${runErrorCount} runs com erro** nos últimos 30 min (threshold: ${THRESHOLDS.runErrors})`);
    logger.warn('alert_run_errors', { count: runErrorCount });
  }

  // ── 2. Stuck runs (still pending/processing) ──────────────────────────
  const { count: stuckCount } = await supabase
    .from('runs')
    .select('id', { count: 'exact', head: true })
    .in('status', ['pendente', 'processando'])
    .lt('created_at', cutoff);

  if ((stuckCount ?? 0) > 0) {
    alerts.push(`⚠️ **${stuckCount} runs travadas** há mais de 30 min`);
    logger.warn('alert_stuck_runs', { count: stuckCount });
  }

  // ── 3. Webhook failures ────────────────────────────────────────────────
  const cutoffISO = new Date(cutoff).toISOString();
  const { count: webhookFailCount } = await supabase
    .from('webhook_logs')
    .select('id', { count: 'exact', head: true })
    .eq('success', false)
    .gt('created_at', cutoffISO);

  if ((webhookFailCount ?? 0) > THRESHOLDS.webhookFailures) {
    alerts.push(`🔴 **${webhookFailCount} webhooks falhando** nos últimos 30 min (threshold: ${THRESHOLDS.webhookFailures})`);
    logger.warn('alert_webhook_failures', { count: webhookFailCount });
  }

  // ── Dispatch ───────────────────────────────────────────────────────────
  const summary = {
    runErrors: runErrorCount ?? 0,
    stuckRuns: stuckCount ?? 0,
    webhookFailures: webhookFailCount ?? 0,
    alertsSent: alerts.length,
  };

  if (alerts.length > 0) {
    const alertUrl = process.env.WEBHOOK_ALERT_URL;
    if (alertUrl) {
      const message = `📊 **Alerta Operacional - Memoriza**\n\n${alerts.join('\n')}\n\n_Verificado em ${new Date().toISOString()}_`;

      fetch(alertUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: message }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    }

    logger.warn('alerts_dispatched', summary);
  } else {
    logger.info('alerts_all_clear', summary);
  }

  return NextResponse.json({ ok: true, ...summary });
}

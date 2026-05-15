import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';
import { authenticateCronRequest } from '@/lib/security/cron-auth';

const WINDOW_MS = 30 * 60 * 1000;

const THRESHOLDS = {
  runErrors: 3,
  webhookFailures: 2,
};

/**
 * GET /api/cron/alerts
 *
 * Scheduled job (every 30 minutes).
 * Scans for anomalies in runs, webhooks, and dispatches aggregated Discord alerts.
 */
export async function GET(request: NextRequest) {
  const logger = createLogger({ component: 'alerts-cron' });

  const auth = await authenticateCronRequest(request);
  if (!auth.ok) {
    const log = auth.status >= 500 ? logger.error.bind(logger) : logger.warn.bind(logger);
    log('cron_auth_failed', { status: auth.status, reason: auth.error });
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const cutoff = Date.now() - WINDOW_MS;
  const alerts: string[] = [];

  const { count: runErrorCount } = await supabase
    .from('runs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'erro')
    .gt('updated_at', cutoff);

  if ((runErrorCount ?? 0) > THRESHOLDS.runErrors) {
    alerts.push(`🔴 **${runErrorCount} runs com erro** nos últimos 30 min (threshold: ${THRESHOLDS.runErrors})`);
    logger.warn('alert_run_errors', { count: runErrorCount });
  }

  const { count: stuckCount } = await supabase
    .from('runs')
    .select('id', { count: 'exact', head: true })
    .in('status', ['pendente', 'processando'])
    .lt('created_at', cutoff);

  if ((stuckCount ?? 0) > 0) {
    alerts.push(`⚠️ **${stuckCount} runs travadas** há mais de 30 min`);
    logger.warn('alert_stuck_runs', { count: stuckCount });
  }

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

  const summary = {
    runErrors: runErrorCount ?? 0,
    stuckRuns: stuckCount ?? 0,
    webhookFailures: webhookFailCount ?? 0,
    alertsSent: alerts.length,
  };

  if (alerts.length > 0) {
    const alertUrl = process.env.WEBHOOK_ALERT_URL;
    if (alertUrl) {
      const message = `📊 **Alerta Operacional - Vimens**\n\n${alerts.join('\n')}\n\n_Verificado em ${new Date().toISOString()}_`;

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

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';
import { authenticateCronRequest } from '@/lib/security/cron-auth';

const MAX_ATTEMPTS = 3;
const PENDING_THRESHOLD_MS = 2 * 60 * 1000;
const PROCESSING_THRESHOLD_MS = 10 * 60 * 1000;

/**
 * GET /api/cron/recover-runs
 *
 * Scheduled job that runs every 5 minutes.
 * Recovers runs stuck in 'pendente' or 'processando' by re-triggering
 * the processor, or marking them as permanently failed.
 */
export async function GET(request: NextRequest) {
  const logger = createLogger({ component: 'recover-runs' });

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

  const internalSecret = process.env.RUNS_PROCESS_INTERNAL_SECRET?.trim();
  if (!internalSecret) {
    logger.error('cron_misconfigured', { message: 'RUNS_PROCESS_INTERNAL_SECRET not set' });
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const { getBaseUrl } = await import('@/lib/url');
  const baseUrl = getBaseUrl();
  const now = Date.now();

  let retriggered = 0;
  let markedFailed = 0;

  const pendingCutoff = now - PENDING_THRESHOLD_MS;

  const { data: stuckPending } = await supabase
    .from('runs')
    .select('id, attempt_count, created_at')
    .eq('status', 'pendente')
    .is('deleted_at', null)
    .lt('created_at', pendingCutoff)
    .order('created_at', { ascending: true })
    .limit(20);

  for (const run of stuckPending ?? []) {
    const attempts: number = run.attempt_count ?? 0;

    if (attempts >= MAX_ATTEMPTS) {
      await supabase
        .from('runs')
        .update({
          status: 'erro',
          error_message: `Excedeu limite de ${MAX_ATTEMPTS} tentativas (recovery cron)`,
          updated_at: now,
        })
        .eq('id', run.id);
      markedFailed++;
      logger.info('cron_marked_failed', { runId: run.id, attempts });
    } else {
      fetch(`${baseUrl}/api/runs/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': internalSecret,
        },
        body: JSON.stringify({ runId: run.id }),
      }).catch(err => {
        logger.error('cron_retrigger_failed', { runId: run.id, error: String(err) });
      });
      retriggered++;
      logger.info('cron_retriggered', { runId: run.id, attempt: attempts + 1 });
    }
  }

  const processingCutoff = now - PROCESSING_THRESHOLD_MS;

  const { data: stuckProcessing } = await supabase
    .from('runs')
    .select('id, attempt_count, started_at')
    .eq('status', 'processando')
    .is('deleted_at', null)
    .lt('started_at', processingCutoff)
    .order('started_at', { ascending: true })
    .limit(20);

  for (const run of stuckProcessing ?? []) {
    const attempts: number = run.attempt_count ?? 0;

    if (attempts >= MAX_ATTEMPTS) {
      await supabase
        .from('runs')
        .update({
          status: 'erro',
          error_message: `Travou em processamento após ${MAX_ATTEMPTS} tentativas (recovery cron)`,
          completed_at: now,
          updated_at: now,
        })
        .eq('id', run.id);
      markedFailed++;
      logger.info('cron_marked_failed', { runId: run.id, attempts });
    } else {
      // The idempotency guard in /api/runs/process accepts the run because
      // started_at is old enough.
      fetch(`${baseUrl}/api/runs/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': internalSecret,
        },
        body: JSON.stringify({ runId: run.id }),
      }).catch(err => {
        logger.error('cron_retrigger_failed', { runId: run.id, error: String(err) });
      });
      retriggered++;
      logger.info('cron_retriggered_stuck', { runId: run.id, attempt: attempts + 1 });
    }
  }

  const summary = {
    scanned: {
      pending: stuckPending?.length ?? 0,
      processing: stuckProcessing?.length ?? 0,
    },
    retriggered,
    markedFailed,
  };

  logger.info('cron_complete', summary);

  return NextResponse.json({ ok: true, ...summary });
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';

const MAX_ATTEMPTS = 3;
const PENDING_THRESHOLD_MS = 2 * 60 * 1000;      // 2 minutes
const PROCESSING_THRESHOLD_MS = 10 * 60 * 1000;   // 10 minutes

/**
 * GET /api/cron/recover-runs
 *
 * Vercel Cron job that runs every 5 minutes.
 * Recovers runs stuck in 'pendente' or 'processando' by re-triggering
 * the processor, or marking them as permanently failed.
 *
 * Auth: Bearer CRON_SECRET (Vercel injects this automatically for cron jobs)
 */
export async function GET(request: NextRequest) {
  const logger = createLogger({ component: 'recover-runs' });

  // ── Auth ──────────────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    logger.error('cron_misconfigured', { message: 'CRON_SECRET not set' });
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    logger.warn('cron_auth_failed', {});
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Setup ─────────────────────────────────────────────────────────────
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

  // ── 1. Stuck PENDENTE runs (created > 2 min ago) ──────────────────────
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
      // Re-trigger processing
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

  // ── 2. Stuck PROCESSANDO runs (started > 10 min ago) ──────────────────
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
      // Re-trigger — the idempotency guard in /api/runs/process will
      // accept the run because started_at is old enough.
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

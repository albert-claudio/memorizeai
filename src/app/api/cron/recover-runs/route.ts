import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';
import { authenticateCronRequest } from '@/lib/security/cron-auth';
import { captureWarning } from '@/lib/sentry';
import { releaseSlot, resolveSlotKey } from '@/lib/ai/provider-capacity';

const MAX_ATTEMPTS = 5; // Aligned with retry-policy.ts
const LEASE_EXPIRY_THRESHOLD_MS = parseInt(process.env.RUN_LEASE_MS || '180000', 10);
const STALE_QUEUED_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes — queued runs forgotten beyond this

/**
 * GET /api/cron/recover-runs
 *
 * Scheduled job that runs every 5 minutes.
 * Recovers runs that are stuck — NOT the primary dispatch mechanism.
 * Primary dispatch is handled by /api/cron/process-queue.
 *
 * This cron handles:
 * 1. Runs stuck in 'processando' with expired leases → return to 'queued'
 * 2. Runs in 'queued' or 'retry_wait' forgotten beyond a threshold → return to 'queued'
 * 3. Runs that have exhausted attempts → mark as 'erro'
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

  const now = Date.now();

  let recoveredFromProcessing = 0;
  let recoveredFromStale = 0;
  let markedFailed = 0;

  // ── 1. Recover runs stuck in 'processando' with expired leases ──────────

  const { data: stuckProcessing } = await supabase
    .from('runs')
    .select('id, attempt_count, lease_expires_at, started_at, objective, model_preference')
    .eq('status', 'processando')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(100);

  for (const run of stuckProcessing ?? []) {
    const attempts: number = run.attempt_count ?? 0;
    const hasLease = typeof run.lease_expires_at === 'number';
    const leaseExpired = hasLease && Number(run.lease_expires_at) <= now;
    const leaseActive = hasLease && Number(run.lease_expires_at) > now;
    const missingLeaseTooLong =
      !hasLease &&
      typeof run.started_at === 'number' &&
      now - Number(run.started_at) > LEASE_EXPIRY_THRESHOLD_MS;

    if (leaseActive) continue;
    if (!leaseExpired && !missingLeaseTooLong) continue;

    if (attempts >= MAX_ATTEMPTS) {
      await releaseSlot(resolveSlotKey(run.objective, run.model_preference || 'auto', run.id), run.id);
      await supabase
        .from('runs')
        .update({
          status: 'erro',
          error_message: `Travou em processamento após ${attempts} tentativas (recovery cron)`,
          completed_at: now,
          lease_expires_at: null,
          processing_node: null,
          updated_at: now,
        })
        .eq('id', run.id);
      markedFailed++;
      logger.info('cron_marked_failed', { runId: run.id, attempts, reason: 'stuck_processing' });
      captureWarning(`Run stuck in processing permanently failed after ${attempts} attempts`, {
        route: 'cron/recover-runs',
        tags: { runId: run.id, reason: 'stuck_processing' },
        extra: { attempts },
      });
    } else {
      // Return to queue — the dispatcher will pick it up
      await releaseSlot(resolveSlotKey(run.objective, run.model_preference || 'auto', run.id), run.id);
      await supabase
        .from('runs')
        .update({
          status: 'queued',
          started_at: null,
          next_attempt_at: now,
          lease_expires_at: null,
          processing_node: null,
          updated_at: now,
        })
        .eq('id', run.id);
      recoveredFromProcessing++;
      logger.info('cron_recovered_processing', { runId: run.id, attempt: attempts });
    }
  }

  // ── 2. Recover stale 'queued' or 'retry_wait' runs ──────────────────────

  const staleCutoff = now - STALE_QUEUED_THRESHOLD_MS;

  const { data: staleQueued } = await supabase
    .from('runs')
    .select('id, attempt_count, status, next_attempt_at')
    .in('status', ['queued', 'retry_wait'])
    .is('deleted_at', null)
    .lt('next_attempt_at', staleCutoff) // next_attempt_at is way in the past
    .order('created_at', { ascending: true })
    .limit(100);

  for (const run of staleQueued ?? []) {
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
      logger.info('cron_marked_failed', { runId: run.id, attempts, reason: 'stale_queued' });
      captureWarning(`Run permanently failed after ${attempts} attempts (cron recovery)`, {
        route: 'cron/recover-runs',
        tags: { runId: run.id, reason: 'max_attempts_stale' },
        extra: { attempts },
      });
    } else {
      // Reset to queued with next_attempt_at = now
      await supabase
        .from('runs')
        .update({
          status: 'queued',
          started_at: null,
          next_attempt_at: now,
          updated_at: now,
        })
        .eq('id', run.id);
      recoveredFromStale++;
      logger.info('cron_recovered_stale', { runId: run.id, status: run.status, attempt: attempts });
    }
  }

  // ── 3. Also recover 'pendente' runs (legacy status before migration) ────

  const { data: legacyPendente } = await supabase
    .from('runs')
    .select('id, attempt_count, created_at')
    .eq('status', 'pendente')
    .is('deleted_at', null)
    .lt('created_at', staleCutoff)
    .order('created_at', { ascending: true })
    .limit(100);

  let legacyRecovered = 0;
  for (const run of legacyPendente ?? []) {
    const attempts: number = run.attempt_count ?? 0;
    if (attempts >= MAX_ATTEMPTS) {
      await supabase
        .from('runs')
        .update({
          status: 'erro',
          error_message: `Excedeu limite de ${MAX_ATTEMPTS} tentativas (pendente legado)`,
          updated_at: now,
        })
        .eq('id', run.id);
      markedFailed++;
    } else {
      await supabase
        .from('runs')
        .update({
          status: 'queued',
          started_at: null,
          next_attempt_at: now,
          updated_at: now,
        })
        .eq('id', run.id);
      legacyRecovered++;
    }
  }

  const summary = {
    scanned: {
      processing: stuckProcessing?.length ?? 0,
      staleQueued: staleQueued?.length ?? 0,
      legacyPendente: legacyPendente?.length ?? 0,
    },
    recoveredFromProcessing,
    recoveredFromStale,
    legacyRecovered,
    markedFailed,
  };

  logger.info('cron_complete', summary);

  return NextResponse.json({ ok: true, ...summary });
}

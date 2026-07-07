import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';
import { authenticateCronRequest } from '@/lib/security/cron-auth';
import {
  resolveSlotKey,
  acquireSlot,
  releaseSlot,
  getCapacitySummary,
  type ProviderSlotKey,
} from '@/lib/ai/provider-capacity';
import { getFallbackSlotKey } from '@/lib/runs/process/lifecycle/capacity';

// ── Configuration ─────────────────────────────────────────────────────────────

const QUEUE_BATCH_SIZE = parseInt(process.env.QUEUE_BATCH_SIZE || '100', 10);
const RUN_LEASE_MS = parseInt(process.env.RUN_LEASE_MS || '180000', 10);

/**
 * /api/cron/process-queue
 *
 * Queue dispatcher — runs on a short interval (every 1 min via Vercel cron,
 * or every 10s via QStash). Picks eligible runs from the queue and dispatches
 * them to the processor, respecting per-provider concurrency limits.
 *
 * This replaces the old fire-and-forget pattern where createRun would
 * immediately call /api/runs/process.
 */
function isInternalDispatchAuthorized(request: NextRequest, internalSecret: string | null): boolean {
  return Boolean(internalSecret) && request.headers.get('x-internal-secret') === internalSecret;
}

function getPossibleSlotKeys(
  objective: string,
  preference: string | null | undefined,
  runId: string,
): ProviderSlotKey[] {
  const primary = resolveSlotKey(objective, preference || 'auto', runId);
  const fallback = getFallbackSlotKey(objective, preference, primary);
  return fallback ? [primary, fallback] : [primary];
}

async function handleProcessQueue(request: NextRequest) {
  const logger = createLogger({ component: 'process-queue' });

  const internalSecret = process.env.RUNS_PROCESS_INTERNAL_SECRET?.trim() ?? null;
  const internalKick = isInternalDispatchAuthorized(request, internalSecret);

  if (!internalKick) {
    const auth = await authenticateCronRequest(request);
    if (!auth.ok) {
      const logFn = auth.status >= 500 ? logger.error.bind(logger) : logger.warn.bind(logger);
      logFn('cron_auth_failed', { status: auth.status, reason: auth.error });
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
  } else {
    logger.info('internal_dispatch_kick', { method: request.method });
  }

  const responseKind = internalKick ? 'internal' : 'cron';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  if (!internalSecret) {
    logger.error('cron_misconfigured', { message: 'RUNS_PROCESS_INTERNAL_SECRET not set' });
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const { getBaseUrl } = await import('@/lib/url');
  const baseUrl = getBaseUrl();
  const now = Date.now();
  const nodeId = `dispatch-${now}-${Math.random().toString(36).slice(2, 8)}`;

  // ── Step 1: Fetch eligible runs ───────────────────────────────────────────

  const { data: eligibleRuns, error: queryError } = await supabase
    .from('runs')
    .select('id, objective, model_preference, status, lease_expires_at, attempt_count')
    .in('status', ['queued', 'retry_wait'])
    .is('deleted_at', null)
    .lte('next_attempt_at', now)
    .order('created_at', { ascending: true })
    .limit(QUEUE_BATCH_SIZE);

  if (queryError) {
    logger.error('queue_query_failed', { error: queryError.message });
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  if (!eligibleRuns || eligibleRuns.length === 0) {
    return NextResponse.json({ ok: true, dispatched: 0, skipped: 0, message: 'Queue empty' });
  }

  logger.info('queue_batch', { eligible: eligibleRuns.length, batchSize: QUEUE_BATCH_SIZE });

  // ── Step 2: Process each run ──────────────────────────────────────────────

  let dispatched = 0;
  let skippedCapacity = 0;
  let skippedLease = 0;
  let leaseFailed = 0;

  for (const run of eligibleRuns) {
    // Skip runs with an active lease (another worker is handling it)
    if (run.lease_expires_at && run.lease_expires_at > now) {
      skippedLease++;
      continue;
    }

    let slotKey = resolveSlotKey(run.objective, run.model_preference || 'auto', run.id);

    // Acquire lease via optimistic update
    const leaseExpiry = now + RUN_LEASE_MS;
    const { data: leased, error: leaseError } = await supabase
      .from('runs')
      .update({
        status: 'processando',
        started_at: now,
        lease_expires_at: leaseExpiry,
        processing_node: nodeId,
        updated_at: now,
      })
      .eq('id', run.id)
      .in('status', ['queued', 'retry_wait']) // Guard: only lease if still in queue
      .select('id')
      .single();

    if (leaseError || !leased) {
      leaseFailed++;
      logger.warn('lease_failed', { runId: run.id, error: leaseError?.message });
      continue;
    }

    // Acquire provider slot
    let slotAcquired = await acquireSlot(slotKey, run.id);
    if (!slotAcquired) {
      const fallbackSlotKey = getFallbackSlotKey(run.objective, run.model_preference, slotKey);
      if (fallbackSlotKey) {
        const fallbackAcquired = await acquireSlot(fallbackSlotKey, run.id);
        if (fallbackAcquired) {
          slotKey = fallbackSlotKey;
          slotAcquired = true;
          logger.warn('provider_slot_failover', {
            runId: run.id,
            from: 'groq:flashcards',
            to: fallbackSlotKey,
            reason: 'primary_capacity_exhausted',
          });
        }
      }
    }

    if (!slotAcquired) {
      // Return run to queue — we got the DB lease but no provider slot
      await supabase
        .from('runs')
        .update({
          status: 'queued',
          started_at: null,
          lease_expires_at: null,
          processing_node: null,
          next_attempt_at: now,
          updated_at: now,
        })
        .eq('id', run.id)
        .eq('status', 'processando');
      skippedCapacity++;
      continue;
    }

    // Fire-and-forget dispatch to processor
    fetch(`${baseUrl}/api/runs/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': internalSecret,
      },
      body: JSON.stringify({ runId: run.id, leaseOwner: nodeId, slotKey }),
    }).catch(async err => {
      logger.error('dispatch_failed', { runId: run.id, error: String(err) });
      await releaseSlot(slotKey, run.id);
      await supabase
        .from('runs')
        .update({
          status: 'queued',
          started_at: null,
          lease_expires_at: null,
          processing_node: null,
          next_attempt_at: Date.now(),
          updated_at: Date.now(),
        })
        .eq('id', run.id)
        .eq('status', 'processando');
    });

    dispatched++;
    logger.info('run_dispatched', {
      runId: run.id,
      objective: run.objective,
      slotKey,
      attempt: run.attempt_count,
    });
  }

  // ── Step 3: Clean up expired leases ───────────────────────────────────────

  const { data: expiredLeases } = await supabase
    .from('runs')
    .select('id, objective, model_preference')
    .eq('status', 'processando')
    .is('deleted_at', null)
    .lt('lease_expires_at', now)
    .limit(50);

  let releasedLeases = 0;
  if (expiredLeases && expiredLeases.length > 0) {
    for (const run of expiredLeases) {
      for (const possibleSlotKey of getPossibleSlotKeys(run.objective, run.model_preference, run.id)) {
        await releaseSlot(possibleSlotKey, run.id);
      }
      await supabase
        .from('runs')
        .update({
          status: 'queued',
          started_at: null,
          lease_expires_at: null,
          processing_node: null,
          next_attempt_at: now,
          updated_at: now,
        })
        .eq('id', run.id)
        .eq('status', 'processando'); // Guard against race
      releasedLeases++;
    }
    logger.info('expired_leases_released', { count: releasedLeases });
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  const capacity = await getCapacitySummary();

  const summary = {
    kind: responseKind,
    eligible: eligibleRuns.length,
    dispatched,
    skippedCapacity,
    skippedLease,
    leaseFailed,
    releasedLeases,
    capacity,
  };

  logger.info('queue_cycle_complete', summary);

  return NextResponse.json({ ok: true, ...summary });
}

export async function GET(request: NextRequest) {
  return handleProcessQueue(request);
}

export async function POST(request: NextRequest) {
  return handleProcessQueue(request);
}

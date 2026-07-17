import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';
import { trackServer } from '@/lib/analytics/server-tracker';
import {
  checkRunEntitlement,
  type RunObjective,
} from '@/lib/billing/run-entitlement';
import {
  checkCircuitBreaker,
  checkWeeklyTokenBudget,
  recordAISuccess,
  logTokenAnomaly,
} from '@/lib/ai/cost-guard';
import { getEffectiveProAccess } from '@/lib/billing/effective-pro-access';
import { rankChunksByRelevance, deduplicateByJaccard } from '@/lib/ai/chunk-ranker';
import { getPromptPolicy, truncateChunk } from '@/lib/ai/prompt-policy';
import {
  classifyAIError,
  extractHttpStatus,
  getMaxAttempts,
  getRetryDecision,
} from '@/lib/ai/retry-policy';
import {
  acquireSlot,
  releaseSlot,
  renewSlot,
  resolveSlotKey,
  type ProviderSlotKey,
} from '@/lib/ai/provider-capacity';
import { getDefaultModelForProvider } from '@/lib/ai/provider-router';
import type { AIProvider } from '@/lib/ai/types';
import { triggerQueueDispatch } from '@/lib/queue/trigger-queue-dispatch';
import {
  formatDigestForFlashcards,
  type SourceDigestRow,
} from '@/lib/source-digest';
import type { ChunkWithContext } from '@/lib/runs/process/contracts';
import { PROMPTS, getBancaPrompt, VALID_BANCAS, VALID_DIFICULDADES } from '@/lib/runs/process/prompts/banca';
import { DEFAULT_DIAGNOSIS, DIAGNOSE_BASE_PROMPT, type BaseDiagnosis, type DificuldadeLevel, type QualidadeBase } from '@/lib/runs/process/prompts/diagnosis';
import { getReviewPrompt } from '@/lib/runs/process/prompts/review';
import { TOPIC_EXTRACTION_PROMPT, type ExtractedTopic } from '@/lib/runs/process/prompts/topic-extraction';
import { checkBaseInsuficiente, normalizeParsedItems, parseAIResponse } from '@/lib/runs/process/validation/response-parser';
import { validateGeneratedItems } from '@/lib/runs/process/validation/citations';
import { fetchSourceChunksByIdsWithRetry, fetchSourceChunksWithRetry } from '@/lib/runs/process/source/chunk-loader';
import { getFallbackSlotKey, shouldFailoverProviderToOpenAI } from '@/lib/runs/process/lifecycle/capacity';
import { RUN_LEASE_HEARTBEAT_MS, RUN_LEASE_MS, STUCK_PROCESSING_THRESHOLD_MS } from '@/lib/runs/process/lifecycle/lease';
import { recordClassifiedProviderFailure } from '@/lib/runs/process/lifecycle/retry';
import { finalizeRunUpdate } from '@/lib/runs/process/lifecycle/completion';
import { getClaimRejection } from '@/lib/runs/process/lifecycle/claim';
import { createProviderCaller, selectModel, type AICallResult } from '@/lib/runs/process/generation/provider-call';
import {
  buildGenerationPayload,
  capGenerationBatchSize,
  createGenerationPayloadFactory,
  type GenerationPayload,
  type GenerationPayloadFactory,
} from '@/lib/runs/process/generation/map-reduce';
import { getAITimeoutForObjective } from '@/lib/ai/timeout';
import { getMaxRefillRounds, shouldAttemptRefill as shouldRunRefill } from '@/lib/runs/process/generation/refill';
import { accumulateRunUsage, buildRunUsageUpdate, createRunUsageAccumulator } from '@/lib/runs/process/persistence/run-repository';
import { saveCards } from '@/lib/runs/process/persistence/save-cards';
import { saveSimulado } from '@/lib/runs/process/persistence/save-simulado';
import { buildGroundedReviewPayload } from '@/lib/runs/process/generation/reviewer';
import { loadSourceDigest } from '@/lib/runs/process/source/digest-loader';

// Legacy shim — callers inside the file still use log(). After each major
// refactor pass this can be replaced with the typed logger directly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _log: (stage: string, message: string, ctx?: Record<string, any>) => void =
  (stage, message) => console.log(`[${new Date().toISOString()}] [Run:${stage}] ${message}`);

function log(stage: string, message: string) {
  _log(stage, message);
}

function getRunProcessInternalSecret(): string | null {
  return process.env.RUNS_PROCESS_INTERNAL_SECRET?.trim() || null;
}

const MAX_ATTEMPTS = getMaxAttempts();
// ============================================================================
// PROMPTS
// ============================================================================

// ============================================================================
// BASE DIAGNOSIS SYSTEM
// ============================================================================

// ============================================================================
// CONTENT PROCESSING
// ============================================================================

/**
 * Clean AI-generated text: remove trailing backslashes, normalize whitespace,
 * strip escape artifacts that corrupt rendering.
 */
// ============================================================================
// MAP-REDUCE PIPELINE
// ============================================================================

/** Prompt for Phase 1 (MAP): extract topics from the full document cheaply */
/**
 * Phase 3 (VALIDATE): verify generated items have valid citations.
 * Items with invalid chunk references are SALVAGED by assigning the best
 * matching valid chunk ID instead of being dropped entirely.
 * Supports multi-source references via the sources[] array.
 */
/** Per-run token budget: max tokens across all AI calls in one run */
const MAX_TOKENS_PER_RUN = 50_000;

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function processRun(request: NextRequest) {
  const overallStart = Date.now();
  let runId = '';
  let slotKey: ProviderSlotKey | null = null;
  let activeProcessingNode: string | null = null;
  let leaseHeartbeat: NodeJS.Timeout | null = null;
  let ownsProviderSlot = false;

  try {
    const requestBody = await request.json();
    runId = requestBody?.runId;
    const requestedLeaseOwner =
      typeof requestBody?.leaseOwner === 'string' ? requestBody.leaseOwner : null;
    const requestedSlotKey =
      typeof requestBody?.slotKey === 'string' ? requestBody.slotKey as ProviderSlotKey : null;

    if (!runId) {
      return NextResponse.json({ error: "runId is required" }, { status: 400 });
    }

    // ========================================================================
    // SECURITY: Internal API secret check
    // ========================================================================
    const internalSecret = request.headers.get('x-internal-secret');
    const expectedSecret = getRunProcessInternalSecret();

    if (!expectedSecret) {
      console.error(JSON.stringify({ level: 'error', event: 'missing_internal_secret' }));
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    if (!internalSecret || internalSecret !== expectedSecret) {
      console.warn(JSON.stringify({ level: 'warn', event: 'auth_failed', runId }));
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Set up structured logger — runId is always included in every log line
    const logger = createLogger({ runId });
    _log = (stage, message, ctx) =>
      logger.info(`run_${stage.toLowerCase()}`, { message, ...ctx });

    logger.info('run_start', { message: `Processing run ${runId}` });
    const providerCaller = createProviderCaller(log);

    // Create Supabase admin client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const directProcessingNode = `processor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const renewLease = async (context: string) => {
      if (!activeProcessingNode || !runId) return;

      const leaseExpiresAt = Date.now() + RUN_LEASE_MS;
      const { data: renewed, error } = await supabase
        .from('runs')
        .update({
          lease_expires_at: leaseExpiresAt,
          updated_at: Date.now(),
        })
        .eq('id', runId)
        .eq('status', 'processando')
        .eq('processing_node', activeProcessingNode)
        .select('id')
        .single();

      if (error || !renewed) {
        log('Lease', `Heartbeat skipped during ${context}: ${error?.message || 'lease not owned'}`);
        return;
      }

      if (slotKey && ownsProviderSlot) {
        const slotRefreshed =
          (await renewSlot(slotKey, runId)) || (await acquireSlot(slotKey, runId));
        if (!slotRefreshed) {
          throw new Error(`Provider slot heartbeat lost capacity during ${context}`);
        }
      }

      log('Lease', `Lease renewed during ${context} until ${leaseExpiresAt}`);
    };

    // ========================================================================
    // 1. GET RUN AND VALIDATE
    // ========================================================================
    
    const { data: run, error: runError } = await supabase
      .from("runs")
      .select("*")
      .eq("id", runId)
      .single();

    if (runError || !run) {
      log('Error', `Run not found: ${runId}`);
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    // ========================================================================
    // IDEMPOTENCY GUARD: Accept pending runs, or stuck processing runs
    // ========================================================================
    const now = Date.now();
    const currentAttempts: number = run.attempt_count ?? 0;
    const currentProviderAttempts: number = run.provider_attempt_count ?? 0;
    slotKey = requestedSlotKey ?? resolveSlotKey(run.objective, run.model_preference || 'auto', run.id);

    const claimRejection = getClaimRejection(run, MAX_ATTEMPTS, now);
    if (claimRejection) {
      log('Skip', claimRejection);
      const status = claimRejection === 'Run not ready yet' ? 409 : 400;
      return NextResponse.json({ error: claimRejection }, { status });
    }

    if (run.status === 'processando') {
      const startedAt = typeof run.started_at === 'number' ? run.started_at : null;
      const hasActiveLease =
        typeof run.lease_expires_at === 'number' && run.lease_expires_at > now;
      let elapsed = 0;
      if (hasActiveLease) {
        if (!requestedLeaseOwner || run.processing_node !== requestedLeaseOwner) {
          log('Skip', 'Run already has an active lease owned by another processor');
          return NextResponse.json({ error: 'Run already has an active lease' }, { status: 409 });
        }

        if (!startedAt) {
          log('Skip', 'Run has an active lease without started_at; refusing duplicate processor entry');
          return NextResponse.json({ error: 'Run lease already active' }, { status: 409 });
        }

        elapsed = now - startedAt;
        if (elapsed < STUCK_PROCESSING_THRESHOLD_MS) {
          const processorNode = `proc:${requestedLeaseOwner}`;
          const { data: claimedLease, error: claimError } = await supabase
            .from('runs')
            .update({
              processing_node: processorNode,
              lease_expires_at: now + RUN_LEASE_MS,
              updated_at: now,
            })
            .eq('id', runId)
            .eq('status', 'processando')
            .eq('processing_node', requestedLeaseOwner)
            .select('id')
            .single();

          if (claimError || !claimedLease) {
            log('Skip', 'Run lease was already claimed by another processor instance');
            return NextResponse.json({ error: 'Run already being processed' }, { status: 409 });
          }

          activeProcessingNode = processorNode;
          log('Lease', 'Processor claimed dispatcher lease via compare-and-set');
        } else {
          log('Recover', `Run stuck in processando for ${Math.round(elapsed / 1000)}s - reprocessing`);
        }
      } else {
        log('Recover', 'Run was processando without a valid lease - reprocessing');
      }
    }

    if (currentAttempts >= MAX_ATTEMPTS) {
      log('MaxAttempts', `Run exhausted ${MAX_ATTEMPTS} attempts — marking as erro`);
      await supabase
        .from('runs')
        .update(
          finalizeRunUpdate({
            status: 'erro',
            error_message: `Excedeu limite de ${MAX_ATTEMPTS} tentativas`,
            next_attempt_at: null,
            completed_at: Date.now(),
          }),
        )
        .eq('id', runId);
      return NextResponse.json({ error: 'Max attempts exceeded' }, { status: 400 });
    }

    log('Validate', `Run validated - Objective: ${run.objective}, Target: ${run.target_count}`);

    // ========================================================================
    // DEFENSE-IN-DEPTH: Verify entitlement before processing
    // ========================================================================
    const ownerIsPro = await getEffectiveProAccess(supabase, run.user_id);
    const entitlementCheck = await checkRunEntitlement(
      supabase,
      run.user_id,
      ownerIsPro,
      run.objective as RunObjective,
      run.target_count,
      { atProcessTime: true },
    );

    if (!entitlementCheck.allowed) {
      log('Entitlement', `Blocked: ${entitlementCheck.reason}`);
      await supabase
        .from('runs')
        .update(
          finalizeRunUpdate({
            status: 'erro',
            error_message: entitlementCheck.reason,
            next_attempt_at: null,
            completed_at: Date.now(),
          }),
        )
        .eq('id', runId);
      return NextResponse.json({ error: entitlementCheck.reason }, { status: 403 });
    }

    // ========================================================================
    // 2. UPDATE STATUS TO PROCESSING
    // ========================================================================

    if (!activeProcessingNode) {
      const claimedAt = Date.now();
      const claimPayload = {
        status: "processando",
        started_at: claimedAt,
        lease_expires_at: claimedAt + RUN_LEASE_MS,
        processing_node: directProcessingNode,
        next_attempt_at: null,
        updated_at: claimedAt,
      };
      const claimBuilder = supabase
        .from("runs")
        .update(claimPayload)
        .eq("id", runId);
      const claimResult = run.status === 'processando'
        ? await claimBuilder.eq("status", "processando").select('id').single()
        : await claimBuilder.in("status", ["queued", "retry_wait"]).select('id').single();
      const { data: claimedRun, error: claimRunError } = claimResult;

      if (claimRunError || !claimedRun) {
        log('Skip', 'Run could not be claimed for processing');
        return NextResponse.json({ error: 'Run could not be claimed' }, { status: 409 });
      }

      activeProcessingNode = directProcessingNode;
      log('Lease', `Processor claimed ${run.status} run directly`);
    }

    if (!slotKey) {
      throw new Error('Provider slot key missing for run');
    }

    let slotAcquired = await acquireSlot(slotKey, runId);
    if (!slotAcquired) {
      const fallbackSlotKey = getFallbackSlotKey(run.objective, run.model_preference, slotKey);
      if (fallbackSlotKey) {
        const fallbackAcquired = await acquireSlot(fallbackSlotKey, runId);
        if (fallbackAcquired) {
          log('Failover', `Provider slot moved from ${slotKey} to ${fallbackSlotKey} before processing`);
          slotKey = fallbackSlotKey;
          slotAcquired = true;
        }
      }
    }

    if (!slotAcquired) {
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
        .eq('id', runId)
        .eq('status', 'processando')
        .eq('processing_node', activeProcessingNode);
      log('Lease', 'Processor could not secure provider slot after claiming the run');
      return NextResponse.json({ error: 'Provider capacity exhausted' }, { status: 409 });
    }

    ownsProviderSlot = true;

    const queueWaitMs =
      typeof run.created_at === 'number'
        ? Math.max(0, Date.now() - run.created_at)
        : null;
    log(
      'Status',
      queueWaitMs == null
        ? 'Updated to "processando"'
        : `Updated to "processando" after ${queueWaitMs}ms in queue`,
    );

    leaseHeartbeat = setInterval(() => {
      void renewLease('interval').catch(error => {
        log(
          'Lease',
          `Lease heartbeat failed during interval: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }, RUN_LEASE_HEARTBEAT_MS);
    leaseHeartbeat.unref?.();

    let currentModel: AIProvider = slotKey.startsWith('gemini')
      ? 'gemini'
      : slotKey.startsWith('openai')
        ? 'openai'
        : 'groq';
    let effectiveModel: AIProvider = currentModel;
    let currentModelId = getDefaultModelForProvider(currentModel, run.objective);
    let effectiveModelId = currentModelId;
    const usageAccumulator = createRunUsageAccumulator();
    let sourceDigestVersionUsed: string | null = null;

    const switchProviderToOpenAI = async (reason: string): Promise<boolean> => {
      if (!slotKey) {
        return false;
      }

      const nextSlotKey = getFallbackSlotKey(run.objective, run.model_preference, slotKey);
      if (!nextSlotKey) {
        return false;
      }

      const nextProvider: AIProvider = 'openai';
      const nextModelId = getDefaultModelForProvider(nextProvider, run.objective);
      const circuitCheck = await checkCircuitBreaker(nextProvider);
      if (!circuitCheck.allowed) {
        log('Failover', `OpenAI failover blocked: ${circuitCheck.reason}`);
        return false;
      }

      const fallbackAcquired = await acquireSlot(nextSlotKey, runId);
      if (!fallbackAcquired) {
        log('Failover', `OpenAI failover slot unavailable for ${reason}`);
        return false;
      }

      const previousModel = currentModel;
      if (ownsProviderSlot && slotKey) {
        await releaseSlot(slotKey, runId);
      }

      slotKey = nextSlotKey;
      currentModel = nextProvider;
      currentModelId = nextModelId;
      effectiveModel = nextProvider;
      effectiveModelId = nextModelId;

      await supabase
        .from('runs')
        .update({
          provider: effectiveModel,
          model_used: effectiveModelId,
          updated_at: Date.now(),
        })
        .eq('id', runId);

      log('Failover', `Switched provider from ${previousModel} to OpenAI (${effectiveModelId}) due to ${reason}`);
      return true;
    };

    const callProviderWithFailover = async (
      provider: AIProvider,
      model: string,
      buildPayload: GenerationPayloadFactory,
      renewLeaseFn?: (context: string) => Promise<void>,
      leaseContext: string = 'provider-call',
    ): Promise<AICallResult> => {
      const invoke = async (activeProvider: AIProvider, activeModel: string, context: string) => {
        const payload = buildPayload(activeProvider);
        return providerCaller.callProvider(
          activeProvider,
          activeModel,
          payload.system,
          payload.user,
          payload.promptCacheKey,
          payload.maxOutputTokens,
          renewLeaseFn,
          context,
          payload.timeoutMs,
        );
      };

      try {
        return await invoke(provider, model, leaseContext);
      } catch (error) {
        const httpStatus = extractHttpStatus(error);
        const errorCode = classifyAIError(error, httpStatus);
        if (shouldFailoverProviderToOpenAI(run.objective, run.model_preference, provider, errorCode)) {
          await recordClassifiedProviderFailure(provider, error);
          const switched = await switchProviderToOpenAI(`${errorCode}:${leaseContext}`);
          if (switched) {
            log('Failover', `Rebuilding generation payload for OpenAI after ${errorCode}`);
            return invoke(effectiveModel, effectiveModelId, `${leaseContext}:openai-failover`);
          }
        }

        throw error;
      }
    };

    try {
      // ======================================================================
      // 3. FETCH AND VALIDATE SOURCE OWNERSHIP
      // ======================================================================
      
      const { data: source } = await supabase
        .from("sources")
        .select("id, filename, user_id")
        .eq("id", run.source_id)
        .single();

      if (!source) {
        throw new Error("Source not found");
      }

      // SECURITY: Verify source belongs to the user who owns the run
      if (source.user_id !== run.user_id) {
        throw new Error("Source ownership mismatch - access denied");
      }

      log('Source', `Found source: ${source.filename}`);
      await renewLease('source-loaded');

      const selectedProvider = slotKey?.startsWith('openai:')
        ? {
            provider: 'openai' as AIProvider,
            model: getDefaultModelForProvider('openai', run.objective),
          }
        : selectModel(runId, run.objective, run.model_preference);
      currentModel = selectedProvider.provider;
      currentModelId = selectedProvider.model;
      effectiveModel = currentModel;
      effectiveModelId = currentModelId;
      log('Model', `Selected provider: ${currentModel} (${currentModelId})`);

      let sourceDigest: SourceDigestRow | null = null;
      let flashcardsDigestContext: string | null = null;
      let chunks: ChunkWithContext[] = [];

      if (run.objective === 'flashcards') {
        const loadedDigest = await loadSourceDigest(supabase, run.source_id, effectiveModel);
        if (loadedDigest) {
          sourceDigest = loadedDigest.digest;
          flashcardsDigestContext = loadedDigest.context;
          sourceDigestVersionUsed = sourceDigest.version;
          const digestChunkIds = sourceDigest.content_json.flashcard_context.map(entry => entry.id);
          chunks = await fetchSourceChunksByIdsWithRetry(
            supabase,
            run.source_id,
            source.filename,
            digestChunkIds,
            renewLease,
          );
          log('Digest', `Using source digest ${sourceDigest.version} for flashcards`);
        } else {
          log('Digest', 'No source digest found, falling back to chunks');
        }
      }

      if (chunks.length === 0) {
        chunks = await fetchSourceChunksWithRetry(
          supabase,
          run.source_id,
          source.filename,
          renewLease,
        );
      }

      log('Chunks', `Found ${chunks.length} chunks for processing`);

      // ======================================================================
      // 4. EXECUTE
      // ======================================================================

      // ── Cost guard: circuit breaker ─────────────────────────────────────
      const circuitCheck = await checkCircuitBreaker(currentModel);
      if (!circuitCheck.allowed) {
        if (slotKey && getFallbackSlotKey(run.objective, run.model_preference, slotKey)) {
          const switched = await switchProviderToOpenAI(`circuit_breaker:${currentModel}`);
          if (switched) {
            log('Failover', `Circuit breaker redirected generation to ${effectiveModel} (${effectiveModelId})`);
          } else {
            log('CostGuard', `Circuit breaker open for ${currentModel}`);
            await supabase
              .from('runs')
              .update(
                finalizeRunUpdate({
                  status: 'retry_wait',
                  started_at: null,
                  error_message: circuitCheck.reason,
                  last_error_code: 'provider_unavailable',
                  last_error_provider: currentModel,
                  last_error_at: Date.now(),
                  next_attempt_at: Date.now() + Math.max(circuitCheck.retryAfterMs ?? 60_000, 15_000),
                }),
              )
              .eq('id', runId);
            return NextResponse.json({ error: circuitCheck.reason, retry: true }, { status: 503 });
          }
        } else {
          log('CostGuard', `Circuit breaker open for ${currentModel}`);
          await supabase
            .from('runs')
          .update(
            finalizeRunUpdate({
              status: 'retry_wait',
              started_at: null,
              error_message: circuitCheck.reason,
              last_error_code: 'provider_unavailable',
              last_error_provider: currentModel,
              last_error_at: Date.now(),
              next_attempt_at: Date.now() + Math.max(circuitCheck.retryAfterMs ?? 60_000, 15_000),
            }),
          )
          .eq('id', runId);
          return NextResponse.json({ error: circuitCheck.reason, retry: true }, { status: 503 });
        }
      }

      // ── Cost guard: weekly token budget ──────────────────────────────────
      const tokenBudget = await checkWeeklyTokenBudget(
        run.user_id,
        ownerIsPro,
      );
      if (!tokenBudget.allowed) {
        log('CostGuard', `Weekly token budget exceeded for user ${run.user_id} (${tokenBudget.tokensUsed}/${tokenBudget.tokenLimit})`);
        await supabase
          .from('runs')
          .update(
            finalizeRunUpdate({
              status: 'erro',
              error_message: tokenBudget.reason,
              next_attempt_at: null,
              completed_at: Date.now(),
            }),
          )
          .eq('id', runId);
        return NextResponse.json({ error: tokenBudget.reason }, { status: 429 });
      }

      // Degrade model if approaching token budget (Pro soft cap)
      effectiveModel = currentModel;
      if (tokenBudget.shouldDegradeModel && currentModel === 'gemini') {
        log('CostGuard', `Token budget at ${Math.round(tokenBudget.tokensUsed / tokenBudget.tokenLimit * 100)}% — downgrading from Gemini to Groq`);
        effectiveModel = 'groq';
        effectiveModelId = getDefaultModelForProvider('groq', run.objective);
      }

      await supabase
        .from("runs")
        .update({
          attempt_count: currentAttempts + 1,
          provider_attempt_count: currentProviderAttempts + 1,
          provider: effectiveModel,
          model_used: effectiveModelId,
          source_digest_version: null,
          updated_at: Date.now(),
        })
        .eq("id", runId);

      // ======================================================================
      // 4b. MAP-REDUCE GENERATION PIPELINE
      // ======================================================================

      let totalTokensUsed = 0;
      let result: unknown[] = [];
      const useReducedPromptBudget = run.last_error_code === 'payload_too_large';

      // For questoes_banca, use dynamic per-banca prompt; others use static PROMPTS
      const isQuestoesBanca = run.objective === 'questoes_banca';
      const isFlashcards = run.objective === 'flashcards';
      const requestedBanca = typeof run.banca === 'string' ? run.banca : null;
      const requestedDificuldade = typeof run.dificuldade === 'string' ? run.dificuldade : null;

      if (isQuestoesBanca) {
        if (!requestedBanca || !VALID_BANCAS.includes(requestedBanca)) {
          throw new Error(`Invalid banca for questoes_banca run ${runId}: ${requestedBanca ?? 'null'}`);
        }

        if (!requestedDificuldade || !VALID_DIFICULDADES.includes(requestedDificuldade)) {
          throw new Error(`Invalid dificuldade for questoes_banca run ${runId}: ${requestedDificuldade ?? 'null'}`);
        }
      }
      const bancaParaQuestoes = isQuestoesBanca ? requestedBanca as string : null;
      const dificuldadePedida = isQuestoesBanca ? requestedDificuldade as string : null;

      // ── PHASE 0: Base Diagnosis (questoes_banca only) ────────────────
      let diagnosis: BaseDiagnosis = DEFAULT_DIAGNOSIS;
      let dificuldadeEfetiva = dificuldadePedida;

      if (isQuestoesBanca) {
        try {
          const diagPreviewMaxChars = 20000; // ~5k tokens — lightweight
          let diagPreview = '';
          for (const chunk of chunks) {
            if (diagPreview.length + chunk.content.length > diagPreviewMaxChars) break;
            diagPreview += chunk.content + '\n\n';
          }

          const diagResult = await providerCaller.callGroq(
            DIAGNOSE_BASE_PROMPT.system,
            DIAGNOSE_BASE_PROMPT.user(diagPreview),
            renewLease,
            'diagnosis',
          );
          totalTokensUsed += diagResult.totalTokens;
          accumulateRunUsage(usageAccumulator, diagResult);
          await recordAISuccess('groq');

          const diagParsed = JSON.parse(
            diagResult.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
          );

          const validQualidades: QualidadeBase[] = ['forte', 'limitada', 'fraca'];
          const validDificuldades: DificuldadeLevel[] = ['facil', 'medio', 'dificil', 'muito_dificil'];

          if (validQualidades.includes(diagParsed.qualidade_base)) {
            diagnosis = {
              qualidade_base: diagParsed.qualidade_base,
              dificuldade_maxima_sustentavel: validDificuldades.includes(diagParsed.dificuldade_maxima_sustentavel)
                ? diagParsed.dificuldade_maxima_sustentavel
                : 'medio',
              fidelidade_banca_possivel: diagParsed.fidelidade_banca_possivel || 'media',
              motivo_limitacao: diagParsed.motivo_limitacao || '',
            };
          }

          log('Diagnosis', JSON.stringify({
            qualidade_base: diagnosis.qualidade_base,
            dificuldade_maxima_sustentavel: diagnosis.dificuldade_maxima_sustentavel,
            fidelidade_banca_possivel: diagnosis.fidelidade_banca_possivel,
            motivo_limitacao: diagnosis.motivo_limitacao,
            dificuldade_pedida: run.dificuldade,
          }));

          // Cap difficulty to what the base can sustain
          const diffRank: Record<string, number> = { facil: 0, medio: 1, dificil: 2, muito_dificil: 3 };
          const pedida = dificuldadePedida as string;
          const maxSustentavel = diagnosis.dificuldade_maxima_sustentavel;
          dificuldadeEfetiva = (diffRank[pedida] ?? 1) <= (diffRank[maxSustentavel] ?? 1)
            ? pedida
            : maxSustentavel;

          if (dificuldadeEfetiva !== pedida) {
            log('Diagnosis', `Dificuldade capped: ${pedida} -> ${dificuldadeEfetiva} (base ${diagnosis.qualidade_base})`);
          }

          // Early exit: weak base + hard difficulty = base_insuficiente
          if (diagnosis.qualidade_base === 'fraca' && (diffRank[pedida] ?? 1) >= 2) {
            const motivo = `Base fraca nao sustenta dificuldade ${pedida}. ${diagnosis.motivo_limitacao}`;
            log('BaseInsuficiente', motivo);
            await supabase
              .from('runs')
              .update(
                finalizeRunUpdate({
                  status: 'base_insuficiente',
                  error_message: motivo,
                  ...buildRunUsageUpdate(usageAccumulator, effectiveModel, effectiveModelId),
                  next_attempt_at: null,
                  completed_at: Date.now(),
                }),
              )
              .eq('id', runId);
            return NextResponse.json({ status: 'base_insuficiente', motivo });
          }
        } catch (diagErr) {
          log('Diagnosis', `Diagnosis failed, using conservative defaults: ${diagErr instanceof Error ? diagErr.message : 'unknown'}`);
          await recordClassifiedProviderFailure('groq', diagErr);
          // Continue with DEFAULT_DIAGNOSIS (limitada)
        }
      }

      const promptConfig = isQuestoesBanca
        ? getBancaPrompt(bancaParaQuestoes, dificuldadeEfetiva, diagnosis)
        : isFlashcards
          ? null
          : PROMPTS[run.objective as keyof typeof PROMPTS];

      // Graduated over-generate based on banca + difficulty + base quality
      // High multipliers needed because Phase B grounded review rejects ~50%
      let overGenerateMultiplier = 1.0; // no over-generate by default
      if (isQuestoesBanca) {
        const isFgvDificil = bancaParaQuestoes === 'FGV' && (dificuldadeEfetiva === 'dificil' || dificuldadeEfetiva === 'muito_dificil');
        if (isFgvDificil && diagnosis.qualidade_base === 'forte') {
          overGenerateMultiplier = 3.0; // 200% — strictest review
        } else if (isFgvDificil) {
          overGenerateMultiplier = 2.5; // 150%
        } else {
          overGenerateMultiplier = 2.5; // 150% — all bancas need buffer for grounded review
        }
      }
      const generationTarget = Math.ceil(run.target_count * overGenerateMultiplier);
      const validChunkIdsForValidation = new Set(chunks.map(c => c.id));
      const chunkContentMap = new Map(chunks.map(c => [c.id, c.content]));

      if (isFlashcards && sourceDigest) {
        const refreshedDigestContext = formatDigestForFlashcards(
          sourceDigest.content_json,
          effectiveModel,
          useReducedPromptBudget,
        );
        if (refreshedDigestContext) {
          flashcardsDigestContext = refreshedDigestContext;
          sourceDigestVersionUsed = sourceDigest.version;
        }
      }

      if (sourceDigestVersionUsed) {
        await supabase
          .from('runs')
          .update({
            source_digest_version: sourceDigestVersionUsed,
            updated_at: Date.now(),
          })
          .eq('id', runId);
      }

      const mapReduceChunkThreshold = isQuestoesBanca ? 5 : 15;
      const useMapReduce = !isFlashcards && chunks.length >= mapReduceChunkThreshold; // Flashcards should stay single-call and cheap

      if (useMapReduce) {
        // ── PHASE 1 (MAP): Extract topics cheaply via Groq ─────────────
        log('MAP', 'Phase 1: Extracting topics from document...');

        const previewMaxChars = 30000; // ~7.5k tokens for topic extraction
        let previewText = '';
        for (const chunk of chunks) {
          if (previewText.length + chunk.content.length > previewMaxChars) break;
          previewText += chunk.content + '\n\n';
        }

        let topics: ExtractedTopic[] = [];
        try {
          const mapResult = await providerCaller.callGroq(
            TOPIC_EXTRACTION_PROMPT.system,
            TOPIC_EXTRACTION_PROMPT.user(previewText),
            renewLease,
            'topic-map',
          );
          totalTokensUsed += mapResult.totalTokens;
          accumulateRunUsage(usageAccumulator, mapResult);
          await recordAISuccess('groq');

          const parsed = JSON.parse(
            mapResult.text
              .replace(/```json\n?/g, '')
              .replace(/```\n?/g, '')
              .trim()
          );
          if (Array.isArray(parsed)) {
            topics = parsed.filter(
              (t: { topic?: string; keywords?: string[] }) =>
                t.topic && Array.isArray(t.keywords) && t.keywords.length > 0,
            );
          }
          log('MAP', `Extracted ${topics.length} topics`);
        } catch (mapErr) {
          log('MAP', `Topic extraction failed, falling back to single-call: ${mapErr instanceof Error ? mapErr.message : 'unknown'}`);
          await recordClassifiedProviderFailure('groq', mapErr);
          // Fall through to single-call fallback below
        }

        // ── PHASE 2 (REDUCE): Generate items per topic ──────────────────
        if (topics.length > 0) {
          const itemsPerTopic = Math.max(2, Math.ceil(generationTarget / topics.length));
          log('REDUCE', `Generating ~${itemsPerTopic} items per topic, ${topics.length} topics`);

          for (const topic of topics) {
            // Check per-run token budget
            if (totalTokensUsed >= MAX_TOKENS_PER_RUN) {
              log('REDUCE', `Per-run token budget reached (${totalTokensUsed}/${MAX_TOKENS_PER_RUN}), stopping early`);
              break;
            }
            // Stop if we already have enough items
            if (result.length >= generationTarget) break;

            // Select relevant chunks for this topic via TF-IDF ranking
            const topicPolicy = getPromptPolicy(
              run.objective,
              effectiveModel,
              useReducedPromptBudget,
            );
            const maxCharsForTopic = topicPolicy.maxCharsTotal;
            const topicChunks = rankChunksByRelevance(
              chunks,
              topic.keywords,
              topicPolicy.maxChunks,
              (c: ChunkWithContext) => c.content,
              maxCharsForTopic,
            );

            if (topicChunks.length === 0) {
              log('REDUCE', `No relevant chunks for topic "${topic.topic}", skipping`);
              continue;
            }

            const preparedTopicChunks = topicChunks.map(chunk => ({
              ...chunk,
              content: truncateChunk(chunk.content, topicPolicy.maxCharsPerChunk),
            }));
            const remaining = Math.min(itemsPerTopic, generationTarget - result.length);
            const generationPayload = buildGenerationPayload({
              objective: run.objective,
              targetCount: remaining,
              chunks: preparedTopicChunks,
              promptConfig,
              digestContext: flashcardsDigestContext,
            });

            try {
              const topicResult = await providerCaller.callProvider(
                effectiveModel,
                effectiveModelId,
                generationPayload.system,
                generationPayload.user,
                generationPayload.promptCacheKey,
                generationPayload.maxOutputTokens,
                renewLease,
                'topic-generation',
                getAITimeoutForObjective(run.objective),
              );
              totalTokensUsed += topicResult.totalTokens;
              accumulateRunUsage(usageAccumulator, topicResult);
              await recordAISuccess(effectiveModel);

              // Check for base_insuficiente BEFORE parsing as array
              if (isQuestoesBanca) {
                const biCheck = checkBaseInsuficiente(topicResult.text);
                if (biCheck.detected) {
                  log('REDUCE', `Topic "${topic.topic}": base_insuficiente — ${biCheck.motivo}`);
                  continue; // Skip this topic, try others
                }
              }

              const topicItems = normalizeParsedItems(run.objective, parseAIResponse(topicResult.text, log));
              if (Array.isArray(topicItems) && topicItems.length > 0) {
                result.push(...topicItems);
                log('REDUCE', `Topic "${topic.topic}": ${topicItems.length} items (total: ${result.length})`);
              }
            } catch (topicErr) {
              log('REDUCE', `Failed to generate for topic "${topic.topic}": ${topicErr instanceof Error ? topicErr.message : 'unknown'}`);
              await recordClassifiedProviderFailure(effectiveModel, topicErr);
              // Continue with other topics
            }
          }
        }
      }

      // ── FALLBACK: Single-call for small docs or if MAP failed ───────
      if (result.length === 0) {
        log('AI', `Single-call generation (${chunks.length} chunks)`);
        const firstBatchCount = capGenerationBatchSize(generationTarget, run.objective);
        const buildSingleCallPayload = createGenerationPayloadFactory({
          chunks,
          objective: run.objective,
          targetCount: firstBatchCount,
          promptConfig,
          digestContext: flashcardsDigestContext,
          useReducedPromptBudget,
          log,
        });

        const aiStart = Date.now();
        let aiResult: AICallResult;
        try {
          aiResult = await callProviderWithFailover(
            effectiveModel,
            effectiveModelId,
            buildSingleCallPayload,
            renewLease,
            'single-generation',
          );
          totalTokensUsed += aiResult.totalTokens;
          accumulateRunUsage(usageAccumulator, aiResult);
          await recordAISuccess(effectiveModel);
        } catch (aiErr) {
          await recordClassifiedProviderFailure(effectiveModel, aiErr);
          throw aiErr;
        }

        const aiDurationMs = Date.now() - aiStart;
        log('AI', `AI responded in ${aiDurationMs}ms, tokens: ${aiResult.totalTokens}`);

        // Check for base_insuficiente BEFORE parsing as array
        if (isQuestoesBanca) {
          const biCheck = checkBaseInsuficiente(aiResult.text);
          if (biCheck.detected) {
            log('BaseInsuficiente', biCheck.motivo);
            await supabase
              .from('runs')
              .update(
                finalizeRunUpdate({
                  status: 'base_insuficiente',
                  error_message: biCheck.motivo,
                  ...buildRunUsageUpdate(usageAccumulator, effectiveModel, effectiveModelId),
                  next_attempt_at: null,
                  completed_at: Date.now(),
                }),
              )
              .eq('id', runId);
            return NextResponse.json({ status: 'base_insuficiente', motivo: biCheck.motivo });
          }
        }

        const parsed = normalizeParsedItems(run.objective, parseAIResponse(aiResult.text, log));
        if (Array.isArray(parsed) && parsed.length > 0) {
          result = parsed;
          log('AI', `First call produced ${result.length}/${generationTarget} items`);
        }

        // ── REFILL LOOP: if AI produced fewer than target, make additional calls ──
        const MAX_REFILL_ROUNDS = getMaxRefillRounds(isFlashcards);
        const shouldAttemptRefill = shouldRunRefill({ isFlashcards, generatedCount: result.length, targetCount: generationTarget });
        let refillRound = 0;
        while (
          shouldAttemptRefill &&
          result.length < generationTarget &&
          refillRound < MAX_REFILL_ROUNDS &&
          totalTokensUsed < MAX_TOKENS_PER_RUN
        ) {
          refillRound++;
          const deficit = generationTarget - result.length;
          log('Refill', `Round ${refillRound}: need ${deficit} more items (have ${result.length}/${generationTarget})`);

          try {
            const refillBatchCount = capGenerationBatchSize(deficit, run.objective);
            const buildRefillPayload = createGenerationPayloadFactory({
              chunks,
              objective: run.objective,
              targetCount: refillBatchCount,
              promptConfig,
              digestContext: flashcardsDigestContext,
              useReducedPromptBudget,
              log,
            });
            const refillResult = await callProviderWithFailover(
              effectiveModel,
              effectiveModelId,
              buildRefillPayload,
              renewLease,
              'refill-generation',
            );
            totalTokensUsed += refillResult.totalTokens;
            accumulateRunUsage(usageAccumulator, refillResult);
            await recordAISuccess(effectiveModel);

            // Check for base_insuficiente
            if (isQuestoesBanca) {
              const biCheck = checkBaseInsuficiente(refillResult.text);
              if (biCheck.detected) {
                log('Refill', `Round ${refillRound}: base_insuficiente — stopping refill`);
                break;
              }
            }

            const refillParsed = normalizeParsedItems(run.objective, parseAIResponse(refillResult.text, log));
            if (Array.isArray(refillParsed) && refillParsed.length > 0) {
              result.push(...refillParsed);
              log('Refill', `Round ${refillRound}: got ${refillParsed.length} more items (total: ${result.length})`);
            } else {
              log('Refill', `Round ${refillRound}: no items returned, stopping refill`);
              break;
            }
          } catch (refillErr) {
            log('Refill', `Round ${refillRound} failed: ${refillErr instanceof Error ? refillErr.message : 'unknown'}`);
            await recordClassifiedProviderFailure(effectiveModel, refillErr);
            break;
          }
        }
      }

      // ── Save total token count ──────────────────────────────────────
      await supabase
        .from('runs')
        .update({
          ...buildRunUsageUpdate(usageAccumulator, effectiveModel, effectiveModelId),
          updated_at: Date.now(),
        })
        .eq('id', runId);

      logTokenAnomaly(runId, run.user_id, effectiveModelId, totalTokensUsed);


      // ── PHASE 3 (VALIDATE): citation check + deduplication ──────────
      result = validateGeneratedItems(result, validChunkIdsForValidation, chunkContentMap, log);

      if (run.objective === 'flashcards') {
        result = deduplicateByJaccard(
          result,
          (item: unknown) => (item as { front?: string }).front || '',
          0.8,
        );
      }

      // ── PHASE B (REVIEW): Grounded contextual AI reviewer for questoes_banca ───
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let qualityMetrics: Record<string, any> | null = null;
      if (isQuestoesBanca && result.length > 0 && totalTokensUsed < MAX_TOKENS_PER_RUN) {
        const reviewBanca = bancaParaQuestoes;
        log('Review', `Phase B: Grounded review of ${result.length} questions (base: ${diagnosis.qualidade_base})...`);
        const totalBeforeReview = result.length;
        const reviewPromptConfig = getReviewPrompt(diagnosis.qualidade_base, reviewBanca, dificuldadeEfetiva);

        try {
          // Build GROUNDED review payload: each question + its source chunks
          const questionsForReview = buildGroundedReviewPayload(result, chunkContentMap);

          const reviewResult = await callProviderWithFailover(
            'gemini',
            getDefaultModelForProvider('gemini', run.objective),
            (): GenerationPayload => ({
              system: reviewPromptConfig.system,
              user: reviewPromptConfig.user(questionsForReview),
              timeoutMs: getAITimeoutForObjective(run.objective),
            }),
            renewLease,
            'grounded-review',
          );
          totalTokensUsed += reviewResult.totalTokens;
          accumulateRunUsage(usageAccumulator, reviewResult);
          await recordAISuccess('gemini');

          const reviewParsed = JSON.parse(
            reviewResult.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
          );
          const approvedIndices = new Set<number>(reviewParsed.aprovadas || []);
          // Support both old format (string[]) and new format ({indice, categoria, motivo}[])
          const motivosReprovacaoRaw = reviewParsed.motivos_reprovacao || [];
          const motivosReprovacao = motivosReprovacaoRaw.map((m: unknown) =>
            typeof m === 'string' ? m : (m as { motivo?: string; categoria?: string }).motivo || JSON.stringify(m)
          );

          // Compute structured quality metrics
          const categoriaCounts: Record<string, number> = {};
          for (const m of motivosReprovacaoRaw) {
            if (typeof m === 'object' && m !== null) {
              const cat = (m as { categoria?: string }).categoria || 'outro';
              categoriaCounts[cat] = (categoriaCounts[cat] || 0) + 1;
            }
          }

          if (approvedIndices.size > 0 && approvedIndices.size < result.length) {
            const rejected = result.length - approvedIndices.size;
            result = result.filter((_, i) => approvedIndices.has(i));

            qualityMetrics = {
              total_geradas: totalBeforeReview,
              total_aprovadas: result.length,
              taxa_reprovacao: Math.round((rejected / totalBeforeReview) * 100) / 100,
              taxa_ancoragem_falha: Math.round(((categoriaCounts['sem_ancoragem'] || 0) + (categoriaCounts['extrapolacao'] || 0)) / totalBeforeReview * 100) / 100,
              taxa_correta_escancarada: Math.round((categoriaCounts['correta_escancarada'] || 0) / totalBeforeReview * 100) / 100,
              taxa_ambiguidade: Math.round((categoriaCounts['ambiguidade'] || 0) / totalBeforeReview * 100) / 100,
              categorias_reprovacao: categoriaCounts,
              motivos_reprovacao: motivosReprovacao,
              review_skipped: false,
              base_qualidade: diagnosis.qualidade_base,
              dificuldade_efetiva: dificuldadeEfetiva,
            };

            log('Review', JSON.stringify(qualityMetrics));
          } else {
            qualityMetrics = {
              total_geradas: totalBeforeReview,
              total_aprovadas: totalBeforeReview,
              taxa_reprovacao: 0,
              taxa_ancoragem_falha: 0,
              taxa_correta_escancarada: 0,
              taxa_ambiguidade: 0,
              categorias_reprovacao: {},
              motivos_reprovacao: [],
              review_skipped: false,
              base_qualidade: diagnosis.qualidade_base,
              dificuldade_efetiva: dificuldadeEfetiva,
            };
            log('Review', `Phase B: All ${result.length} questions approved`);
          }
        } catch (reviewErr) {
          qualityMetrics = {
            total_geradas: totalBeforeReview,
            total_aprovadas: totalBeforeReview,
            taxa_reprovacao: 0,
            review_skipped: true,
            motivo_skip: reviewErr instanceof Error ? reviewErr.message : 'unknown',
            base_qualidade: diagnosis.qualidade_base,
            dificuldade_efetiva: dificuldadeEfetiva,
          };
          log('Review', JSON.stringify({
            review_skipped: true,
            motivo: reviewErr instanceof Error ? reviewErr.message : 'unknown',
          }));
          // Graceful degradation — skip review, keep all
        }

        // ── Save quality metrics to runs table ────────────────────────
        if (qualityMetrics) {
          await supabase
            .from('runs')
            .update({ quality_metrics: qualityMetrics, updated_at: Date.now() })
            .eq('id', runId);
        }

        // ── Retry round if still short of target ──────────────────────
        if (result.length < run.target_count && totalTokensUsed < MAX_TOKENS_PER_RUN) {
          const deficit = run.target_count - result.length;
          log('Retry', `Short by ${deficit} questions, generating extra round...`);
          try {
            const retryBatchCount = capGenerationBatchSize(deficit, run.objective);
            const buildRetryPayload = createGenerationPayloadFactory({
              chunks,
              objective: run.objective,
              targetCount: retryBatchCount,
              promptConfig,
              digestContext: flashcardsDigestContext,
              useReducedPromptBudget,
              log,
            });
            const retryResult = await callProviderWithFailover(
              effectiveModel,
              effectiveModelId,
              buildRetryPayload,
              renewLease,
              'retry-generation',
            );
            totalTokensUsed += retryResult.totalTokens;
            accumulateRunUsage(usageAccumulator, retryResult);
            await recordAISuccess(effectiveModel);
            const retryParsed = normalizeParsedItems(run.objective, parseAIResponse(retryResult.text, log));
            if (Array.isArray(retryParsed) && retryParsed.length > 0) {
              const retryValidated = validateGeneratedItems(retryParsed, validChunkIdsForValidation, chunkContentMap, log);
              result.push(...retryValidated);
              log('Retry', `Extra round produced ${retryValidated.length} questions (total: ${result.length})`);
            }
          } catch (retryErr) {
            log('Retry', `Extra round failed: ${retryErr instanceof Error ? retryErr.message : 'unknown'}`);
          }
        }
      }

      // Trim to target count if over-generation produced excess
      if (result.length > run.target_count) {
        result = result.slice(0, run.target_count);
      }

      if (result.length === 0) {
        throw new Error("Empty or invalid response from AI after validation");
      }

      log('Validate', `After validation: ${result.length} items`);

      // ======================================================================
      // 5. PROCESS RESULTS - Branch by objective type
      // ======================================================================
      
      const savedCount = run.objective === 'questoes_banca'
        ? await saveSimulado({
            supabase,
            runId,
            userId: run.user_id,
            sourceId: run.source_id,
            sourceFilename: source.filename,
            items: result,
            log,
          })
        : await saveCards({
            supabase,
            runId,
            userId: run.user_id,
            sourceId: run.source_id,
            sourceFilename: source.filename,
            objective: run.objective,
            model: effectiveModelId,
            deckId: run.deck_id,
            chunks,
            items: result,
            log,
          });

      log('Total', `Saved ${savedCount} items`);

      // ======================================================================
      // 6. COMPLETE
      // ======================================================================

      // Mark run as completed
      await supabase
        .from("runs")
        .update(
          finalizeRunUpdate({
            ...buildRunUsageUpdate(usageAccumulator, effectiveModel, effectiveModelId),
            status: "concluido",
            items_generated: savedCount,
            completed_at: Date.now(),
            next_attempt_at: null,
            last_error_code: null,
            last_error_provider: null,
            last_error_at: null,
          }),
        )
        .eq("id", runId);

      const totalElapsed = Date.now() - overallStart;
      log('Complete', `Run completed in ${totalElapsed}ms - ${savedCount} items saved`);
      trackServer('run_completed', run.user_id, { runId, itemsGenerated: savedCount, elapsedMs: totalElapsed });

      return NextResponse.json({
        success: true,
        runId,
        itemsGenerated: savedCount,
        // deck_id in runs table contains simuladoId for questoes_banca, deckId for others
        resultId: run.objective === 'questoes_banca' ? undefined : undefined, // Already set in run.deck_id
        provider: effectiveModel,
        modelUsed: effectiveModelId,
        elapsedMs: totalElapsed,
      });

    } catch (processingError) {
      const errorMessage = processingError instanceof Error 
        ? processingError.message 
        : "Erro desconhecido no processamento";
      
      const nextAttempt = currentAttempts + 1;
      const failureModel = effectiveModel;
      const { errorCode, httpStatus } = await recordClassifiedProviderFailure(
        failureModel,
        processingError,
      );
      const retryDecision = getRetryDecision(nextAttempt, errorCode);
      const responseStatus =
        httpStatus ??
        (errorCode === 'fatal_business_rule'
          ? 400
          : errorCode === 'rate_limit'
            ? 429
            : errorCode === 'payload_too_large'
              ? 413
              : errorCode === 'timeout'
                ? 504
                : 500);

      if (retryDecision.shouldRetry && retryDecision.nextAttemptAt) {
        log(
          'Retry',
          `Run failed with ${errorCode} (attempt ${nextAttempt}/${MAX_ATTEMPTS}), retry scheduled`,
        );
        await supabase
          .from('runs')
          .update(
            finalizeRunUpdate({
              ...buildRunUsageUpdate(usageAccumulator, effectiveModel, effectiveModelId),
              status: retryDecision.newStatus,
              started_at: null,
              attempt_count: nextAttempt,
              error_message: `Tentativa ${nextAttempt}: ${errorMessage}`,
              last_error_code: errorCode,
              last_error_provider: failureModel,
              last_error_at: Date.now(),
              next_attempt_at: retryDecision.nextAttemptAt,
            }),
          )
          .eq('id', runId);
      } else {
        log('Error', `Run permanently failed after ${nextAttempt} attempts: ${errorMessage}`);
        await supabase
          .from('runs')
          .update(
            finalizeRunUpdate({
            ...buildRunUsageUpdate(usageAccumulator, effectiveModel, effectiveModelId),
            status: 'erro',
            attempt_count: nextAttempt,
            last_error_code: errorCode,
            last_error_provider: failureModel,
            last_error_at: Date.now(),
            next_attempt_at: null,
            error_message: `Falha definitiva após ${nextAttempt} tentativas: ${errorMessage}`,
            completed_at: Date.now(),
            updated_at: Date.now(),
            }),
          )
          .eq('id', runId);
      }

      return NextResponse.json(
        { error: errorMessage, runId, errorCode, retry: retryDecision.shouldRetry },
        { status: responseStatus }
      );
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    log('Fatal', `Fatal error: ${message}`);
    
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  } finally {
    if (leaseHeartbeat) {
      clearInterval(leaseHeartbeat);
    }
    if (ownsProviderSlot && slotKey && runId) {
      try {
        await releaseSlot(slotKey, runId);
      } catch (releaseError) {
        console.error(
          JSON.stringify({
            level: 'error',
            event: 'provider_slot_release_failed',
            runId,
            slotKey,
            error: releaseError instanceof Error ? releaseError.message : String(releaseError),
          }),
        );
      }
      triggerQueueDispatch(`slot-released:${runId}`);
    }
  }
}

import { createHash, randomUUID } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { afterAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { resolveSlotKey, acquireSlot } from '@/lib/ai/provider-capacity';
import { getRedis } from '@/lib/redis';
import { buildFallbackSourceDigestContent, buildSourceDigestRow } from '@/lib/source-digest';

const envFile = existsSync('.env') ? readFileSync('.env', 'utf8') : '';

function readFromDotEnv(name: string): string | undefined {
  if (!envFile) return undefined;
  const line = envFile.split(/\r?\n/).find(entry => entry.startsWith(`${name}=`));
  if (!line) return undefined;
  const value = line.slice(name.length + 1).trim();
  return value.replace(/^['"]|['"]$/g, '');
}

function requireEnv(name: string): string {
  const value = process.env[name] || readFromDotEnv(name);
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

for (const key of [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GROQ_API_KEY',
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
  'RUNS_PROCESS_INTERNAL_SECRET',
  'CRON_SECRET',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
]) {
  if (!process.env[key]) {
    const value = readFromDotEnv(key);
    if (value) process.env[key] = value;
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function safeJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

const ACTIVE_QUEUE_KEYS = [
  'queue:active:groq:flashcards',
  'queue:active:groq:questoes',
  'queue:active:openai:flashcards',
  'queue:active:openai:questoes',
  'queue:active:gemini:flashcards',
  'queue:active:gemini:questoes',
] as const;

const ACTIVE_RUN_STATUSES = new Set(['queued', 'retry_wait', 'processando', 'pendente']);

function buildChunkContent(index: number, minLength = 1400) {
  const paragraph = [
    `Tema ${index}: princípios constitucionais, competência administrativa, atos vinculados e discricionários.`,
    'O conteúdo destaca requisitos cumulativos, exceções expressas, consequências práticas e distinções conceituais.',
    'Também aborda controle judicial, limites da autotutela, motivação do ato e efeitos sobre direitos do administrado.',
    'Há menção a legalidade, impessoalidade, moralidade, publicidade e eficiência com exemplos aplicados.',
    `O trecho ${index} reforça hipóteses de nulidade, revogação, anulação e convalidação em cenários recorrentes.`,
  ].join(' ');

  let content = `CHUNK ${index}. ${paragraph}`;
  while (content.length < minLength) {
    content += ` ${paragraph}`;
  }
  return content;
}

function countByStatus(rows: Array<{ status?: string | null; objective?: string | null }>) {
  const counts = {
    pending: 0,
    processing: 0,
    concluded: 0,
    failed: 0,
    flashcards: { pending: 0, concluded: 0, failed: 0 },
    simulados: { pending: 0, concluded: 0, failed: 0 },
  };

  for (const row of rows) {
    const status = String(row.status ?? '');
    const objective = String(row.objective ?? '');
    const bucket = objective === 'questoes_banca' ? counts.simulados : counts.flashcards;

    if (ACTIVE_RUN_STATUSES.has(status)) {
      counts.pending += 1;
      bucket.pending += 1;
    } else if (status === 'concluido') {
      counts.concluded += 1;
      bucket.concluded += 1;
    } else if (status === 'erro') {
      counts.failed += 1;
      bucket.failed += 1;
    } else if (status === 'processando') {
      counts.processing += 1;
      bucket.pending += 1;
    }
  }

  return counts;
}

const liveEnabled = process.env.RUN_LIVE_QUEUE_LOAD_TEST === 'true';
const liveDescribe = liveEnabled ? describe : describe.skip;

liveDescribe('live queue load and recovery', () => {
  const created = {
    userId: '' as string,
    sourceId: '' as string,
    runIds: [] as string[],
    deckIds: [] as string[],
    simuladoIds: [] as string[],
    chunkIds: [] as string[],
  };

  let supabase: SupabaseClient;

  function serviceClient() {
    return createClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async function resetQueueState() {
    const redis = getRedis();
    if (!redis) return;

    await redis.del('ai:cb:groq');
    await redis.del('ai:cb:openai');
    await redis.del('ai:cb:gemini');
    for (const key of ACTIVE_QUEUE_KEYS) {
      await redis.del(key);
    }
  }

  async function ensureTestUser() {
    if (created.userId) return;

    supabase = serviceClient();
    const now = Date.now();
    const email = `live-queue-${now}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const password = `T3st-${randomUUID()}`;

    const createdUser = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createdUser.error || !createdUser.data.user) {
      throw new Error(`Failed to create integration user: ${createdUser.error?.message}`);
    }

    created.userId = createdUser.data.user.id;

    const periodEnd = now + 30 * 24 * 60 * 60 * 1000;
    const stripeCustomerId = `cus_live_queue_${randomUUID()}`;
    const stripeSubscriptionId = `sub_live_queue_${randomUUID()}`;
    const priceId = process.env.STRIPE_PRO_PRICE_ID || 'price_live_queue_test';

    await supabase.from('profiles').upsert({
      id: created.userId,
      is_pro: true,
      subscription_status: 'active',
      subscription_tier: 'pro',
      subscription_period_end: periodEnd,
      stripe_customer_id: stripeCustomerId,
      created_at: now,
      updated_at: now,
      admin_override_pro: true,
    });

    const subscriptionInsert = await supabase.from('subscriptions').upsert(
      {
        id: randomUUID(),
        user_id: created.userId,
        stripe_subscription_id: stripeSubscriptionId,
        stripe_customer_id: stripeCustomerId,
        price_id: priceId,
        status: 'active',
        current_period_start: now,
        current_period_end: periodEnd,
        cancel_at_period_end: false,
        created_at: now,
        updated_at: now,
      },
      { onConflict: 'stripe_subscription_id' },
    );

    if (subscriptionInsert.error) {
      throw new Error(`Failed to insert subscription: ${subscriptionInsert.error.message}`);
    }
  }

  async function seedSourceWithChunks(chunkCount = 6) {
    await ensureTestUser();

    created.sourceId = `live-queue-source-${randomUUID()}`;
    const now = Date.now();

    const sourceInsert = await supabase.from('sources').insert({
      id: created.sourceId,
      user_id: created.userId,
      filename: 'live-queue-source.pdf',
      storage_path: `integration/${created.sourceId}.pdf`,
      status: 'concluido',
      progress: 100,
      total_pages: chunkCount,
      created_at: now,
      updated_at: now,
      file_type: 'pdf',
    });

    if (sourceInsert.error) {
      throw new Error(`Failed to insert source: ${sourceInsert.error.message}`);
    }

    const chunks = Array.from({ length: chunkCount }, (_, index) => {
      const id = randomUUID();
      created.chunkIds.push(id);
      const content = buildChunkContent(index + 1, 1400);
      return {
        id,
        content_hash: createHash('sha256').update(content).digest('hex'),
        content,
        page_number: index + 1,
        char_start: index * 1400,
        char_end: (index + 1) * 1400,
        created_at: now,
        position: index,
      };
    });

    const chunksInsert = await supabase.from('chunks').insert(
      chunks.map(chunk => ({
        id: chunk.id,
        content_hash: chunk.content_hash,
        content: chunk.content,
        page_number: chunk.page_number,
        char_start: chunk.char_start,
        char_end: chunk.char_end,
        created_at: chunk.created_at,
      })),
    );

    if (chunksInsert.error) {
      throw new Error(`Failed to insert chunks: ${chunksInsert.error.message}`);
    }

    const sourceChunksInsert = await supabase.from('source_chunks').insert(
      chunks.map(chunk => ({
        source_id: created.sourceId,
        chunk_id: chunk.id,
        position: chunk.position,
        created_at: now,
      })),
    );

    if (sourceChunksInsert.error) {
      throw new Error(`Failed to insert source_chunks: ${sourceChunksInsert.error.message}`);
    }

    const digestInsert = await supabase.from('source_digests').upsert(
      buildSourceDigestRow({
        sourceId: created.sourceId,
        provider: null,
        model: null,
        result: null,
        content: buildFallbackSourceDigestContent(
          chunks.map(chunk => ({
            id: chunk.id,
            content: chunk.content,
            position: chunk.position,
            pageNumber: chunk.page_number,
          })),
        ),
      }),
      { onConflict: 'source_id,version' },
    );

    if (digestInsert.error) {
      throw new Error(`Failed to insert source digest: ${digestInsert.error.message}`);
    }
  }

  async function insertRunsBatch(params: {
    flashcardRuns: number;
    simuladoRuns: number;
    flashcardTarget: number;
    simuladoTarget: number;
    waveLabel: string;
  }) {
    const now = Date.now();
    const rows = [];

    for (let index = 0; index < params.flashcardRuns; index += 1) {
      const id = randomUUID();
      created.runIds.push(id);
      rows.push({
        id,
        user_id: created.userId,
        source_id: created.sourceId,
        objective: 'flashcards',
        model_preference: 'groq',
        target_count: params.flashcardTarget,
        status: 'queued',
        attempt_count: 0,
        provider_attempt_count: 0,
        items_generated: 0,
        next_attempt_at: now,
        lease_expires_at: null,
        processing_node: null,
        created_at: now + index,
        updated_at: now + index,
      });
    }

    for (let index = 0; index < params.simuladoRuns; index += 1) {
      const id = randomUUID();
      created.runIds.push(id);
      rows.push({
        id,
        user_id: created.userId,
        source_id: created.sourceId,
        objective: 'questoes_banca',
        model_preference: 'auto',
        target_count: params.simuladoTarget,
        banca: 'CESPE',
        dificuldade: 'medio',
        status: 'queued',
        attempt_count: 0,
        provider_attempt_count: 0,
        items_generated: 0,
        next_attempt_at: now,
        lease_expires_at: null,
        processing_node: null,
        created_at: now + params.flashcardRuns + index,
        updated_at: now + params.flashcardRuns + index,
      });
    }

    const insert = await supabase.from('runs').insert(rows);
    if (insert.error) {
      throw new Error(`Failed to insert ${params.waveLabel} runs: ${insert.error.message}`);
    }

    return rows.map(row => row.id);
  }

  async function drainQueueUntilTerminal(options: {
    runIds: string[];
    timeoutMs: number;
    queuePollMs: number;
    recoverIntervalMs: number;
  }) {
    const originalFetch = global.fetch.bind(globalThis);
    const { POST: processRun } = await import('@/app/api/runs/process/route');
    const { GET: processQueue, POST: processQueueKick } = await import('@/app/api/cron/process-queue/route');
    const { GET: recoverRuns } = await import('@/app/api/cron/recover-runs/route');
    const processorResponses: Array<Promise<Response>> = [];
    const queueResponses: Array<Record<string, unknown>> = [];
    const recoverResponses: Array<Record<string, unknown>> = [];

    global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith('/api/runs/process')) {
        const req = new NextRequest(url, {
          method: 'POST',
          headers: init?.headers,
          body: typeof init?.body === 'string' ? init.body : JSON.stringify(init?.body ?? {}),
        });
        const responsePromise = processRun(req).then(async response => {
          const body = await response.text();
          return new Response(body, { status: response.status, headers: response.headers });
        });
        processorResponses.push(responsePromise);
        return responsePromise;
      }
      if (url.endsWith('/api/cron/process-queue')) {
        const req = new NextRequest(url, {
          method: 'POST',
          headers: init?.headers,
          body: typeof init?.body === 'string' ? init.body : JSON.stringify(init?.body ?? {}),
        });
        return processQueueKick(req).then(async response => {
          const body = await response.text();
          return new Response(body, { status: response.status, headers: response.headers });
        });
      }
      return originalFetch(input as RequestInfo | URL, init);
    }) as typeof fetch;

    try {
      const startedAt = Date.now();
      const deadline = Date.now() + options.timeoutMs;
      let lastRecoverAt = 0;

      async function readRuns() {
        const result = await supabase
          .from('runs')
          .select('id,status,objective,attempt_count,items_generated,error_message,completed_at,deck_id,simulado_id,last_error_code,last_error_provider')
          .in('id', options.runIds);

        if (result.error) {
          throw new Error(`Failed to refresh runs: ${result.error.message}`);
        }

        return result.data ?? [];
      }

      let rows = await readRuns();
      while (Date.now() < deadline) {
        const pending = rows.filter(row => ACTIVE_RUN_STATUSES.has(String(row.status ?? '')));
        if (pending.length === 0) break;

        const dispatchResponse = await processQueue(
          new NextRequest('http://localhost:3000/api/cron/process-queue', {
            method: 'GET',
            headers: {
              authorization: `Bearer ${requireEnv('CRON_SECRET')}`,
            },
          }),
        );
        queueResponses.push(await safeJson(dispatchResponse));

        if (Date.now() - lastRecoverAt >= options.recoverIntervalMs) {
          const cronResponse = await recoverRuns(
            new NextRequest('http://localhost:3000/api/cron/recover-runs', {
              method: 'GET',
              headers: {
                authorization: `Bearer ${requireEnv('CRON_SECRET')}`,
              },
            }),
          );
          recoverResponses.push(await safeJson(cronResponse));
          lastRecoverAt = Date.now();
        }

        await sleep(options.queuePollMs);
        rows = await readRuns();
      }

      await Promise.allSettled(processorResponses);
      rows = await readRuns();

      if (rows.some(row => ACTIVE_RUN_STATUSES.has(String(row.status ?? '')))) {
        const finalRecover = await recoverRuns(
          new NextRequest('http://localhost:3000/api/cron/recover-runs', {
            method: 'GET',
            headers: {
              authorization: `Bearer ${requireEnv('CRON_SECRET')}`,
            },
          }),
        );
        recoverResponses.push(await safeJson(finalRecover));
        await sleep(options.queuePollMs);
        rows = await readRuns();
      }

      created.deckIds.push(...rows.map(row => String(row.deck_id ?? '')).filter(Boolean));
      created.simuladoIds.push(...rows.map(row => String(row.simulado_id ?? '')).filter(Boolean));

      const totalDispatched = queueResponses.reduce((sum, cycle) => sum + Number(cycle.dispatched ?? 0), 0);
      const totalSkippedCapacity = queueResponses.reduce(
        (sum, cycle) => sum + Number(cycle.skippedCapacity ?? 0),
        0,
      );

      const maxActiveBySlot = queueResponses.reduce<Record<string, number>>((acc, cycle) => {
        const capacity = cycle.capacity as Record<string, { active?: number }> | undefined;
        if (!capacity) return acc;
        for (const [slot, value] of Object.entries(capacity)) {
          acc[slot] = Math.max(acc[slot] ?? 0, Number(value.active ?? 0));
        }
        return acc;
      }, {});

      return {
        startedAt,
        totalElapsedMs: Date.now() - startedAt,
        rows,
        queueResponses,
        recoverResponses,
        totalDispatched,
        totalSkippedCapacity,
        maxActiveBySlot,
        statusCounts: countByStatus(rows),
      };
    } finally {
      global.fetch = originalFetch;
    }
  }

  afterAll(async () => {
    if (!liveEnabled) return;

    supabase = supabase ?? serviceClient();

    const uniqueDeckIds = [...new Set(created.deckIds.filter(Boolean))];
    const uniqueSimuladoIds = [...new Set(created.simuladoIds.filter(Boolean))];

    if (uniqueSimuladoIds.length > 0) {
      await supabase.from('simulado_questions').delete().in('simulado_id', uniqueSimuladoIds);
      await supabase.from('simulados').delete().in('id', uniqueSimuladoIds);
    }

    if (uniqueDeckIds.length > 0) {
      await supabase.from('cards').delete().in('deck_id', uniqueDeckIds);
      await supabase.from('decks').delete().in('id', uniqueDeckIds);
    }

    if (created.runIds.length > 0) {
      await supabase.from('runs').delete().in('id', created.runIds);
    }

    if (created.sourceId) {
      await supabase.from('source_digests').delete().eq('source_id', created.sourceId);
      await supabase.from('source_chunks').delete().eq('source_id', created.sourceId);
      if (created.chunkIds.length > 0) {
        await supabase.from('chunks').delete().in('id', created.chunkIds);
      }
      await supabase.from('sources').delete().eq('id', created.sourceId);
    }

    if (created.userId) {
      await supabase.from('subscriptions').delete().eq('user_id', created.userId);
      await supabase.from('profiles').delete().eq('id', created.userId);
      await supabase.auth.admin.deleteUser(created.userId);
    }
  });

  it('drains mixed flashcard and simulado load with frequent submissions', async () => {
    await resetQueueState();
    supabase = serviceClient();
    await seedSourceWithChunks(Number(process.env.LIVE_QUEUE_SOURCE_CHUNKS || '6'));

    const wave1Flashcards = Number(process.env.LIVE_QUEUE_WAVE1_FLASHCARDS || '6');
    const wave1Simulados = Number(process.env.LIVE_QUEUE_WAVE1_SIMULADOS || '2');
    const wave2Flashcards = Number(process.env.LIVE_QUEUE_WAVE2_FLASHCARDS || '4');
    const wave2Simulados = Number(process.env.LIVE_QUEUE_WAVE2_SIMULADOS || '2');
    const flashcardTarget = Number(process.env.LIVE_QUEUE_FLASHCARD_TARGET || '2');
    const simuladoTarget = Number(process.env.LIVE_QUEUE_SIMULADO_TARGET || '2');
    const timeoutMs = Number(process.env.LIVE_QUEUE_TIMEOUT_MS || '900000');
    const queuePollMs = Number(process.env.LIVE_QUEUE_POLL_MS || '300');
    const recoverIntervalMs = Number(process.env.LIVE_QUEUE_RECOVER_INTERVAL_MS || '15000');

    const wave1Ids = await insertRunsBatch({
      flashcardRuns: wave1Flashcards,
      simuladoRuns: wave1Simulados,
      flashcardTarget,
      simuladoTarget,
      waveLabel: 'wave-1',
    });

    await sleep(Number(process.env.LIVE_QUEUE_BURST_GAP_MS || '400'));

    const wave2Ids = await insertRunsBatch({
      flashcardRuns: wave2Flashcards,
      simuladoRuns: wave2Simulados,
      flashcardTarget,
      simuladoTarget,
      waveLabel: 'wave-2',
    });

    const allRunIds = [...wave1Ids, ...wave2Ids];
    const drain = await drainQueueUntilTerminal({
      runIds: allRunIds,
      timeoutMs,
      queuePollMs,
      recoverIntervalMs,
    });

    const summary = {
      wave1: { flashcards: wave1Flashcards, simulados: wave1Simulados },
      wave2: { flashcards: wave2Flashcards, simulados: wave2Simulados },
      totalRuns: allRunIds.length,
      totalElapsedMs: drain.totalElapsedMs,
      dispatch: {
        cycles: drain.queueResponses.length,
        totalDispatched: drain.totalDispatched,
        totalSkippedCapacity: drain.totalSkippedCapacity,
        maxActiveBySlot: drain.maxActiveBySlot,
        lastCycle: drain.queueResponses.at(-1) ?? null,
      },
      recovery: {
        cycles: drain.recoverResponses.length,
        recoveredFromProcessing: drain.recoverResponses.reduce(
          (sum, row) => sum + Number(row.recoveredFromProcessing ?? 0),
          0,
        ),
        recoveredFromStale: drain.recoverResponses.reduce(
          (sum, row) => sum + Number(row.recoveredFromStale ?? 0),
          0,
        ),
        markedFailed: drain.recoverResponses.reduce((sum, row) => sum + Number(row.markedFailed ?? 0), 0),
      },
      final: drain.statusCounts,
      sampleFailures: drain.rows
        .filter(row => row.status === 'erro')
        .slice(0, 5)
        .map(row => ({
          id: row.id,
          objective: row.objective,
          attempt_count: row.attempt_count,
          last_error_code: row.last_error_code,
          last_error_provider: row.last_error_provider,
          error_message: row.error_message,
        })),
    };

    console.log('LIVE_QUEUE_LOAD_SUMMARY', JSON.stringify(summary, null, 2));
    writeFileSync('live-queue-load-summary.json', JSON.stringify(summary, null, 2));

    expect(summary.final.pending).toBe(0);
    expect(summary.final.concluded).toBeGreaterThan(0);
    expect(summary.final.concluded + summary.final.failed).toBe(summary.totalRuns);
    expect(summary.final.flashcards.concluded).toBeGreaterThan(0);
    expect(summary.final.simulados.concluded + summary.final.simulados.failed).toBe(
      wave1Simulados + wave2Simulados,
    );
    expect(summary.dispatch.totalDispatched).toBeGreaterThan(0);
  }, Number(process.env.LIVE_QUEUE_TIMEOUT_MS || '900000'));

  it('recovers a stuck processing run and completes it', async () => {
    await resetQueueState();
    supabase = serviceClient();
    await seedSourceWithChunks(4);

    const runId = randomUUID();
    created.runIds.push(runId);
    const now = Date.now();
    const stuckNode = `stuck-node-${randomUUID()}`;
    const slotKey = resolveSlotKey('flashcards', 'groq', runId);

    const runInsert = await supabase.from('runs').insert({
      id: runId,
      user_id: created.userId,
      source_id: created.sourceId,
      objective: 'flashcards',
      model_preference: 'groq',
      target_count: 2,
      status: 'processando',
      attempt_count: 1,
      provider_attempt_count: 1,
      items_generated: 0,
      started_at: now - 5 * 60 * 1000,
      next_attempt_at: now - 5 * 60 * 1000,
      lease_expires_at: now - 60_000,
      processing_node: stuckNode,
      created_at: now - 5 * 60 * 1000,
      updated_at: now - 60_000,
    });

    if (runInsert.error) {
      throw new Error(`Failed to insert stuck run: ${runInsert.error.message}`);
    }

    const slotAcquired = await acquireSlot(slotKey, runId);
    expect(slotAcquired).toBe(true);

    const { GET: recoverRuns } = await import('@/app/api/cron/recover-runs/route');
    const recoverResponse = await recoverRuns(
      new NextRequest('http://localhost:3000/api/cron/recover-runs', {
        method: 'GET',
        headers: {
          authorization: `Bearer ${requireEnv('CRON_SECRET')}`,
        },
      }),
    );
    const recoverBody = await safeJson(recoverResponse);
    expect(recoverResponse.status).toBe(200);
    expect(Number(recoverBody.recoveredFromProcessing ?? 0)).toBeGreaterThanOrEqual(1);

    const recovered = await supabase
      .from('runs')
      .select('status,lease_expires_at,processing_node,next_attempt_at')
      .eq('id', runId)
      .single();

    if (recovered.error || !recovered.data) {
      throw new Error(`Failed to read recovered run: ${recovered.error?.message}`);
    }

    expect(recovered.data.status).toBe('queued');
    expect(recovered.data.lease_expires_at).toBeNull();
    expect(recovered.data.processing_node).toBeNull();

    const drain = await drainQueueUntilTerminal({
      runIds: [runId],
      timeoutMs: Number(process.env.LIVE_QUEUE_RECOVERY_TIMEOUT_MS || '180000'),
      queuePollMs: Number(process.env.LIVE_QUEUE_POLL_MS || '300'),
      recoverIntervalMs: Number(process.env.LIVE_QUEUE_RECOVER_INTERVAL_MS || '15000'),
    });

    const terminal = drain.rows[0];
    const evidence = {
      runId,
      recoverBody,
      terminalStatus: terminal?.status,
      itemsGenerated: terminal?.items_generated,
      attemptCount: terminal?.attempt_count,
      elapsedMs: drain.totalElapsedMs,
    };

    console.log('LIVE_QUEUE_RECOVERY_SUMMARY', JSON.stringify(evidence, null, 2));
    writeFileSync('live-queue-recovery-summary.json', JSON.stringify(evidence, null, 2));

    expect(terminal?.status).toBe('concluido');
    expect(Number(terminal?.items_generated ?? 0)).toBeGreaterThan(0);
  }, Number(process.env.LIVE_QUEUE_RECOVERY_TIMEOUT_MS || '180000'));
});

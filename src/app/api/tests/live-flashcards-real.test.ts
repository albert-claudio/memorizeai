import { createHash, randomUUID } from 'crypto';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { NextRequest } from 'next/server';
import { afterAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { selectChunksWithinTokenBudget } from '@/lib/ai/prompt-budget';
import { getPromptPolicy, truncateChunk } from '@/lib/ai/prompt-policy';
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
const REQUIRED_QUEUE_COLUMNS = [
  'next_attempt_at',
  'lease_expires_at',
  'processing_node',
  'last_error_code',
  'last_error_provider',
  'last_error_at',
  'provider_attempt_count',
  'token_count',
] as const;

async function assertQueueSchemaReady(supabase: SupabaseClient) {
  const probe = await supabase
    .from('runs')
    .select(REQUIRED_QUEUE_COLUMNS.join(','))
    .limit(1);

  if (!probe.error) return;

  const message = probe.error.message || 'unknown schema error';
  if (message.includes('column')) {
    throw new Error(
      `Queue schema missing on target Supabase. Apply migration supabase/migrations/20260418_01_queue_columns.sql before running live Phase 1 tests. Underlying error: ${message}`,
    );
  }

  throw new Error(`Failed to verify queue schema readiness: ${message}`);
}

const liveEnabled = process.env.RUN_LIVE_FLASHCARDS_TEST === 'true';
const liveDescribe = liveEnabled ? describe : describe.skip;

type LiveFlashcardProvider = 'groq' | 'openai';

function getLiveFlashcardProvider(): LiveFlashcardProvider {
  const provider = (process.env.LIVE_FLASHCARD_PROVIDER || 'openai').toLowerCase();
  if (provider === 'groq' || provider === 'openai') {
    return provider;
  }

  throw new Error(`Unsupported LIVE_FLASHCARD_PROVIDER: ${provider}`);
}

liveDescribe('live flashcards with real provider API', () => {
  const created = {
    userId: '' as string,
    sourceId: '' as string,
    runIds: [] as string[],
    deckIds: [] as string[],
    chunkIds: [] as string[],
  };

  afterAll(async () => {
    if (!liveEnabled) return;

    const supabase = createClient(
      requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
      requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const uniqueDeckIds = [...new Set(created.deckIds.filter(Boolean))];

    if (uniqueDeckIds.length > 0) {
      await supabase.from('card_references').delete().in('source_id', [created.sourceId]);
      await supabase.from('cards').delete().eq('source_id', created.sourceId);
      await supabase.from('decks').delete().in('id', uniqueDeckIds);
    }

    if (created.runIds.length > 0) {
      await supabase.from('runs').delete().in('id', created.runIds);
    }

    if (created.sourceId) {
      await supabase.from('source_digests').delete().eq('source_id', created.sourceId);
    }

    if (created.sourceId) {
      await supabase.from('source_chunks').delete().eq('source_id', created.sourceId);
      if (created.chunkIds.length > 0) {
        await supabase.from('chunks').delete().in('id', created.chunkIds);
      }
      await supabase.from('sources').delete().eq('id', created.sourceId);
    }

    if (created.userId) {
      await supabase.from('profiles').delete().eq('id', created.userId);
      await supabase.auth.admin.deleteUser(created.userId);
    }
  });

  it('processes concurrent flashcard runs with real API calls and reports chunk-budget metrics', async () => {
    const provider = getLiveFlashcardProvider();
    const runCount = Number(process.env.LIVE_FLASHCARD_RUNS || '100');
    const targetCount = Number(process.env.LIVE_FLASHCARD_TARGET_COUNT || '3');
    const chunkCount = Number(process.env.LIVE_FLASHCARD_SOURCE_CHUNKS || '8');
    const chunkMinLength = Number(process.env.LIVE_FLASHCARD_CHUNK_MIN_LENGTH || '1400');
    const timeoutMs = Number(process.env.LIVE_FLASHCARD_TIMEOUT_MS || '900000');
    const queuePollMs = Number(process.env.LIVE_FLASHCARD_QUEUE_POLL_MS || '250');
    const recoverIntervalMs = Number(process.env.LIVE_FLASHCARD_RECOVER_INTERVAL_MS || '30000');

    const redis = getRedis();
    if (redis) {
      await redis.del('ai:cb:groq');
      await redis.del('ai:cb:openai');
      await redis.del('ai:cb:gemini');
      for (const key of ACTIVE_QUEUE_KEYS) {
        await redis.del(key);
      }
    }

    const supabase = createClient(
      requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
      requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    await assertQueueSchemaReady(supabase);

    const now = Date.now();
    const oldTimestamp = now - 8 * 24 * 60 * 60 * 1000;

    const email = `live-flashcards-${now}-${Math.random().toString(36).slice(2, 8)}@example.com`;
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

    await supabase.from('profiles').upsert({
      id: created.userId,
      is_pro: true,
      subscription_status: 'active',
      subscription_tier: 'pro',
      subscription_period_end: now + 30 * 24 * 60 * 60 * 1000,
      created_at: oldTimestamp,
      updated_at: oldTimestamp,
      admin_override_pro: false,
    });

    created.sourceId = `live-source-${randomUUID()}`;
    const sourceInsert = await supabase.from('sources').insert({
      id: created.sourceId,
      user_id: created.userId,
      filename: 'live-flashcards-source.pdf',
      storage_path: `integration/${created.sourceId}.pdf`,
      status: 'concluido',
      progress: 100,
      total_pages: chunkCount,
      created_at: oldTimestamp,
      updated_at: oldTimestamp,
      file_type: 'pdf',
    });

    if (sourceInsert.error) {
      throw new Error(`Failed to insert source: ${sourceInsert.error.message}`);
    }

    const chunks = Array.from({ length: chunkCount }, (_, index) => {
      const id = `chunk-${randomUUID()}`;
      created.chunkIds.push(id);
      const content = buildChunkContent(index + 1, chunkMinLength);
      return {
        id,
        content_hash: createHash('sha256').update(content).digest('hex'),
        content,
        page_number: index + 1,
        char_start: index * chunkMinLength,
        char_end: (index + 1) * chunkMinLength,
        created_at: oldTimestamp,
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
        created_at: oldTimestamp,
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
      {
        onConflict: 'source_id,version',
      },
    );

    if (digestInsert.error) {
      throw new Error(`Failed to insert source digest: ${digestInsert.error.message}`);
    }

    const selectedChunks = selectChunksWithinTokenBudget(
      chunks.map(chunk => ({ content: chunk.content, position: chunk.position })),
      32000,
      100,
    );
    const phase1PromptPolicy = getPromptPolicy('flashcards', provider);
    const phase1SelectedChunks = selectChunksWithinTokenBudget(
      chunks.map(chunk => ({
        content: truncateChunk(chunk.content, phase1PromptPolicy.maxCharsPerChunk),
        position: chunk.position,
      })),
      phase1PromptPolicy.maxCharsTotal,
      100,
    ).slice(0, phase1PromptPolicy.maxChunks);

    const syntheticBudgetChunks = Array.from({ length: 40 }, (_, index) => ({
      content: buildChunkContent(index + 1, 1800),
      position: index,
    }));
    const syntheticBudgetSelection = selectChunksWithinTokenBudget(syntheticBudgetChunks, 32000, 100);

    const runs = Array.from({ length: runCount }, () => {
      const id = `run-${randomUUID()}`;
      created.runIds.push(id);
      return {
        id,
        user_id: created.userId,
        source_id: created.sourceId,
        objective: 'flashcards',
        model_preference: provider,
        target_count: targetCount,
        status: 'queued',
        attempt_count: 0,
        provider_attempt_count: 0,
        items_generated: 0,
        next_attempt_at: now,
        lease_expires_at: null,
        processing_node: null,
        created_at: oldTimestamp,
        updated_at: oldTimestamp,
      };
    });

    const runsInsert = await supabase.from('runs').insert(runs);
    if (runsInsert.error) {
      throw new Error(`Failed to insert runs: ${runsInsert.error.message}`);
    }

    const originalFetch = global.fetch.bind(globalThis);
    const { POST: processRun } = await import('@/app/api/runs/process/route');
    const { GET: processQueue, POST: processQueueKick } = await import('@/app/api/cron/process-queue/route');
    const { GET: recoverRuns } = await import('@/app/api/cron/recover-runs/route');
    const processorResponses: Array<Promise<Response>> = [];

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
      const queueResponses: Array<Record<string, unknown>> = [];
      const recoverResponses: Array<Record<string, unknown>> = [];
      const deadline = Date.now() + timeoutMs;
      let lastRecoverAt = 0;

      async function readRuns() {
        const result = await supabase
          .from('runs')
          .select('id,status,attempt_count,provider_attempt_count,items_generated,error_message,completed_at,deck_id,last_error_code,last_error_provider,next_attempt_at,lease_expires_at')
          .in('id', created.runIds);

        if (result.error) {
          throw new Error(`Failed to refresh rows: ${result.error.message}`);
        }

        return result.data ?? [];
      }

      let terminalRows = await readRuns();
      while (Date.now() < deadline) {
        const pending = terminalRows.filter(row => ACTIVE_RUN_STATUSES.has(String(row.status ?? '')));
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

        if (Date.now() - lastRecoverAt >= recoverIntervalMs) {
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

        await sleep(queuePollMs);
        terminalRows = await readRuns();
      }

      await Promise.allSettled(processorResponses);
      terminalRows = await readRuns();

      if (terminalRows.some(row => ACTIVE_RUN_STATUSES.has(String(row.status ?? '')))) {
        const finalRecover = await recoverRuns(
          new NextRequest('http://localhost:3000/api/cron/recover-runs', {
            method: 'GET',
            headers: {
              authorization: `Bearer ${requireEnv('CRON_SECRET')}`,
            },
          }),
        );
        recoverResponses.push(await safeJson(finalRecover));
        await sleep(queuePollMs);
        terminalRows = await readRuns();
      }

      if (terminalRows.some(row => ACTIVE_RUN_STATUSES.has(String(row.status ?? '')))) {
        throw new Error('Timed out waiting for all runs to reach terminal state');
      }

      created.deckIds.push(...terminalRows.map(row => String(row.deck_id ?? '')).filter(Boolean));

      const concluded = terminalRows.filter(row => row.status === 'concluido');
      const failed = terminalRows.filter(row => row.status === 'erro');
      const recovered = concluded.filter(row => Number(row.attempt_count ?? 0) > 1);
      const totalDispatched = queueResponses.reduce(
        (sum, cycle) => sum + Number(cycle.dispatched ?? 0),
        0,
      );
      const totalSkippedCapacity = queueResponses.reduce(
        (sum, cycle) => sum + Number(cycle.skippedCapacity ?? 0),
        0,
      );
      const totalLeaseReleases = queueResponses.reduce(
        (sum, cycle) => sum + Number(cycle.releasedLeases ?? 0),
        0,
      );
      const maxProviderFlashcardActive = queueResponses.reduce((max, cycle) => {
        const capacity = cycle.capacity as Record<string, { active?: number }> | undefined;
        const active = Number(capacity?.[`${provider}:flashcards`]?.active ?? 0);
        return Math.max(max, active);
      }, 0);
      const terminalDurationRows = terminalRows
        .map(row => {
          if (typeof row.completed_at !== 'number') return null;
          return row.completed_at - startedAt;
        })
        .filter((value): value is number => value != null && value >= 0);

      const summary = {
        provider,
        runCount,
        targetCount,
        totalElapsedMs: Date.now() - startedAt,
        chunkBudget: {
          totalChunks: chunks.length,
          selectedChunks: selectedChunks.length,
          selectedChars: selectedChunks.reduce((sum, chunk) => sum + chunk.content.length, 0),
          totalChars: chunks.reduce((sum, chunk) => sum + chunk.content.length, 0),
        },
        phase1PromptBudget: {
          policy: phase1PromptPolicy,
          selectedChunks: phase1SelectedChunks.length,
          selectedChars: phase1SelectedChunks.reduce((sum, chunk) => sum + chunk.content.length, 0),
          totalChars: chunks.reduce((sum, chunk) => sum + chunk.content.length, 0),
        },
        syntheticChunkBudget: {
          totalChunks: syntheticBudgetChunks.length,
          selectedChunks: syntheticBudgetSelection.length,
          selectedChars: syntheticBudgetSelection.reduce((sum, chunk) => sum + chunk.content.length, 0),
          totalChars: syntheticBudgetChunks.reduce((sum, chunk) => sum + chunk.content.length, 0),
        },
        dispatch: {
          cycles: queueResponses.length,
          totalDispatched,
          totalSkippedCapacity,
          totalLeaseReleases,
          maxProviderFlashcardActive,
          lastCycle: queueResponses.at(-1) ?? null,
        },
        finalRuns: {
          concluded: concluded.length,
          failed: failed.length,
          recovered: recovered.length,
          queued: terminalRows.filter(row => row.status === 'queued').length,
          retryWait: terminalRows.filter(row => row.status === 'retry_wait').length,
          processing: terminalRows.filter(row => row.status === 'processando').length,
          legacyPending: terminalRows.filter(row => row.status === 'pendente').length,
          pending: terminalRows.filter(row => ACTIVE_RUN_STATUSES.has(String(row.status ?? ''))).length,
        },
        timings: {
          avgCompletionMs: terminalDurationRows.length > 0
            ? Math.round(terminalDurationRows.reduce((sum, value) => sum + value, 0) / terminalDurationRows.length)
            : 0,
          maxCompletionMs: terminalDurationRows.length > 0 ? Math.max(...terminalDurationRows) : 0,
        },
        recoverResponses,
        sampleFailures: failed.slice(0, 5).map(row => ({
          id: row.id,
          attempt_count: row.attempt_count,
          last_error_code: row.last_error_code,
          last_error_provider: row.last_error_provider,
          error_message: row.error_message,
        })),
      };

      console.log('LIVE_FLASHCARDS_SUMMARY', JSON.stringify(summary, null, 2));
      writeFileSync('live-flashcards-summary.json', JSON.stringify(summary, null, 2));

      expect(summary.syntheticChunkBudget.selectedChunks).toBeLessThan(summary.syntheticChunkBudget.totalChunks);
      expect(summary.finalRuns.concluded + summary.finalRuns.failed).toBe(runCount);
      expect(summary.finalRuns.pending).toBe(0);
      expect(summary.finalRuns.concluded).toBeGreaterThan(0);
    } finally {
      global.fetch = originalFetch;
    }
  }, Number(process.env.LIVE_FLASHCARD_TIMEOUT_MS || '900000'));
});

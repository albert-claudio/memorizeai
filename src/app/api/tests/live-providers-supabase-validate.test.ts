import { createHash, randomUUID } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  estimateFlashcardsMaxOutputTokens,
  formatFlashcardContext,
  getFlashcardsPrompt,
  normalizeCompactFlashcards,
} from '@/lib/ai/flashcards';
import type { AIProvider } from '@/lib/ai/types';
import { DOCUMENT_UPLOAD_ACKNOWLEDGEMENT_VERSION } from '@/lib/document-upload-acknowledgement';

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

function parseFlashcardJson(text: string): unknown[] {
  const cleaned = text
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
  const match = cleaned.match(/\[[\s\S]*\]/);
  const payload = match ? match[0] : cleaned;
  const parsed = JSON.parse(payload);
  if (!Array.isArray(parsed)) {
    throw new Error('Flashcard response is not a JSON array');
  }
  return parsed;
}

function validateFlashcards(items: unknown[]): void {
  const normalized = normalizeCompactFlashcards(items);
  expect(normalized.length).toBeGreaterThan(0);
  for (const item of normalized) {
    const card = item as { front?: string; back?: string; chunkId?: string };
    expect(card.front?.trim().length).toBeGreaterThan(0);
    expect(card.back?.trim().length).toBeGreaterThan(0);
    expect(card.chunkId?.trim().length).toBeGreaterThan(0);
  }
}

const SAMPLE_CHUNKS = [
  {
    id: 'validate-chunk-1',
    content:
      'O habeas corpus e remedio constitucional destinado a proteger a liberdade de locomocao quando houver ou se afigurar ameacado de violencia ou coacao ilegal.',
    pageNumber: 1,
  },
  {
    id: 'validate-chunk-2',
    content:
      'A impetracao de habeas corpus pode ser promovida por qualquer pessoa, em favor de si ou de outrem, independentemente de procuracao.',
    pageNumber: 2,
  },
];

const liveEnabled = process.env.RUN_LIVE_PROVIDERS_VALIDATE === 'true';
const liveDescribe = liveEnabled ? describe : describe.skip;

liveDescribe('live providers + supabase validation', () => {
  const created = {
    userId: '' as string,
    sourceIds: [] as string[],
    chunkIds: [] as string[],
    runIds: [] as string[],
    deckIds: [] as string[],
    simuladoIds: [] as string[],
    storagePaths: [] as string[],
  };

  let supabase: SupabaseClient;
  let testUserEmail = '';
  let testUserPassword = '';

  function serviceClient() {
    return createClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  afterAll(async () => {
    if (!liveEnabled) return;

    supabase = supabase ?? serviceClient();

    for (const deckId of [...new Set(created.deckIds.filter(Boolean))]) {
      await supabase.from('cards').delete().eq('deck_id', deckId);
      await supabase.from('decks').delete().eq('id', deckId);
    }

    for (const simuladoId of [...new Set(created.simuladoIds.filter(Boolean))]) {
      await supabase.from('simulado_respostas').delete().eq('simulado_id', simuladoId);
      await supabase.from('simulado_questoes').delete().eq('simulado_id', simuladoId);
      await supabase.from('simulados').delete().eq('id', simuladoId);
    }

    if (created.runIds.length > 0) {
      await supabase.from('runs').delete().in('id', created.runIds);
    }

    for (const sourceId of created.sourceIds) {
      await supabase.from('card_references').delete().eq('source_id', sourceId);
      await supabase.from('cards').delete().eq('source_id', sourceId);
      await supabase.from('source_digests').delete().eq('source_id', sourceId);
      await supabase.from('source_chunks').delete().eq('source_id', sourceId);
      await supabase.from('sources').delete().eq('id', sourceId);
    }

    if (created.chunkIds.length > 0) {
      await supabase.from('chunks').delete().in('id', created.chunkIds);
    }

    for (const storagePath of created.storagePaths) {
      await supabase.storage.from('pdfs').remove([storagePath]);
    }

    if (created.userId) {
      await supabase.from('subscriptions').delete().eq('user_id', created.userId);
      await supabase.from('profiles').delete().eq('id', created.userId);
      await supabase.auth.admin.deleteUser(created.userId);
    }
  });

  async function ensureTestUser() {
    if (created.userId) return;

    supabase = serviceClient();
    const now = Date.now();
    testUserEmail = `validate-providers-${now}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    testUserPassword = `T3st-${randomUUID()}`;

    const createdUser = await supabase.auth.admin.createUser({
      email: testUserEmail,
      password: testUserPassword,
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
      created_at: now,
      updated_at: now,
      admin_override_pro: true,
    });

    const subscriptionInsert = await supabase.from('subscriptions').insert({
      user_id: created.userId,
      stripe_customer_id: `cus_validate_${created.userId.slice(0, 8)}`,
      price_id: process.env.STRIPE_PRO_PRICE_ID || 'price_validate_pro',
      status: 'active',
      current_period_start: now,
      current_period_end: now + 30 * 24 * 60 * 60 * 1000,
      cancel_at_period_end: false,
      created_at: now,
      updated_at: now,
    });

    if (subscriptionInsert.error) {
      throw new Error(`Failed to insert subscription: ${subscriptionInsert.error.message}`);
    }
  }

  async function testProviderFlashcards(provider: AIProvider) {
    const { generateAIText, getDefaultModelForProvider } = await import('@/lib/ai/provider-router');
    const model = getDefaultModelForProvider(provider, 'flashcards');
    const context = formatFlashcardContext(SAMPLE_CHUNKS);
    const prompt = getFlashcardsPrompt(2, context);

    const result = await generateAIText({
      provider,
      model,
      system: prompt.system,
      user: prompt.user,
      promptCacheKey: prompt.promptCacheKey,
      maxOutputTokens: estimateFlashcardsMaxOutputTokens(2),
    });

    expect(result.text.trim().length).toBeGreaterThan(0);
    validateFlashcards(parseFlashcardJson(result.text));

    return {
      provider,
      model,
      durationMs: result.durationMs,
      totalTokens: result.totalTokens,
      cards: normalizeCompactFlashcards(parseFlashcardJson(result.text)).length,
    };
  }

  async function seedSourceWithChunks(uniqueSuffix = randomUUID()) {
    await ensureTestUser();

    const sourceId = randomUUID();
    created.sourceIds.push(sourceId);

    const chunks = SAMPLE_CHUNKS.map((chunk, index) => {
      const id = randomUUID();
      created.chunkIds.push(id);
      const content = `${chunk.content} Ref:${uniqueSuffix}`;
      return {
        id,
        content_hash: createHash('sha256').update(content).digest('hex'),
        content,
        page_number: chunk.pageNumber,
        char_start: index * 500,
        char_end: (index + 1) * 500,
        created_at: Date.now(),
        position: index,
      };
    });

    const sourceInsert = await supabase.from('sources').insert({
      id: sourceId,
      user_id: created.userId,
      filename: 'validate-source.txt',
      storage_path: `integration/${sourceId}.txt`,
      status: 'concluido',
      progress: 100,
      total_pages: chunks.length,
      created_at: Date.now(),
      updated_at: Date.now(),
      file_type: 'txt',
    });

    if (sourceInsert.error) {
      throw new Error(`Failed to insert source: ${sourceInsert.error.message}`);
    }

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
        source_id: sourceId,
        chunk_id: chunk.id,
        position: chunk.position,
        created_at: Date.now(),
      })),
    );

    if (sourceChunksInsert.error) {
      throw new Error(`Failed to insert source_chunks: ${sourceChunksInsert.error.message}`);
    }

    return { sourceId, chunkIds: chunks.map(chunk => chunk.id) };
  }

  async function processFlashcardRun(provider: AIProvider, sourceId: string) {
    const runId = randomUUID();
    created.runIds.push(runId);
    const now = Date.now();

    const runInsert = await supabase.from('runs').insert({
      id: runId,
      user_id: created.userId,
      source_id: sourceId,
      objective: 'flashcards',
      model_preference: provider,
      target_count: 2,
      status: 'queued',
      attempt_count: 0,
      provider_attempt_count: 0,
      items_generated: 0,
      next_attempt_at: now,
      lease_expires_at: null,
      processing_node: null,
      created_at: now,
      updated_at: now,
    });

    if (runInsert.error) {
      throw new Error(`Failed to insert run: ${runInsert.error.message}`);
    }

    const { POST: processRun } = await import('@/app/api/runs/process/route');
    const response = await processRun(
      new NextRequest('http://localhost:3000/api/runs/process', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-secret': requireEnv('RUNS_PROCESS_INTERNAL_SECRET'),
        },
        body: JSON.stringify({ runId }),
      }),
    );

    const body = await response.json();
    if (!response.ok) {
      throw new Error(`Run processing failed for ${provider}: ${response.status} ${JSON.stringify(body)}`);
    }

    const deadline = Date.now() + 120_000;
    let terminalRow: Record<string, unknown> | null = null;

    while (Date.now() < deadline) {
      const result = await supabase
        .from('runs')
        .select('id,status,items_generated,deck_id,error_message,last_error_provider')
        .eq('id', runId)
        .single();

      if (result.error) {
        throw new Error(`Failed to read run: ${result.error.message}`);
      }

      const status = String(result.data?.status ?? '');
      if (status === 'concluido' || status === 'erro') {
        terminalRow = result.data as Record<string, unknown>;
        break;
      }

      await sleep(1500);
    }

    if (!terminalRow) {
      throw new Error(`Timed out waiting for run ${runId} (${provider})`);
    }

    expect(terminalRow.status).toBe('concluido');
    expect(Number(terminalRow.items_generated ?? 0)).toBeGreaterThan(0);

    const deckId = String(terminalRow.deck_id ?? '');
    if (deckId) {
      created.deckIds.push(deckId);
      const cards = await supabase.from('cards').select('id,front,back').eq('deck_id', deckId);
      if (cards.error) {
        throw new Error(`Failed to read cards: ${cards.error.message}`);
      }
      expect((cards.data ?? []).length).toBeGreaterThan(0);
    }

    return {
      provider,
      runId,
      status: terminalRow.status,
      itemsGenerated: terminalRow.items_generated,
      deckId: terminalRow.deck_id,
    };
  }

  async function processSimuladoRun(sourceId: string) {
    const runId = randomUUID();
    created.runIds.push(runId);
    const now = Date.now();

    const runInsert = await supabase.from('runs').insert({
      id: runId,
      user_id: created.userId,
      source_id: sourceId,
      objective: 'questoes_banca',
      model_preference: 'auto',
      target_count: 4,
      banca: 'FCC',
      dificuldade: 'medio',
      status: 'queued',
      attempt_count: 0,
      provider_attempt_count: 0,
      items_generated: 0,
      next_attempt_at: now,
      lease_expires_at: null,
      processing_node: null,
      created_at: now,
      updated_at: now,
    });

    if (runInsert.error) {
      throw new Error(`Failed to insert simulado run: ${runInsert.error.message}`);
    }

    const { POST: processRun } = await import('@/app/api/runs/process/route');
    const response = await processRun(
      new NextRequest('http://localhost:3000/api/runs/process', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-secret': requireEnv('RUNS_PROCESS_INTERNAL_SECRET'),
        },
        body: JSON.stringify({ runId }),
      }),
    );

    const body = await response.json();
    if (!response.ok && body?.status !== 'base_insuficiente') {
      throw new Error(`Simulado run processing failed: ${response.status} ${JSON.stringify(body)}`);
    }

    const deadline = Date.now() + 300_000;
    let terminalRow: Record<string, unknown> | null = null;

    while (Date.now() < deadline) {
      const result = await supabase
        .from('runs')
        .select('id,status,items_generated,simulado_id,error_message,last_error_provider,last_error_code')
        .eq('id', runId)
        .single();

      if (result.error) {
        throw new Error(`Failed to read simulado run: ${result.error.message}`);
      }

      const status = String(result.data?.status ?? '');
      if (status === 'concluido' || status === 'erro' || status === 'base_insuficiente') {
        terminalRow = result.data as Record<string, unknown>;
        break;
      }

      await sleep(2000);
    }

    if (!terminalRow) {
      throw new Error(`Timed out waiting for simulado run ${runId}`);
    }

    expect(terminalRow.status).toBe('concluido');
    expect(Number(terminalRow.items_generated ?? 0)).toBeGreaterThan(0);

    const simuladoId = String(terminalRow.simulado_id ?? '');
    if (simuladoId) {
      created.simuladoIds.push(simuladoId);
      const questions = await supabase
        .from('simulado_questoes')
        .select('id,enunciado')
        .eq('simulado_id', simuladoId);
      if (questions.error) {
        throw new Error(`Failed to read simulado questions: ${questions.error.message}`);
      }
      expect((questions.data ?? []).length).toBeGreaterThan(0);
    }

    return {
      runId,
      status: terminalRow.status,
      itemsGenerated: terminalRow.items_generated,
      simuladoId: terminalRow.simulado_id,
      lastErrorCode: terminalRow.last_error_code,
    };
  }

  it('generates flashcards with Groq', async () => {
    const evidence = await testProviderFlashcards('groq');
    console.log('VALIDATE_GROQ', JSON.stringify(evidence));
    expect(evidence.cards).toBeGreaterThan(0);
  }, 120_000);

  it('generates flashcards with Gemini', async () => {
    const evidence = await testProviderFlashcards('gemini');
    console.log('VALIDATE_GEMINI', JSON.stringify(evidence));
    expect(evidence.cards).toBeGreaterThan(0);
  }, 120_000);

  it('generates flashcards with OpenAI', async () => {
    const evidence = await testProviderFlashcards('openai');
    console.log('VALIDATE_OPENAI', JSON.stringify(evidence));
    expect(evidence.cards).toBeGreaterThan(0);
  }, 120_000);

  it('uploads to Supabase Storage and persists chunks via process-source', async () => {
    await ensureTestUser();

    const sourceId = randomUUID();
    created.sourceIds.push(sourceId);
    const storagePath = `${created.userId}/${sourceId}.txt`;
    created.storagePaths.push(storagePath);

    const extractedText = [
      'Artigo 1. O habeas corpus e acao constitucional que protege a liberdade de locomocao.',
      'Artigo 2. Pode ser impetrado por qualquer pessoa, em favor de si ou de outrem.',
      'Artigo 3. O juiz competente deve decidir em ate 24 horas em regra geral.',
    ].join('\n\n');

    const upload = await supabase.storage.from('pdfs').upload(storagePath, Buffer.from(extractedText, 'utf8'), {
      contentType: 'text/plain',
      upsert: false,
    });

    if (upload.error) {
      throw new Error(`Storage upload failed: ${upload.error.message}`);
    }

    const now = Date.now();
    const sourceInsert = await supabase.from('sources').insert({
      id: sourceId,
      user_id: created.userId,
      filename: 'validate-upload.txt',
      storage_path: storagePath,
      file_type: 'txt',
      status: 'na_fila',
      progress: 0,
      created_at: now,
      updated_at: now,
    });

    if (sourceInsert.error) {
      throw new Error(`Failed to insert source: ${sourceInsert.error.message}`);
    }

    const authModule = await import('@/lib/auth/auth-guard');

    vi.spyOn(authModule, 'requireAuth').mockResolvedValue({
      user: { id: created.userId, email: testUserEmail } as never,
      isPro: true,
    });
    vi.spyOn(authModule, 'requireAuthAndOwnership').mockResolvedValue({
      user: { id: created.userId, email: testUserEmail } as never,
      isPro: true,
    });

    try {
      const { POST: processSource } = await import('@/app/api/process-source/route');
      const response = await processSource(
        new NextRequest('http://localhost:3000/api/process-source', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sourceId,
            extractedText,
            uploadAcknowledged: true,
            uploadAcknowledgementVersion: DOCUMENT_UPLOAD_ACKNOWLEDGEMENT_VERSION,
          }),
        }),
      );

      const body = await response.json();
      if (!response.ok) {
        throw new Error(`process-source failed: ${response.status} ${JSON.stringify(body)}`);
      }

      const sourceRow = await supabase.from('sources').select('status,progress').eq('id', sourceId).single();
      if (sourceRow.error) {
        throw new Error(`Failed to read source: ${sourceRow.error.message}`);
      }

      expect(sourceRow.data?.status).toBe('concluido');
      expect(Number(sourceRow.data?.progress ?? 0)).toBe(100);

      const sourceChunks = await supabase
        .from('source_chunks')
        .select('chunk_id,position')
        .eq('source_id', sourceId)
        .order('position', { ascending: true });

      if (sourceChunks.error) {
        throw new Error(`Failed to read source_chunks: ${sourceChunks.error.message}`);
      }

      expect((sourceChunks.data ?? []).length).toBeGreaterThan(0);
      created.chunkIds.push(...(sourceChunks.data ?? []).map(row => String(row.chunk_id)));

      const listed = await supabase.storage.from('pdfs').list(created.userId, { search: `${sourceId}.txt` });
      if (listed.error) {
        throw new Error(`Failed to list storage object: ${listed.error.message}`);
      }
      expect((listed.data ?? []).some(item => item.name === `${sourceId}.txt`)).toBe(true);

      const evidence = {
        sourceId,
        storagePath,
        chunksPersisted: sourceChunks.data?.length ?? 0,
        sourceStatus: sourceRow.data?.status,
      };
      console.log('VALIDATE_UPLOAD_PERSISTENCE', JSON.stringify(evidence));
      writeFileSync('live-providers-validate-upload.json', JSON.stringify(evidence, null, 2));
    } finally {
      vi.restoreAllMocks();
    }
  }, 180_000);

  it('processes end-to-end flashcard runs for Groq, Gemini and OpenAI', async () => {
    const runIdSeed = randomUUID();
    const { sourceId } = await seedSourceWithChunks(`e2e-${runIdSeed}`);
    const results = [];

    for (const provider of ['groq', 'gemini', 'openai'] as const) {
      const evidence = await processFlashcardRun(provider, sourceId);
      results.push(evidence);
      console.log(`VALIDATE_RUN_${provider.toUpperCase()}`, JSON.stringify(evidence));
    }

    writeFileSync('live-providers-validate-runs.json', JSON.stringify(results, null, 2));
    expect(results).toHaveLength(3);
    expect(results.every(row => row.status === 'concluido')).toBe(true);
  }, 420_000);

  it('processes end-to-end simulado run with auto provider routing', async () => {
    const { sourceId } = await seedSourceWithChunks(`simulado-${randomUUID()}`);
    const evidence = await processSimuladoRun(sourceId);
    console.log('VALIDATE_SIMULADO_AUTO', JSON.stringify(evidence));
    writeFileSync('live-providers-validate-simulado.json', JSON.stringify(evidence, null, 2));
    expect(evidence.status).toBe('concluido');
    expect(Number(evidence.itemsGenerated ?? 0)).toBeGreaterThan(0);
  }, 360_000);
});

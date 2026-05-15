import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type RunStatus =
  | 'pendente'
  | 'queued'
  | 'retry_wait'
  | 'processando'
  | 'concluido'
  | 'erro'
  | 'base_insuficiente';
type RunObjective = 'flashcards' | 'questoes_banca';
type Provider = 'groq' | 'gemini';
type AiPhase = 'diagnosis' | 'generation' | 'review';

interface RunRow {
  id: string;
  user_id: string;
  source_id: string;
  objective: RunObjective;
  model_preference: 'auto' | 'groq' | 'gemini';
  target_count: number;
  status: RunStatus;
  attempt_count: number;
  items_generated: number;
  created_at: number;
  updated_at: number;
  started_at?: number;
  completed_at?: number;
  next_attempt_at?: number | null;
  lease_expires_at?: number | null;
  processing_node?: string | null;
  error_message?: string | null;
  deck_id?: string | null;
  simulado_id?: string | null;
  model_used?: Provider;
  token_count?: number;
  provider_attempt_count?: number;
  last_error_code?: string | null;
  last_error_provider?: string | null;
  last_error_at?: number | null;
  banca?: string | null;
  dificuldade?: string | null;
  deleted_at?: number | null;
}

interface SourceRow {
  id: string;
  filename: string;
  user_id: string;
}

interface SourceChunkRow {
  source_id: string;
  position: number;
  chunks: {
    id: string;
    content: string;
    page_number: number | null;
  };
}

interface SubscriptionRow {
  id: string;
  user_id: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: number;
  updated_at: number;
}

interface ScenarioConfig {
  name: string;
  flashcardRuns?: number;
  simuladoRuns?: number;
  groqDelayMs: number;
  geminiDelayMs: number;
  transientGenerationFailures: Record<string, number>;
  permanentGenerationFailures: string[];
}

interface AiCallMetric {
  provider: Provider;
  phase: AiPhase;
  runId: string | null;
  durationMs: number;
  failed: boolean;
}

interface ScenarioSummary {
  scenario: string;
  totalRuns: number;
  totalElapsedMs: number;
  queueCycles: number;
  initial: {
    pending: number;
    processing: number;
    concluded: number;
    failed: number;
    recovered: number;
  };
  final: {
    pending: number;
    processing: number;
    concluded: number;
    failed: number;
    recovered: number;
  };
  recoveryWaves: number;
  recoverResponses: Array<{
    recoveredFromProcessing: number;
    recoveredFromStale: number;
    markedFailed: number;
  }>;
  maxActiveSlots: Record<string, number>;
  ai: {
    groq: { calls: number; failures: number; avgDurationMs: number; maxDurationMs: number };
    gemini: { calls: number; failures: number; avgDurationMs: number; maxDurationMs: number };
  };
  objectiveStats: {
    flashcards: { count: number; avgCompletionMs: number; maxCompletionMs: number };
    questoes_banca: { count: number; avgCompletionMs: number; maxCompletionMs: number };
  };
}

type TableName =
  | 'runs'
  | 'profiles'
  | 'subscriptions'
  | 'beta_invites'
  | 'sources'
  | 'source_chunks'
  | 'source_digests'
  | 'decks'
  | 'cards'
  | 'card_references'
  | 'simulados'
  | 'simulado_questoes'
  | 'simulado_respostas';

interface DbState {
  runs: Map<string, RunRow>;
  profiles: Map<string, Record<string, unknown>>;
  subscriptions: Map<string, SubscriptionRow>;
  beta_invites: Record<string, unknown>[];
  sources: Map<string, SourceRow>;
  source_chunks: SourceChunkRow[];
  source_digests: Record<string, unknown>[];
  decks: Map<string, Record<string, unknown>>;
  cards: Record<string, unknown>[];
  card_references: Record<string, unknown>[];
  simulados: Map<string, Record<string, unknown>>;
  simulado_questoes: Record<string, unknown>[];
  simulado_respostas: Record<string, unknown>[];
}

const mocks = vi.hoisted(() => ({
  createSupabaseClient: vi.fn(),
  createLogger: vi.fn(),
  fetchWithTimeout: vi.fn(),
  trackServer: vi.fn(),
  authorizeRunCreation: vi.fn(),
  getMonthlyRunCounts: vi.fn(),
  checkDailyRunQuota: vi.fn(),
  checkCircuitBreaker: vi.fn(),
  checkWeeklyTokenBudget: vi.fn(),
  recordAISuccess: vi.fn(),
  recordAIFailure: vi.fn(),
  recordAIFailureClassified: vi.fn(),
  logTokenAnomaly: vi.fn(),
  hasProAccess: vi.fn(),
  rankChunksByRelevance: vi.fn(),
  deduplicateByJaccard: vi.fn(),
  selectChunksWithinTokenBudget: vi.fn(),
  hasCapacity: vi.fn(),
  acquireSlot: vi.fn(),
  renewSlot: vi.fn(),
  releaseSlot: vi.fn(),
  getCapacitySummary: vi.fn(),
  resolveSlotKey: vi.fn(),
  getStudyGoalProfile: vi.fn(),
  getStudyGoalByUserId: vi.fn(),
  captureApiError: vi.fn(),
  captureWarning: vi.fn(),
  authenticateCronRequest: vi.fn(),
  getBaseUrl: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createSupabaseClient,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: mocks.createLogger,
}));

vi.mock('@/lib/ai/timeout', () => ({
  fetchWithTimeout: mocks.fetchWithTimeout,
}));

vi.mock('@/lib/analytics/server-tracker', () => ({
  trackServer: mocks.trackServer,
}));

vi.mock('@/lib/billing/run-entitlement', () => ({
  authorizeRunCreation: mocks.authorizeRunCreation,
  getMonthlyRunCounts: mocks.getMonthlyRunCounts,
}));

vi.mock('@/lib/ai/cost-guard', () => ({
  checkDailyRunQuota: mocks.checkDailyRunQuota,
  checkCircuitBreaker: mocks.checkCircuitBreaker,
  checkWeeklyTokenBudget: mocks.checkWeeklyTokenBudget,
  recordAISuccess: mocks.recordAISuccess,
  recordAIFailure: mocks.recordAIFailure,
  recordAIFailureClassified: mocks.recordAIFailureClassified,
  logTokenAnomaly: mocks.logTokenAnomaly,
}));

vi.mock('@/lib/billing/pro-access', () => ({
  hasProAccess: mocks.hasProAccess,
}));

vi.mock('@/lib/ai/chunk-ranker', () => ({
  rankChunksByRelevance: mocks.rankChunksByRelevance,
  deduplicateByJaccard: mocks.deduplicateByJaccard,
}));

vi.mock('@/lib/ai/prompt-budget', () => ({
  selectChunksWithinTokenBudget: mocks.selectChunksWithinTokenBudget,
}));

vi.mock('@/lib/ai/provider-capacity', () => ({
  hasCapacity: mocks.hasCapacity,
  acquireSlot: mocks.acquireSlot,
  renewSlot: mocks.renewSlot,
  releaseSlot: mocks.releaseSlot,
  getCapacitySummary: mocks.getCapacitySummary,
  resolveSlotKey: mocks.resolveSlotKey,
}));

vi.mock('@/lib/study-goal-profiles', () => ({
  getStudyGoalProfile: mocks.getStudyGoalProfile,
}));

vi.mock('@/lib/study-goal/get-study-goal', () => ({
  getStudyGoalByUserId: mocks.getStudyGoalByUserId,
}));

vi.mock('@/lib/sentry', () => ({
  captureApiError: mocks.captureApiError,
  captureWarning: mocks.captureWarning,
}));

vi.mock('@/lib/security/cron-auth', () => ({
  authenticateCronRequest: mocks.authenticateCronRequest,
}));

vi.mock('@/lib/url', () => ({
  getBaseUrl: mocks.getBaseUrl,
}));

const USER_ID = 'stress-user';
const INTERNAL_SECRET = 'stress-secret';
const BASE_URL = 'https://vimens.test';

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function getTableRows(state: DbState, table: TableName): Record<string, unknown>[] {
  switch (table) {
    case 'runs':
      return [...state.runs.values()] as unknown as Record<string, unknown>[];
    case 'profiles':
      return [...state.profiles.values()];
    case 'subscriptions':
      return [...state.subscriptions.values()] as unknown as Record<string, unknown>[];
    case 'beta_invites':
      return state.beta_invites;
    case 'sources':
      return [...state.sources.values()] as unknown as Record<string, unknown>[];
    case 'source_chunks':
      return state.source_chunks as unknown as Record<string, unknown>[];
    case 'source_digests':
      return state.source_digests;
    case 'decks':
      return [...state.decks.values()];
    case 'cards':
      return state.cards;
    case 'card_references':
      return state.card_references;
    case 'simulados':
      return [...state.simulados.values()];
    case 'simulado_questoes':
      return state.simulado_questoes;
    case 'simulado_respostas':
      return state.simulado_respostas;
  }
}

function insertRows(state: DbState, table: TableName, payload: Record<string, unknown> | Record<string, unknown>[]) {
  const rows = Array.isArray(payload) ? payload : [payload];

  switch (table) {
    case 'runs':
      rows.forEach(row => state.runs.set(String(row.id), row as unknown as RunRow));
      break;
    case 'profiles':
      rows.forEach(row => state.profiles.set(String(row.id), row));
      break;
    case 'subscriptions':
      rows.forEach(row => state.subscriptions.set(String(row.id), row as unknown as SubscriptionRow));
      break;
    case 'beta_invites':
      state.beta_invites.push(...rows);
      break;
    case 'sources':
      rows.forEach(row => state.sources.set(String(row.id), row as unknown as SourceRow));
      break;
    case 'source_chunks':
      state.source_chunks.push(...(rows as unknown as SourceChunkRow[]));
      break;
    case 'source_digests':
      state.source_digests.push(...rows);
      break;
    case 'decks':
      rows.forEach(row => state.decks.set(String(row.id), row));
      break;
    case 'cards':
      state.cards.push(...rows);
      break;
    case 'card_references':
      state.card_references.push(...rows);
      break;
    case 'simulados':
      rows.forEach(row => state.simulados.set(String(row.id), row));
      break;
    case 'simulado_questoes':
      state.simulado_questoes.push(...rows);
      break;
    case 'simulado_respostas':
      state.simulado_respostas.push(...rows);
      break;
  }
}

class SelectQuery {
  private filters: Array<(row: Record<string, unknown>) => boolean> = [];
  private orderBy: { field: string; ascending: boolean } | null = null;
  private limitBy: number | null = null;

  constructor(private state: DbState, private table: TableName) {}

  eq(column: string, value: unknown) {
    this.filters.push(row => row[column] === value);
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push(row => row[column] === value);
    return this;
  }

  lt(column: string, value: number) {
    this.filters.push(row => {
      const candidate = row[column];
      return typeof candidate === 'number' && candidate < value;
    });
    return this;
  }

  lte(column: string, value: number) {
    this.filters.push(row => {
      const candidate = row[column];
      return typeof candidate === 'number' && candidate <= value;
    });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push(row => values.includes(row[column]));
    return this;
  }

  order(field: string, options?: { ascending?: boolean }) {
    this.orderBy = { field, ascending: options?.ascending !== false };
    return this;
  }

  limit(count: number) {
    this.limitBy = count;
    return this;
  }

  private executeRows() {
    let rows = getTableRows(this.state, this.table).filter(row => this.filters.every(filter => filter(row)));
    if (this.orderBy) {
      const { field, ascending } = this.orderBy;
      rows = [...rows].sort((a, b) => {
        const aValue = a[field];
        const bValue = b[field];
        if (aValue === bValue) return 0;
        if (aValue == null) return ascending ? -1 : 1;
        if (bValue == null) return ascending ? 1 : -1;
        return ascending
          ? Number(aValue) - Number(bValue)
          : Number(bValue) - Number(aValue);
      });
    }
    if (this.limitBy != null) {
      rows = rows.slice(0, this.limitBy);
    }
    return rows;
  }

  async single() {
    const rows = this.executeRows();
    return {
      data: rows[0] ?? null,
      error: rows[0] ? null : { message: `No row found in ${this.table}` },
    };
  }

  async maybeSingle() {
    const rows = this.executeRows();
    return {
      data: rows[0] ?? null,
      error: null,
    };
  }

  async execute() {
    const rows = this.executeRows();
    return {
      data: rows,
      count: rows.length,
      error: null,
    };
  }

  then<TResult1 = Awaited<ReturnType<UpdateQuery['execute']>>, TResult2 = never>(
    onfulfilled?: ((value: Awaited<ReturnType<UpdateQuery['execute']>>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

class UpdateQuery {
  private filters: Array<(row: Record<string, unknown>) => boolean> = [];
  private returnSingle = false;

  constructor(
    private state: DbState,
    private table: TableName,
    private payload: Record<string, unknown>,
  ) {}

  eq(column: string, value: unknown) {
    this.filters.push(row => row[column] === value);
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push(row => row[column] === value);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push(row => values.includes(row[column]));
    return this;
  }

  select() {
    return this;
  }

  single() {
    this.returnSingle = true;
    return this.execute();
  }

  async execute() {
    const rows = getTableRows(this.state, this.table).filter(row => this.filters.every(filter => filter(row)));
    rows.forEach(row => Object.assign(row, this.payload));
    if (this.returnSingle) {
      return { data: rows[0] ?? null, error: rows[0] ? null : { message: `No row found in ${this.table}` } };
    }
    return { data: rows, error: null };
  }

  then<TResult1 = Awaited<ReturnType<UpdateQuery['execute']>>, TResult2 = never>(
    onfulfilled?: ((value: Awaited<ReturnType<UpdateQuery['execute']>>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

class InsertQuery {
  private returnInserted = false;

  constructor(
    private state: DbState,
    private table: TableName,
    private payload: Record<string, unknown> | Record<string, unknown>[],
  ) {}

  select() {
    this.returnInserted = true;
    return this;
  }

  private getInsertedRows() {
    return Array.isArray(this.payload) ? this.payload : [this.payload];
  }

  async single() {
    const rows = this.getInsertedRows();
    insertRows(this.state, this.table, this.payload);
    return { data: this.returnInserted ? rows[0] ?? null : null, error: null };
  }

  async execute() {
    insertRows(this.state, this.table, this.payload);
    return { data: this.returnInserted ? this.getInsertedRows() : null, error: null };
  }

  then<TResult1 = Awaited<{ data: Record<string, unknown>[] | Record<string, unknown> | null; error: null }>, TResult2 = never>(
    onfulfilled?: ((value: { data: Record<string, unknown>[] | Record<string, unknown> | null; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

function createSupabaseMock(state: DbState) {
  return {
    from(table: TableName) {
      return {
        select: () => new SelectQuery(state, table),
        update: (payload: Record<string, unknown>) => new UpdateQuery(state, table, payload),
        insert: (payload: Record<string, unknown> | Record<string, unknown>[]) => new InsertQuery(state, table, payload),
      };
    },
  };
}

function buildChunkContent(runId: string, objective: RunObjective, index: number) {
  const topic = objective === 'flashcards' ? 'flashcards' : 'simulado';
  return [
    `RUN_ID:${runId}.`,
    `Conteudo base ${topic} ${index}.`,
    'Conceitos, requisitos, excecoes e consequencias praticas do tema.',
    'O texto sustenta geracao de itens com citacao direta e resposta objetiva.',
  ].join(' ');
}

function seedState(config?: Pick<ScenarioConfig, 'flashcardRuns' | 'simuladoRuns'>) {
  const now = Date.now();
  const flashcardRuns = config?.flashcardRuns ?? 20;
  const simuladoRuns = config?.simuladoRuns ?? 10;
  const state: DbState = {
    runs: new Map(),
    profiles: new Map([
      [USER_ID, { id: USER_ID, is_pro: true, subscription_status: 'active', admin_override_pro: true }],
    ]),
    subscriptions: new Map([
      [USER_ID, {
        id: 'sub_stress_active',
        user_id: USER_ID,
        status: 'active',
        cancel_at_period_end: false,
        current_period_end: now + 30 * 24 * 60 * 60 * 1000,
        updated_at: now,
      }],
    ]),
    beta_invites: [],
    sources: new Map(),
    source_chunks: [],
    source_digests: [],
    decks: new Map(),
    cards: [],
    card_references: [],
    simulados: new Map(),
    simulado_questoes: [],
    simulado_respostas: [],
  };

  for (let index = 1; index <= flashcardRuns; index++) {
    const runId = `flash-${String(index).padStart(2, '0')}`;
    const sourceId = `${runId}-source`;

    state.runs.set(runId, {
      id: runId,
      user_id: USER_ID,
      source_id: sourceId,
      objective: 'flashcards',
      model_preference: 'auto',
      target_count: 6,
      status: 'queued',
      attempt_count: 0,
      provider_attempt_count: 0,
      items_generated: 0,
      next_attempt_at: now,
      created_at: now - 5 * 60_000,
      updated_at: now - 5 * 60_000,
      deleted_at: null,
    });

    state.sources.set(sourceId, {
      id: sourceId,
      filename: `${runId}.pdf`,
      user_id: USER_ID,
    });

    for (let chunkIndex = 1; chunkIndex <= 5; chunkIndex++) {
      state.source_chunks.push({
        source_id: sourceId,
        position: chunkIndex - 1,
        chunks: {
          id: `${runId}-chunk-${chunkIndex}`,
          content: buildChunkContent(runId, 'flashcards', chunkIndex),
          page_number: chunkIndex,
        },
      });
    }
  }

  for (let index = 1; index <= simuladoRuns; index++) {
    const runId = `quiz-${String(index).padStart(2, '0')}`;
    const sourceId = `${runId}-source`;

    state.runs.set(runId, {
      id: runId,
      user_id: USER_ID,
      source_id: sourceId,
      objective: 'questoes_banca',
      model_preference: 'auto',
      target_count: 4,
      status: 'queued',
      attempt_count: 0,
      provider_attempt_count: 0,
      items_generated: 0,
      next_attempt_at: now,
      created_at: now - 5 * 60_000,
      updated_at: now - 5 * 60_000,
      banca: 'FGV',
      dificuldade: 'medio',
      deleted_at: null,
    });

    state.sources.set(sourceId, {
      id: sourceId,
      filename: `${runId}.pdf`,
      user_id: USER_ID,
    });

    for (let chunkIndex = 1; chunkIndex <= 5; chunkIndex++) {
      state.source_chunks.push({
        source_id: sourceId,
        position: chunkIndex - 1,
        chunks: {
          id: `${runId}-chunk-${chunkIndex}`,
          content: buildChunkContent(runId, 'questoes_banca', chunkIndex),
          page_number: chunkIndex,
        },
      });
    }
  }

  return state;
}

function countStatuses(runs: Iterable<RunRow>) {
  const values = [...runs];
  return {
    pending: values.filter(run => ['pendente', 'queued', 'retry_wait'].includes(run.status)).length,
    processing: values.filter(run => run.status === 'processando').length,
    concluded: values.filter(run => run.status === 'concluido').length,
    failed: values.filter(run => run.status === 'erro').length,
    recovered: values.filter(run => run.status === 'concluido' && run.attempt_count > 1).length,
  };
}

function extractRunId(text: string) {
  const match = text.match(/RUN_ID:([a-z0-9-]+)/i);
  return match?.[1] ?? null;
}

function extractChunks(text: string) {
  const chunks: Array<{ id: string; content: string }> = [];
  const regex = /=== TRECHO ID: ([a-z0-9-]+)(?: \([^)]+\))? ===\s+Fonte:[^\n]+\s+([\s\S]*?)\s+=== FIM DO TRECHO \1 ===/gi;
  const compactRegex = /@id=([a-z0-9-]+)(?:\|p=\d+)?\n([\s\S]*?)(?=\n\n@id=|\n\nFACTS|\nJSON:|$)/gi;

  for (const match of text.matchAll(regex)) {
    chunks.push({
      id: match[1],
      content: match[2].trim(),
    });
  }

  if (chunks.length === 0) {
    for (const match of text.matchAll(compactRegex)) {
      chunks.push({
        id: match[1],
        content: match[2].trim(),
      });
    }
  }

  return chunks;
}

function detectPhase(text: string): AiPhase {
  if (text.includes('Classifique a qualidade desta base')) return 'diagnosis';
  if (text.includes('QUESTOES COM FONTES')) return 'review';
  return 'generation';
}

function extractRequestedCount(text: string) {
  const match = text.match(/crie\s+(\d+)/i);
  return Number(match?.[1] ?? '4');
}

function buildFlashcards(count: number, chunks: Array<{ id: string; content: string }>) {
  return Array.from({ length: count }, (_, index) => {
    const chunk = chunks[index % chunks.length];
    return {
      front: `Pergunta ${index + 1} sobre ${chunk.id}?`,
      back: `Resposta ${index + 1} ancorada no trecho ${chunk.id}.`,
      category: 'conceito',
      chunkId: chunk.id,
      citationExcerpt: chunk.content.slice(0, 80),
    };
  });
}

function buildQuestions(count: number, chunks: Array<{ id: string; content: string }>) {
  return Array.from({ length: count }, (_, index) => {
    const chunk = chunks[index % chunks.length];
    return {
      enunciado: `Questao ${index + 1} para avaliar o entendimento do trecho ${chunk.id} em contexto aplicado.`,
      alternativas: [
        'A) Alternativa correta com base no texto.',
        'B) Distrator plausivel 1.',
        'C) Distrator plausivel 2.',
        'D) Distrator plausivel 3.',
        'E) Distrator plausivel 4.',
      ],
      respostaCorreta: 'A',
      comentario: `Comentario da questao ${index + 1} com base no trecho ${chunk.id}.`,
      chunkId: chunk.id,
      citationExcerpt: chunk.content.slice(0, 80),
      sources: [{ chunkId: chunk.id, citationExcerpt: chunk.content.slice(0, 80) }],
    };
  });
}

function createAiController(config: ScenarioConfig) {
  const transientFailures = new Map(Object.entries(config.transientGenerationFailures));
  const permanentFailures = new Set(config.permanentGenerationFailures);
  const metrics: AiCallMetric[] = [];

  async function handle(url: string, options: RequestInit = {}) {
    const provider: Provider = url.includes('groq.com') ? 'groq' : 'gemini';
    const start = Date.now();
    const payload = JSON.parse(String(options.body ?? '{}'));
    const text = provider === 'groq'
      ? payload.messages?.map((message: { content?: string }) => message.content ?? '').join('\n\n') ?? ''
      : payload.contents?.[0]?.parts?.[0]?.text ?? '';
    const runId = extractRunId(text);
    const phase = detectPhase(text);
    const delayMs = provider === 'groq' ? config.groqDelayMs : config.geminiDelayMs;

    await wait(delayMs);

    if (phase === 'generation' && runId) {
      if (permanentFailures.has(runId)) {
        metrics.push({ provider, phase, runId, durationMs: Date.now() - start, failed: true });
        throw new Error(`${provider.toUpperCase()} permanent failure for ${runId}`);
      }

      const remainingFailures = transientFailures.get(runId) ?? 0;
      if (remainingFailures > 0) {
        transientFailures.set(runId, remainingFailures - 1);
        metrics.push({ provider, phase, runId, durationMs: Date.now() - start, failed: true });
        throw new Error(`${provider.toUpperCase()} transient failure for ${runId}`);
      }
    }

    let responseText = '[]';
    if (phase === 'diagnosis') {
      responseText = JSON.stringify({
        qualidade_base: 'forte',
        dificuldade_maxima_sustentavel: 'medio',
        fidelidade_banca_possivel: 'alta',
        motivo_limitacao: '',
      });
    } else if (phase === 'review') {
      const approvedCount = (text.match(/"index":/g) ?? []).length;
      responseText = JSON.stringify({
        aprovadas: Array.from({ length: approvedCount }, (_, index) => index),
        motivos_reprovacao: [],
      });
    } else {
      const chunks = extractChunks(text);
      const count = extractRequestedCount(text);
      responseText = JSON.stringify(
        text.toLowerCase().includes('flashcards')
          ? buildFlashcards(count, chunks)
          : buildQuestions(count, chunks),
      );
    }

    metrics.push({ provider, phase, runId, durationMs: Date.now() - start, failed: false });

    if (provider === 'groq') {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: responseText } }],
          usage: { total_tokens: 1200 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: responseText }] } }],
        usageMetadata: { totalTokenCount: 2400 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }

  return {
    handle,
    getMetrics: () => metrics,
  };
}

function createCapacityController() {
  const limits: Record<string, number> = {
    'groq:flashcards': 10,
    'groq:questoes': 6,
    'gemini:questoes': 6,
    'gemini:flashcards': 0,
    'openai:flashcards': 0,
    'openai:questoes': 0,
  };
  const active = new Map<string, Set<string>>();
  const maxActive = new Map<string, number>();

  function getSet(slotKey: string) {
    if (!active.has(slotKey)) {
      active.set(slotKey, new Set());
    }
    return active.get(slotKey)!;
  }

  function recordMax(slotKey: string) {
    const size = getSet(slotKey).size;
    maxActive.set(slotKey, Math.max(maxActive.get(slotKey) ?? 0, size));
  }

  async function acquireSlot(slotKey: string, runId: string) {
    const slots = getSet(slotKey);
    const limit = limits[slotKey] ?? 1;
    if (slots.has(runId)) {
      return true;
    }
    if (slots.size >= limit) {
      return false;
    }
    slots.add(runId);
    recordMax(slotKey);
    return true;
  }

  async function renewSlot(slotKey: string, runId: string) {
    return getSet(slotKey).has(runId);
  }

  async function releaseSlot(slotKey: string, runId: string) {
    getSet(slotKey).delete(runId);
  }

  async function getCapacitySummary() {
    return Object.fromEntries(Object.entries(limits).map(([slotKey, max]) => [
      slotKey,
      { active: getSet(slotKey).size, max },
    ]));
  }

  function getMaxActiveSlots() {
    return Object.fromEntries(Object.keys(limits).map(slotKey => [
      slotKey,
      maxActive.get(slotKey) ?? 0,
    ]));
  }

  return {
    acquireSlot,
    renewSlot,
    releaseSlot,
    getCapacitySummary,
    getMaxActiveSlots,
  };
}

function buildProviderStats(metrics: AiCallMetric[], provider: Provider) {
  const providerMetrics = metrics.filter(metric => metric.provider === provider);
  const durations = providerMetrics.map(metric => metric.durationMs);
  return {
    calls: providerMetrics.length,
    failures: providerMetrics.filter(metric => metric.failed).length,
    avgDurationMs: average(durations),
    maxDurationMs: durations.length > 0 ? Math.max(...durations) : 0,
  };
}

function buildObjectiveStats(state: DbState, firstDispatchAt: Map<string, number>, terminalAt: Map<string, number>) {
  const runs = [...state.runs.values()];
  const objectives: RunObjective[] = ['flashcards', 'questoes_banca'];

  return Object.fromEntries(objectives.map(objective => {
    const relevant = runs.filter(run => run.objective === objective);
    const durations = relevant
      .map(run => {
        const started = firstDispatchAt.get(run.id);
        const finished = terminalAt.get(run.id);
        return started != null && finished != null ? finished - started : null;
      })
      .filter((value): value is number => value != null);

    return [objective, {
      count: relevant.length,
      avgCompletionMs: average(durations),
      maxCompletionMs: durations.length > 0 ? Math.max(...durations) : 0,
    }];
  })) as ScenarioSummary['objectiveStats'];
}

async function runScenario(config: ScenarioConfig): Promise<ScenarioSummary> {
  vi.resetModules();

  const state = seedState(config);
  const ai = createAiController(config);
  const capacity = createCapacityController();
  const supabase = createSupabaseMock(state);
  const firstDispatchAt = new Map<string, number>();
  const terminalAt = new Map<string, number>();
  const backgroundPromises: Promise<unknown>[] = [];
  let queueCycles = 0;

  mocks.createSupabaseClient.mockImplementation(() => supabase);
  mocks.fetchWithTimeout.mockImplementation((url: string, options?: RequestInit) => ai.handle(url, options));
  mocks.acquireSlot.mockImplementation(capacity.acquireSlot);
  mocks.renewSlot.mockImplementation(capacity.renewSlot);
  mocks.releaseSlot.mockImplementation(capacity.releaseSlot);
  mocks.getCapacitySummary.mockImplementation(capacity.getCapacitySummary);

  const { POST } = await import('@/app/api/runs/process/route');
  const { GET: processQueueGET, POST: processQueuePOST } = await import('@/app/api/cron/process-queue/route');
  const { GET } = await import('@/app/api/cron/recover-runs/route');

  global.fetch = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url === `${BASE_URL}/api/runs/process`) {
      const payload = JSON.parse(String(init?.body ?? '{}'));
      if (typeof payload.runId === 'string' && !firstDispatchAt.has(payload.runId)) {
        firstDispatchAt.set(payload.runId, Date.now());
      }
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-secret': INTERNAL_SECRET,
        },
        body: JSON.stringify(payload),
      });

      const promise = POST(request);
      backgroundPromises.push(promise);
      return promise.then(() => new Response('{}', { status: 200 }));
    }

    if (url === `${BASE_URL}/api/cron/process-queue`) {
      queueCycles++;
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-secret': INTERNAL_SECRET,
        },
        body: typeof init?.body === 'string' ? init.body : JSON.stringify(init?.body ?? {}),
      });
      const promise = processQueuePOST(request);
      backgroundPromises.push(promise);
      return promise.then(response => response);
    }

    if (url !== `${BASE_URL}/api/runs/process`) {
      throw new Error(`Unexpected fetch url: ${url}`);
    }

    throw new Error(`Unexpected fetch url: ${url}`);
  }) as typeof fetch;

  const runIds = [...state.runs.keys()];

  function markTerminalRuns() {
    for (const run of state.runs.values()) {
      if ((run.status === 'concluido' || run.status === 'erro') && !terminalAt.has(run.id)) {
        terminalAt.set(run.id, Date.now());
      }
    }
  }

  async function runQueueCycle() {
    const queueRequest = new NextRequest(`${BASE_URL}/api/cron/process-queue`, {
      method: 'GET',
      headers: { 'upstash-signature': 'ok' },
    });

    queueCycles++;
    await processQueueGET(queueRequest);
  }

  async function drainBackgroundWork() {
    while (backgroundPromises.length > 0) {
      const batch = backgroundPromises.splice(0);
      await Promise.allSettled(batch);
      markTerminalRuns();
    }
  }

  const startedAt = Date.now();

  await runQueueCycle();

  const initial = countStatuses(state.runs.values());
  const recoverResponses: ScenarioSummary['recoverResponses'] = [];
  let recoveryWaves = 0;

  if (initial.processing > 0) {
    const request = new NextRequest(`${BASE_URL}/api/cron/recover-runs`, {
      method: 'GET',
      headers: { 'upstash-signature': 'ok' },
    });

    const response = await GET(request);
    const json = await response.json();
    recoverResponses.push({
      recoveredFromProcessing: Number(json.recoveredFromProcessing ?? 0),
      recoveredFromStale: Number(json.recoveredFromStale ?? 0),
      markedFailed: Number(json.markedFailed ?? 0),
    });
    recoveryWaves++;
  }

  await drainBackgroundWork();

  while (recoveryWaves < 8) {
    const status = countStatuses(state.runs.values());
    if (status.pending === 0 && status.processing === 0) {
      break;
    }

    if (status.pending > 0) {
      await runQueueCycle();
      await drainBackgroundWork();
    }

    const postQueueStatus = countStatuses(state.runs.values());
    if (postQueueStatus.processing > 0) {
      const request = new NextRequest(`${BASE_URL}/api/cron/recover-runs`, {
        method: 'GET',
        headers: { 'upstash-signature': 'ok' },
      });

      const response = await GET(request);
      const json = await response.json();
      recoverResponses.push({
        recoveredFromProcessing: Number(json.recoveredFromProcessing ?? 0),
        recoveredFromStale: Number(json.recoveredFromStale ?? 0),
        markedFailed: Number(json.markedFailed ?? 0),
      });
      recoveryWaves++;

      await drainBackgroundWork();
    } else {
      recoveryWaves++;
    }
  }

  markTerminalRuns();

  const metrics = ai.getMetrics();
  const summary: ScenarioSummary = {
    scenario: config.name,
    totalRuns: runIds.length,
    totalElapsedMs: Date.now() - startedAt,
    queueCycles,
    initial,
    final: countStatuses(state.runs.values()),
    recoveryWaves,
    recoverResponses,
    maxActiveSlots: capacity.getMaxActiveSlots(),
    ai: {
      groq: buildProviderStats(metrics, 'groq'),
      gemini: buildProviderStats(metrics, 'gemini'),
    },
    objectiveStats: buildObjectiveStats(state, firstDispatchAt, terminalAt),
  };

  return summary;
}

beforeEach(() => {
  vi.clearAllMocks();

  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
  process.env.RUNS_PROCESS_INTERNAL_SECRET = INTERNAL_SECRET;
  process.env.GROQ_API_KEY = 'groq-key';
  process.env.GEMINI_API_KEY = 'gemini-key';
  process.env.FLASHCARDS_PROVIDER = 'groq';
  process.env.FLASHCARDS_OPENAI_PERCENT = '0';
  process.env.OPENAI_FLASHCARDS_MODEL = 'gpt-4o-mini';
  process.env.AI_RETRY_BASE_DELAY_MS = '0';
  process.env.AI_RETRY_MAX_ATTEMPTS = '5';

  mocks.createLogger.mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  });
  mocks.trackServer.mockImplementation(() => {});
  mocks.authorizeRunCreation.mockReturnValue({ allowed: true });
  mocks.getMonthlyRunCounts.mockResolvedValue({ month: 0 });
  mocks.checkDailyRunQuota.mockResolvedValue({ allowed: true });
  mocks.checkCircuitBreaker.mockResolvedValue({ allowed: true });
  mocks.checkWeeklyTokenBudget.mockResolvedValue({
    allowed: true,
    shouldDegradeModel: false,
    tokensUsed: 0,
    tokenLimit: 999999,
  });
  mocks.recordAISuccess.mockResolvedValue(undefined);
  mocks.recordAIFailure.mockResolvedValue(undefined);
  mocks.recordAIFailureClassified.mockResolvedValue(undefined);
  mocks.logTokenAnomaly.mockImplementation(() => {});
  mocks.hasProAccess.mockReturnValue(true);
  mocks.rankChunksByRelevance.mockImplementation((chunks: unknown[]) => chunks);
  mocks.deduplicateByJaccard.mockImplementation((items: unknown[]) => items);
  mocks.selectChunksWithinTokenBudget.mockImplementation((chunks: unknown[]) => chunks);
  mocks.hasCapacity.mockResolvedValue(true);
  mocks.acquireSlot.mockResolvedValue(true);
  mocks.renewSlot.mockResolvedValue(true);
  mocks.releaseSlot.mockResolvedValue(undefined);
  mocks.getCapacitySummary.mockResolvedValue({
    'groq:flashcards': { active: 0, max: 50 },
    'groq:questoes': { active: 0, max: 50 },
    'gemini:questoes': { active: 0, max: 50 },
    'gemini:flashcards': { active: 0, max: 50 },
  });
  mocks.resolveSlotKey.mockImplementation((objective: RunObjective, preference: string) => {
    const provider = preference === 'gemini' || objective === 'questoes_banca' ? 'gemini' : 'groq';
    const kind = objective === 'flashcards' ? 'flashcards' : 'questoes';
    return `${provider}:${kind}`;
  });
  mocks.getStudyGoalByUserId.mockResolvedValue('concurso');
  mocks.getStudyGoalProfile.mockReturnValue({
    key: 'concurso',
    label: 'Concurso',
    persona: 'Voce ajuda a criar material de estudo.',
    flashcardRules: 'Mantenha fidelidade ao texto.',
    topicExtractionContext: 'material de estudo',
    baseDiagnosisContext: 'questoes de concurso',
    genericQuestionPersona: 'Voce cria questoes de concurso bem ancoradas.',
    allowedObjectives: ['flashcards', 'questoes_banca', 'exercicios_aplicados'],
    bancasEnabled: true,
    supportsBanca: true,
    defaultBanca: null,
    logicObjectiveLabel: 'Exercicios Aplicados',
  });
  mocks.captureApiError.mockImplementation(() => {});
  mocks.captureWarning.mockImplementation(() => {});
  mocks.authenticateCronRequest.mockResolvedValue({ ok: true, status: 200 });
  mocks.getBaseUrl.mockReturnValue(BASE_URL);
});

describe('run processing stress harness', () => {
  it('measures mixed load, intermittent failures, and provider slowdown effects', async () => {
    const mixed = await runScenario({
      name: 'mixed-intermittent',
      groqDelayMs: 35,
      geminiDelayMs: 90,
      transientGenerationFailures: {
        'flash-01': 1,
        'flash-02': 1,
        'flash-03': 1,
        'quiz-01': 1,
        'quiz-02': 1,
      },
      permanentGenerationFailures: ['quiz-10'],
    });

    const slowGroq = await runScenario({
      name: 'slow-groq',
      groqDelayMs: 220,
      geminiDelayMs: 40,
      transientGenerationFailures: {},
      permanentGenerationFailures: [],
    });

    const slowGemini = await runScenario({
      name: 'slow-gemini',
      groqDelayMs: 40,
      geminiDelayMs: 220,
      transientGenerationFailures: {},
      permanentGenerationFailures: [],
    });

    const flashcards100 = await runScenario({
      name: '100-flashcards',
      flashcardRuns: 100,
      simuladoRuns: 0,
      groqDelayMs: 40,
      geminiDelayMs: 0,
      transientGenerationFailures: {
        'flash-01': 1,
        'flash-02': 1,
        'flash-03': 1,
        'flash-04': 1,
        'flash-05': 1,
        'flash-06': 1,
        'flash-07': 1,
        'flash-08': 1,
        'flash-09': 1,
        'flash-10': 1,
      },
      permanentGenerationFailures: ['flash-100'],
    });

    const flashcards100SlowGroq = await runScenario({
      name: '100-flashcards-slow-groq',
      flashcardRuns: 100,
      simuladoRuns: 0,
      groqDelayMs: 220,
      geminiDelayMs: 0,
      transientGenerationFailures: {
        'flash-11': 1,
        'flash-12': 1,
        'flash-13': 1,
        'flash-14': 1,
        'flash-15': 1,
      },
      permanentGenerationFailures: [],
    });

    console.log(
      'STRESS_SUMMARY',
      JSON.stringify({ mixed, slowGroq, slowGemini, flashcards100, flashcards100SlowGroq }, null, 2),
    );

    expect(mixed.totalRuns).toBe(30);
    expect(mixed.initial.pending).toBe(14);
    expect(mixed.initial.processing).toBe(16);
    expect(mixed.queueCycles).toBeGreaterThan(1);
    expect(mixed.maxActiveSlots['groq:flashcards']).toBeLessThanOrEqual(10);
    expect(mixed.maxActiveSlots['gemini:questoes']).toBeLessThanOrEqual(6);
    expect(mixed.recoverResponses[0]?.recoveredFromProcessing).toBe(0);
    expect(mixed.recoverResponses[0]?.markedFailed).toBe(0);
    expect(mixed.final.failed).toBe(1);
    expect(mixed.final.pending).toBe(0);
    expect(mixed.final.processing).toBe(0);
    expect(mixed.final.recovered).toBe(5);
    expect(mixed.recoveryWaves).toBeGreaterThanOrEqual(1);

    expect(slowGroq.final.failed).toBe(0);
    expect(slowGemini.final.failed).toBe(0);
    expect(slowGroq.maxActiveSlots['groq:flashcards']).toBeLessThanOrEqual(10);
    expect(slowGemini.maxActiveSlots['gemini:questoes']).toBeLessThanOrEqual(6);
    expect(slowGemini.ai.gemini.avgDurationMs).toBeGreaterThan(slowGroq.ai.gemini.avgDurationMs);
    expect(slowGemini.objectiveStats.questoes_banca.avgCompletionMs)
      .toBeGreaterThan(slowGroq.objectiveStats.questoes_banca.avgCompletionMs);

    expect(flashcards100.totalRuns).toBe(100);
    expect(flashcards100.initial.pending).toBe(90);
    expect(flashcards100.initial.processing).toBe(10);
    expect(flashcards100.queueCycles).toBeGreaterThan(1);
    expect(flashcards100.maxActiveSlots['groq:flashcards']).toBeLessThanOrEqual(10);
    expect(flashcards100.final.concluded).toBe(99);
    expect(flashcards100.final.failed).toBe(1);
    expect(flashcards100.final.pending).toBe(0);
    expect(flashcards100.final.recovered).toBe(10);
    expect(flashcards100.recoveryWaves).toBeGreaterThanOrEqual(1);

    expect(flashcards100SlowGroq.final.failed).toBe(0);
    expect(flashcards100SlowGroq.initial.pending).toBe(90);
    expect(flashcards100SlowGroq.maxActiveSlots['groq:flashcards']).toBeLessThanOrEqual(10);
    expect(flashcards100SlowGroq.ai.groq.avgDurationMs).toBeGreaterThan(flashcards100.ai.groq.avgDurationMs);
    expect(flashcards100SlowGroq.objectiveStats.flashcards.avgCompletionMs)
      .toBeGreaterThan(flashcards100.objectiveStats.flashcards.avgCompletionMs);
  }, 30000);
});

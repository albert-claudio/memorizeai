import { selectChunksWithinTokenBudget } from '@/lib/ai/prompt-budget';
import type { AIProvider, AITextResult } from '@/lib/ai/types';
import { SOURCE_DIGEST_PROMPT, SOURCE_DIGEST_PROMPT_CACHE_KEY, SOURCE_DIGEST_VERSION } from '@/lib/source-digest-prompts';

export interface DigestChunk {
  id: string;
  content: string;
  position: number;
  pageNumber?: number | null;
}

export interface SourceDigestEntry {
  id: string;
  fact: string;
  detail?: string;
  quote: string;
}

export interface SourceDigestContent {
  summary: string;
  topics: string[];
  flashcard_context: SourceDigestEntry[];
  pitfalls?: string[];
}

export interface SourceDigestRow {
  id: string;
  source_id: string;
  version: string;
  provider: AIProvider | null;
  model_used: string | null;
  content_json: SourceDigestContent;
  token_count: number | null;
  estimated_cost_usd: number | null;
  created_at: number;
  updated_at: number;
}

function compactWhitespace(value: string, fallback = ''): string {
  return value.replace(/\s+/g, ' ').trim() || fallback;
}

export function selectChunksForDigest(chunks: DigestChunk[]): DigestChunk[] {
  const maxChars = parseInt(process.env.SOURCE_DIGEST_MAX_CHARS || '14000', 10);
  const maxChunks = parseInt(process.env.SOURCE_DIGEST_MAX_CHUNKS || '12', 10);
  const maxCharsPerChunk = parseInt(process.env.SOURCE_DIGEST_MAX_CHARS_PER_CHUNK || '1300', 10);

  const truncated = chunks.map(chunk => ({
    ...chunk,
    content: chunk.content.length <= maxCharsPerChunk
      ? chunk.content
      : chunk.content.slice(0, maxCharsPerChunk).trim(),
  }));

  return selectChunksWithinTokenBudget(truncated, maxChars, 24).slice(0, maxChunks);
}

export function formatSourceDigestInput(chunks: DigestChunk[]): string {
  return chunks
    .map(chunk => {
      const page = chunk.pageNumber != null ? `|p=${chunk.pageNumber}` : '';
      return `@id=${chunk.id}${page}\n${chunk.content.trim()}`;
    })
    .join('\n\n');
}

export function buildSourceDigestRequest(chunks: DigestChunk[]) {
  const targetFacts = parseInt(process.env.SOURCE_DIGEST_TARGET_FACTS || '16', 10);
  const context = formatSourceDigestInput(selectChunksForDigest(chunks));

  return {
    system: SOURCE_DIGEST_PROMPT.system,
    user: SOURCE_DIGEST_PROMPT.user(targetFacts, context),
    promptCacheKey: SOURCE_DIGEST_PROMPT_CACHE_KEY,
    maxOutputTokens: parseInt(process.env.SOURCE_DIGEST_MAX_OUTPUT_TOKENS || '1400', 10),
  };
}

export function normalizeSourceDigestContent(raw: unknown): SourceDigestContent {
  const typed = (raw && typeof raw === 'object' ? raw : {}) as {
    summary?: unknown;
    topics?: unknown;
    flashcard_context?: unknown;
    pitfalls?: unknown;
  };

  const topics = Array.isArray(typed.topics)
    ? typed.topics.map(item => compactWhitespace(String(item))).filter(Boolean).slice(0, 8)
    : [];

  const entries = Array.isArray(typed.flashcard_context)
    ? typed.flashcard_context
        .map<SourceDigestEntry | null>(item => {
          const entry = (item && typeof item === 'object' ? item : {}) as {
            id?: unknown;
            fact?: unknown;
            detail?: unknown;
            quote?: unknown;
          };

          const id = compactWhitespace(String(entry.id ?? ''));
          const fact = compactWhitespace(String(entry.fact ?? ''));
          const quote = compactWhitespace(String(entry.quote ?? ''));
          const detail = compactWhitespace(String(entry.detail ?? ''), '');

          if (!id || !fact || !quote) return null;

          return {
            id,
            fact,
            detail: detail || undefined,
            quote,
          };
        })
        .filter((entry): entry is SourceDigestEntry => entry !== null)
        .slice(0, 24)
    : [];

  const pitfalls = Array.isArray(typed.pitfalls)
    ? typed.pitfalls.map(item => compactWhitespace(String(item))).filter(Boolean).slice(0, 8)
    : [];

  return {
    summary: compactWhitespace(String(typed.summary ?? '')),
    topics,
    flashcard_context: entries,
    pitfalls,
  };
}

export function buildSourceDigestRow(params: {
  sourceId: string;
  provider: AIProvider | null;
  model: string | null;
  result?: AITextResult | null;
  content: SourceDigestContent;
}) {
  const now = Date.now();
  return {
    id: `digest:${params.sourceId}:${SOURCE_DIGEST_VERSION}`,
    source_id: params.sourceId,
    version: SOURCE_DIGEST_VERSION,
    provider: params.provider,
    model_used: params.model,
    content_json: params.content,
    token_count: params.result?.totalTokens ?? null,
    estimated_cost_usd: params.result?.estimatedCostUsd ?? null,
    created_at: now,
    updated_at: now,
  };
}

export function buildFallbackSourceDigestContent(chunks: DigestChunk[]): SourceDigestContent {
  const selected = selectChunksForDigest(chunks).slice(0, 10);
  const flashcardContext = selected.map(chunk => {
    const compact = compactWhitespace(chunk.content);
    const firstSentence =
      compact.match(/(.{40,220}?[.!?])(?:\s|$)/)?.[1] ||
      compact.slice(0, 180);

    return {
      id: chunk.id,
      fact: firstSentence.slice(0, 110),
      detail: chunk.pageNumber != null ? `Pagina ${chunk.pageNumber}` : undefined,
      quote: compact.slice(0, 100),
    };
  });

  return {
    summary: selected
      .slice(0, 2)
      .map(chunk => compactWhitespace(chunk.content))
      .join(' ')
      .slice(0, 280),
    topics: [],
    flashcard_context: flashcardContext,
    pitfalls: [],
  };
}

export interface FlashcardsDigestPromptBudget {
  maxItems: number;
  maxCharsTotal: number;
  maxCharsPerItem: number;
}

export function getFlashcardsDigestPromptBudget(model: AIProvider, reduced = false): FlashcardsDigestPromptBudget {
  const defaults = reduced
    ? { maxItems: 6, maxCharsTotal: 1200, maxCharsPerItem: 180 }
    : { maxItems: 10, maxCharsTotal: 2200, maxCharsPerItem: 240 };

  if (model === 'openai') {
    return reduced
      ? { maxItems: 6, maxCharsTotal: 1100, maxCharsPerItem: 170 }
      : { maxItems: 10, maxCharsTotal: 2000, maxCharsPerItem: 220 };
  }

  if (model === 'groq') {
    return reduced
      ? { maxItems: 7, maxCharsTotal: 1300, maxCharsPerItem: 190 }
      : { maxItems: 11, maxCharsTotal: 2300, maxCharsPerItem: 250 };
  }

  return defaults;
}

export function formatDigestForFlashcards(
  digest: SourceDigestContent,
  model: AIProvider,
  reduced = false,
): string | null {
  if (!digest.flashcard_context || digest.flashcard_context.length === 0) {
    return null;
  }

  const budget = getFlashcardsDigestPromptBudget(model, reduced);
  const headerParts: string[] = [];
  if (digest.summary) headerParts.push(`SUM=${compactWhitespace(digest.summary).slice(0, 280)}`);
  if (digest.topics.length > 0) headerParts.push(`TOP=${digest.topics.slice(0, 6).join(' | ')}`);
  if (Array.isArray(digest.pitfalls) && digest.pitfalls.length > 0) {
    headerParts.push(`PIT=${digest.pitfalls.slice(0, 4).join(' | ')}`);
  }

  const lines = headerParts.length > 0 ? [headerParts.join('\n'), 'FACTS'] : ['FACTS'];
  let totalChars = lines.join('\n').length;
  let totalItems = 0;

  for (const entry of digest.flashcard_context) {
    if (totalItems >= budget.maxItems) break;

    const detail = entry.detail ? ` | ${compactWhitespace(entry.detail).slice(0, 80)}` : '';
    const line = `@id=${entry.id} ${compactWhitespace(entry.fact).slice(0, 110)}${detail} | "${compactWhitespace(entry.quote).slice(0, 80)}"`;
    const compactLine = line.slice(0, budget.maxCharsPerItem);

    if (totalChars + compactLine.length + 1 > budget.maxCharsTotal) break;

    lines.push(compactLine);
    totalChars += compactLine.length + 1;
    totalItems += 1;
  }

  return totalItems > 0 ? lines.join('\n') : null;
}

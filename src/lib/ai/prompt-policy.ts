import type { AIProvider } from '@/lib/ai/types';

/**
 * Prompt Policy — per-objective/model budget for chunk selection.
 *
 * Replaces the hardcoded 32000/80000 char budgets scattered across route.ts.
 * Provides specific, tested budgets per objective+model combination.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PromptPolicy {
  /** Max number of chunks to include */
  maxChunks: number;
  /** Max total characters across all chunks */
  maxCharsTotal: number;
  /** Max characters per individual chunk (truncate beyond this) */
  maxCharsPerChunk: number;
}

// ── Policy Table ──────────────────────────────────────────────────────────────

const POLICIES: Record<string, PromptPolicy> = {
  // Flashcards — lean budgets to survive rate limits under load
  'flashcards:groq': {
    maxChunks: parseInt(process.env.FLASHCARDS_GROQ_MAX_CHUNKS || '3', 10),
    maxCharsTotal: parseInt(process.env.FLASHCARDS_GROQ_MAX_CHARS_TOTAL || '4200', 10),
    maxCharsPerChunk: parseInt(process.env.FLASHCARDS_GROQ_MAX_CHARS_PER_CHUNK || '900', 10),
  },
  'flashcards:gemini': {
    maxChunks: parseInt(process.env.FLASHCARDS_GEMINI_MAX_CHUNKS || '3', 10),
    maxCharsTotal: parseInt(process.env.FLASHCARDS_GEMINI_MAX_CHARS_TOTAL || '4800', 10),
    maxCharsPerChunk: parseInt(process.env.FLASHCARDS_GEMINI_MAX_CHARS_PER_CHUNK || '950', 10),
  },
  'flashcards:openai': {
    maxChunks: parseInt(process.env.FLASHCARDS_OPENAI_MAX_CHUNKS || '2', 10),
    maxCharsTotal: parseInt(process.env.FLASHCARDS_OPENAI_MAX_CHARS_TOTAL || '2800', 10),
    maxCharsPerChunk: parseInt(process.env.FLASHCARDS_OPENAI_MAX_CHARS_PER_CHUNK || '750', 10),
  },

  // Questões de banca — needs more context for quality
  'questoes_banca:groq': {
    maxChunks: 6,
    maxCharsTotal: 20000,
    maxCharsPerChunk: 2000,
  },
  'questoes_banca:gemini': {
    maxChunks: 10,
    maxCharsTotal: 60000,
    maxCharsPerChunk: 4000,
  },

  // Exercícios aplicados
  'exercicios_aplicados:groq': {
    maxChunks: 6,
    maxCharsTotal: 18000,
    maxCharsPerChunk: 2000,
  },
  'exercicios_aplicados:gemini': {
    maxChunks: 8,
    maxCharsTotal: 40000,
    maxCharsPerChunk: 3000,
  },
};

// ── Reduced policies for payload_too_large retries ────────────────────────────

const REDUCED_POLICIES: Record<string, PromptPolicy> = {
  'flashcards:groq': {
    maxChunks: parseInt(process.env.FLASHCARDS_GROQ_REDUCED_MAX_CHUNKS || '2', 10),
    maxCharsTotal: parseInt(process.env.FLASHCARDS_GROQ_REDUCED_MAX_CHARS_TOTAL || '2600', 10),
    maxCharsPerChunk: parseInt(process.env.FLASHCARDS_GROQ_REDUCED_MAX_CHARS_PER_CHUNK || '700', 10),
  },
  'flashcards:gemini': {
    maxChunks: parseInt(process.env.FLASHCARDS_GEMINI_REDUCED_MAX_CHUNKS || '2', 10),
    maxCharsTotal: parseInt(process.env.FLASHCARDS_GEMINI_REDUCED_MAX_CHARS_TOTAL || '2800', 10),
    maxCharsPerChunk: parseInt(process.env.FLASHCARDS_GEMINI_REDUCED_MAX_CHARS_PER_CHUNK || '750', 10),
  },
  'flashcards:openai': {
    maxChunks: parseInt(process.env.FLASHCARDS_OPENAI_REDUCED_MAX_CHUNKS || '2', 10),
    maxCharsTotal: parseInt(process.env.FLASHCARDS_OPENAI_REDUCED_MAX_CHARS_TOTAL || '1800', 10),
    maxCharsPerChunk: parseInt(process.env.FLASHCARDS_OPENAI_REDUCED_MAX_CHARS_PER_CHUNK || '550', 10),
  },
  'questoes_banca:groq': {
    maxChunks: 4,
    maxCharsTotal: 14000,
    maxCharsPerChunk: 1500,
  },
  'questoes_banca:gemini': {
    maxChunks: 7,
    maxCharsTotal: 40000,
    maxCharsPerChunk: 3000,
  },
  'exercicios_aplicados:groq': {
    maxChunks: 4,
    maxCharsTotal: 12000,
    maxCharsPerChunk: 1500,
  },
  'exercicios_aplicados:gemini': {
    maxChunks: 6,
    maxCharsTotal: 28000,
    maxCharsPerChunk: 2500,
  },
};

// ── Default fallback ──────────────────────────────────────────────────────────

const DEFAULT_POLICY: PromptPolicy = {
  maxChunks: 4,
  maxCharsTotal: 12000,
  maxCharsPerChunk: 1200,
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get the prompt policy for a given objective and model.
 *
 * @param objective - 'flashcards', 'questoes_banca', or 'exercicios_aplicados'
 * @param model - 'groq' or 'gemini'
 * @param reduced - Whether to use reduced budget (e.g. after payload_too_large)
 */
export function getPromptPolicy(
  objective: string,
  model: AIProvider,
  reduced: boolean = false,
): PromptPolicy {
  const key = `${objective}:${model}`;
  
  if (reduced) {
    return REDUCED_POLICIES[key] || DEFAULT_POLICY;
  }

  return POLICIES[key] || DEFAULT_POLICY;
}

/**
 * Truncate a chunk's content to fit within the per-chunk character limit.
 * Truncates at the last sentence boundary before the limit.
 */
export function truncateChunk(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;

  // Find the last sentence boundary before the limit
  const truncated = content.slice(0, maxChars);
  const lastPeriod = truncated.lastIndexOf('.');
  const lastNewline = truncated.lastIndexOf('\n');
  const cutAt = Math.max(lastPeriod, lastNewline);

  if (cutAt > maxChars * 0.5) {
    return truncated.slice(0, cutAt + 1).trim();
  }

  // No good boundary found — hard cut with ellipsis
  return truncated.trim() + '…';
}

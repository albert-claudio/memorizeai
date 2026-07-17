import { estimateFlashcardsMaxOutputTokens, formatFlashcardContext, getFlashcardsPrompt } from '@/lib/ai/flashcards';
import { selectChunksWithinTokenBudget as selectPromptChunksWithinTokenBudget } from '@/lib/ai/prompt-budget';
import { getPromptPolicy, truncateChunk } from '@/lib/ai/prompt-policy';
import { getAITimeoutForObjective } from '@/lib/ai/timeout';
import type { AIProvider } from '@/lib/ai/types';
import type { ChunkWithContext, ProcessLogger } from '../contracts';

export const MAX_QUESTIONS_PER_GENERATION_CALL = parseInt(
  process.env.MAX_QUESTIONS_PER_GENERATION_CALL || '8',
  10,
);

export interface GenerationPayload {
  system: string;
  user: string;
  promptCacheKey?: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export type GenerationPayloadFactory = (provider: AIProvider) => GenerationPayload;

export function capGenerationBatchSize(targetCount: number, objective: string): number {
  if (objective === 'flashcards') {
    return targetCount;
  }
  return Math.min(targetCount, MAX_QUESTIONS_PER_GENERATION_CALL);
}

function formatChunksForPrompt(chunks: ChunkWithContext[]): string {
  return chunks.map(chunk => {
    const pageInfo = chunk.pageNumber ? ` (Página ${chunk.pageNumber})` : '';
    return `=== TRECHO ID: ${chunk.id}${pageInfo} ===
Fonte: ${chunk.sourceName}

${chunk.content}

=== FIM DO TRECHO ${chunk.id} ===`;
  }).join('\n\n');
}

function estimateQuestionMaxOutputTokens(objective: string, targetCount: number): number {
  const configured = Number.parseInt(process.env.QUESTOES_MAX_OUTPUT_TOKENS || '', 10);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }

  const tokensPerItem = objective === 'questoes_banca' ? 620 : 700;
  return Math.min(8_000, Math.max(2_500, 1_200 + targetCount * tokensPerItem));
}

export function buildGenerationPayload(params: {
  objective: string;
  targetCount: number;
  chunks: ChunkWithContext[];
  promptConfig: { system: string; user: (chunks: string, targetCount: number) => string } | null;
  digestContext?: string | null;
}) {
  if (params.objective === 'flashcards') {
    const context = params.digestContext || formatFlashcardContext(params.chunks);
    const flashcardsPrompt = getFlashcardsPrompt(params.targetCount, context);
    return {
      system: flashcardsPrompt.system,
      user: flashcardsPrompt.user,
      promptCacheKey: flashcardsPrompt.promptCacheKey,
      maxOutputTokens: estimateFlashcardsMaxOutputTokens(params.targetCount),
    };
  }

  const formattedChunks = formatChunksForPrompt(params.chunks);
  return {
    system: params.promptConfig!.system,
    user: params.promptConfig!.user(formattedChunks, params.targetCount),
    promptCacheKey: undefined,
    maxOutputTokens: estimateQuestionMaxOutputTokens(params.objective, params.targetCount),
  };
}

export function selectPromptChunksForRun(
  chunks: ChunkWithContext[],
  objective: string,
  model: AIProvider,
  reduced: boolean = false,
  log: ProcessLogger = () => {},
): ChunkWithContext[] {
  const policy = getPromptPolicy(objective, model, reduced);
  const truncatedChunks = chunks.map(chunk => ({
    ...chunk,
    content: truncateChunk(chunk.content, policy.maxCharsPerChunk),
  }));
  const selected = selectPromptChunksWithinTokenBudget(
    truncatedChunks,
    policy.maxCharsTotal,
  ).slice(0, policy.maxChunks);
  const totalChars = selected.reduce((sum, chunk) => sum + chunk.content.length + 100, 0);

  log(
    'Truncate',
    `Selected ${selected.length}/${chunks.length} chunks (${totalChars} chars) using ${objective}:${model}${reduced ? ':reduced' : ''}`,
  );

  return selected;
}

export function createGenerationPayloadFactory(params: {
  chunks: ChunkWithContext[];
  objective: string;
  targetCount: number;
  promptConfig: { system: string; user: (chunks: string, targetCount: number) => string } | null;
  digestContext?: string | null;
  useReducedPromptBudget: boolean;
  log?: ProcessLogger;
}): GenerationPayloadFactory {
  const batchCount = capGenerationBatchSize(params.targetCount, params.objective);

  return (provider: AIProvider) => {
    const selectedChunks = selectPromptChunksForRun(
      params.chunks,
      params.objective,
      provider,
      params.useReducedPromptBudget,
      params.log,
    );
    const payload = buildGenerationPayload({
      objective: params.objective,
      targetCount: batchCount,
      chunks: selectedChunks,
      promptConfig: params.promptConfig,
      digestContext: params.digestContext,
    });

    return {
      ...payload,
      timeoutMs: getAITimeoutForObjective(params.objective),
    };
  };
}

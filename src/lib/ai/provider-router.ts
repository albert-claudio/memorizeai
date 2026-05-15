import { createHash } from 'crypto';

import { callGeminiText } from '@/lib/ai/gemini';
import { callGroqText } from '@/lib/ai/groq';
import { callOpenAIText } from '@/lib/ai/openai';
import type {
  AIModelPreference,
  AIProvider,
  AITextRequest,
  AITextResult,
  ResolvedAIModel,
} from '@/lib/ai/types';

const DEFAULT_GROQ_MODEL = process.env.GROQ_DEFAULT_MODEL || 'llama-3.3-70b-versatile';
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_DEFAULT_MODEL || 'gemini-2.5-flash-lite';
const DEFAULT_OPENAI_FLASHCARDS_MODEL =
  process.env.FLASHCARDS_OPENAI_MODEL ||
  process.env.OPENAI_FLASHCARDS_MODEL ||
  'gpt-4o-mini';
const DEFAULT_OPENAI_FLASHCARDS_FALLBACK_MODEL =
  process.env.OPENAI_FLASHCARDS_FALLBACK_MODEL || 'gpt-5-mini';

function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function rolloutBucket(seed: string): number {
  const digest = createHash('sha256').update(seed).digest('hex');
  return parseInt(digest.slice(0, 8), 16) % 100;
}

function shouldRouteFlashcardsToOpenAI(runId: string): boolean {
  const provider = (process.env.FLASHCARDS_PROVIDER || 'groq').toLowerCase();
  if (provider !== 'openai') return false;

  const percent = clampPercent(parseInt(process.env.FLASHCARDS_OPENAI_PERCENT || '0', 10));
  if (percent <= 0) return false;
  if (percent >= 100) return true;

  return rolloutBucket(runId) < percent;
}

export function getDefaultModelForProvider(provider: AIProvider, objective: string): string {
  if (provider === 'openai') {
    if (objective === 'flashcards') {
      return DEFAULT_OPENAI_FLASHCARDS_MODEL;
    }
    return DEFAULT_OPENAI_FLASHCARDS_FALLBACK_MODEL;
  }

  if (provider === 'gemini') {
    return DEFAULT_GEMINI_MODEL;
  }

  return DEFAULT_GROQ_MODEL;
}

export function resolveRunProviderModel(params: {
  runId: string;
  objective: string;
  preference: AIModelPreference | string;
}): ResolvedAIModel {
  const { runId, objective, preference } = params;

  if (preference === 'groq' || preference === 'gemini' || preference === 'openai') {
    return {
      provider: preference,
      model: getDefaultModelForProvider(preference, objective),
    };
  }

  if (objective === 'flashcards') {
    const provider: AIProvider = shouldRouteFlashcardsToOpenAI(runId) ? 'openai' : 'groq';
    return { provider, model: getDefaultModelForProvider(provider, objective) };
  }

  if (objective === 'questoes_banca' || objective === 'exercicios_aplicados') {
    return {
      provider: 'gemini',
      model: getDefaultModelForProvider('gemini', objective),
    };
  }

  return {
    provider: 'groq',
    model: getDefaultModelForProvider('groq', objective),
  };
}

export async function generateAIText(request: AITextRequest): Promise<AITextResult> {
  switch (request.provider) {
    case 'groq':
      return callGroqText(request);
    case 'gemini':
      return callGeminiText(request);
    case 'openai':
      return callOpenAIText(request);
    default: {
      const exhaustiveCheck: never = request.provider;
      throw new Error(`Unsupported provider: ${exhaustiveCheck}`);
    }
  }
}

import type { AIProvider } from '@/lib/ai/types';
import type { AIErrorCode } from '@/lib/ai/retry-policy';
import type { ProviderSlotKey } from '@/lib/ai/provider-capacity';

export function canFailoverFlashcardsToOpenAI(objective: string, preference: string | null | undefined): boolean {
  return objective === 'flashcards' && (preference == null || preference === 'auto' || preference === 'groq');
}

export function canFailoverQuestionGenerationToOpenAI(objective: string, preference: string | null | undefined): boolean {
  return (
    (objective === 'questoes_banca' || objective === 'exercicios_aplicados') &&
    (preference == null || preference === 'auto' || preference === 'gemini')
  );
}

export function getFallbackSlotKey(
  objective: string,
  preference: string | null | undefined,
  currentSlotKey: ProviderSlotKey,
): ProviderSlotKey | null {
  if (canFailoverFlashcardsToOpenAI(objective, preference)) {
    return currentSlotKey === 'groq:flashcards' ? 'openai:flashcards' : null;
  }

  if (canFailoverQuestionGenerationToOpenAI(objective, preference)) {
    return currentSlotKey === 'gemini:questoes' ? 'openai:questoes' : null;
  }

  return null;
}

export function shouldFailoverGroqFlashcards(
  objective: string,
  preference: string | null | undefined,
  provider: AIProvider,
  errorCode: AIErrorCode,
): boolean {
  return (
    canFailoverFlashcardsToOpenAI(objective, preference) &&
    provider === 'groq' &&
    (errorCode === 'rate_limit' || errorCode === 'provider_unavailable' || errorCode === 'timeout')
  );
}

export function shouldFailoverProviderToOpenAI(
  objective: string,
  preference: string | null | undefined,
  provider: AIProvider,
  errorCode: AIErrorCode,
): boolean {
  const isRetryableProviderFailure =
    errorCode === 'rate_limit' || errorCode === 'provider_unavailable' || errorCode === 'timeout';

  if (!isRetryableProviderFailure) {
    return false;
  }

  return (
    (provider === 'groq' && canFailoverFlashcardsToOpenAI(objective, preference)) ||
    (provider === 'gemini' && canFailoverQuestionGenerationToOpenAI(objective, preference))
  );
}

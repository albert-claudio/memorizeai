import { classifyAIError, extractHttpStatus, type AIErrorCode } from '@/lib/ai/retry-policy';
import { recordAIFailureClassified } from '@/lib/ai/cost-guard';
import type { AIProvider } from '@/lib/ai/types';

export async function recordClassifiedProviderFailure(
  model: AIProvider,
  error: unknown,
): Promise<{ errorCode: AIErrorCode; httpStatus?: number }> {
  const httpStatus = extractHttpStatus(error);
  const errorCode = classifyAIError(error, httpStatus);
  await recordAIFailureClassified(model, errorCode);
  return { errorCode, httpStatus };
}


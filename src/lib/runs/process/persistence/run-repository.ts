import type { AIProvider } from '@/lib/ai/types';
import type { AICallResult } from '../generation/provider-call';

export interface RunUsageAccumulator {
  callCount: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  estimatedCostUsd: number;
  rawUsage: unknown[];
  hasCompleteInputTokens: boolean;
  hasCompleteOutputTokens: boolean;
  hasCompleteCachedTokens: boolean;
  hasCompleteEstimatedCost: boolean;
}

export function createRunUsageAccumulator(): RunUsageAccumulator {
  return {
    callCount: 0,
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    estimatedCostUsd: 0,
    rawUsage: [],
    hasCompleteInputTokens: true,
    hasCompleteOutputTokens: true,
    hasCompleteCachedTokens: true,
    hasCompleteEstimatedCost: true,
  };
}

export function accumulateRunUsage(accumulator: RunUsageAccumulator, result: AICallResult): void {
  accumulator.callCount += 1;
  accumulator.totalTokens += result.totalTokens ?? 0;

  if (typeof result.inputTokens === 'number') {
    accumulator.inputTokens += result.inputTokens;
  } else {
    accumulator.hasCompleteInputTokens = false;
  }

  if (typeof result.outputTokens === 'number') {
    accumulator.outputTokens += result.outputTokens;
  } else {
    accumulator.hasCompleteOutputTokens = false;
  }

  if (typeof result.cachedTokens === 'number') {
    accumulator.cachedTokens += result.cachedTokens;
  } else {
    accumulator.hasCompleteCachedTokens = false;
  }

  if (typeof result.estimatedCostUsd === 'number') {
    accumulator.estimatedCostUsd += result.estimatedCostUsd;
  } else {
    accumulator.hasCompleteEstimatedCost = false;
  }

  if (result.rawUsage != null) {
    accumulator.rawUsage.push({
      provider: result.provider,
      model: result.model,
      usage: result.rawUsage,
    });
  }
}

export function buildRunUsageUpdate(
  accumulator: RunUsageAccumulator,
  provider: AIProvider | null,
  model: string | null,
) {
  return {
    provider,
    model_used: model,
    token_count: accumulator.totalTokens,
    input_tokens:
      accumulator.callCount > 0 && accumulator.hasCompleteInputTokens
        ? accumulator.inputTokens
        : null,
    output_tokens:
      accumulator.callCount > 0 && accumulator.hasCompleteOutputTokens
        ? accumulator.outputTokens
        : null,
    cached_tokens:
      accumulator.callCount > 0 && accumulator.hasCompleteCachedTokens
        ? accumulator.cachedTokens
        : null,
    estimated_cost_usd:
      accumulator.callCount > 0 && accumulator.hasCompleteEstimatedCost
        ? Math.round(accumulator.estimatedCostUsd * 1_000_000) / 1_000_000
        : null,
    raw_usage: accumulator.rawUsage.length > 0 ? accumulator.rawUsage : null,
  };
}


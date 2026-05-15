import { describe, expect, it } from 'vitest';

import { estimateOpenAITextCostUsd } from '../cost-estimator';

describe('estimateOpenAITextCostUsd', () => {
  it('estimates gpt-4o-mini cost using cached and uncached input separately', () => {
    const cost = estimateOpenAITextCostUsd({
      model: 'gpt-4o-mini',
      inputTokens: 2000,
      outputTokens: 500,
      cachedTokens: 1000,
    });

    expect(cost).toBe(0.000525);
  });

  it('supports snapshot-style model names by prefix', () => {
    const cost = estimateOpenAITextCostUsd({
      model: 'gpt-5-mini-2025-04-01',
      inputTokens: 1000,
      outputTokens: 1000,
      cachedTokens: 0,
    });

    expect(cost).toBe(0.00225);
  });

  it('returns undefined for unknown models', () => {
    const cost = estimateOpenAITextCostUsd({
      model: 'unknown-model',
      inputTokens: 1000,
      outputTokens: 1000,
      cachedTokens: 0,
    });

    expect(cost).toBeUndefined();
  });
});

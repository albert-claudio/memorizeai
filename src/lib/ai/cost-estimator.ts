interface ModelPricing {
  input: number;
  cachedInput: number;
  output: number;
}

const OPENAI_TEXT_PRICING_PER_1M: Record<string, ModelPricing> = {
  'gpt-4o-mini': {
    input: 0.15,
    cachedInput: 0.075,
    output: 0.6,
  },
  'gpt-5-mini': {
    input: 0.25,
    cachedInput: 0.025,
    output: 2,
  },
};

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function getPricing(model: string): ModelPricing | null {
  if (OPENAI_TEXT_PRICING_PER_1M[model]) {
    return OPENAI_TEXT_PRICING_PER_1M[model];
  }

  const entry = Object.entries(OPENAI_TEXT_PRICING_PER_1M).find(([prefix]) => model.startsWith(prefix));
  return entry?.[1] ?? null;
}

export function estimateOpenAITextCostUsd(params: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
}): number | undefined {
  const pricing = getPricing(params.model);
  if (!pricing) return undefined;

  const cachedTokens = Math.max(0, params.cachedTokens ?? 0);
  const uncachedInputTokens = Math.max(0, params.inputTokens - cachedTokens);

  const cost =
    (uncachedInputTokens / 1_000_000) * pricing.input +
    (cachedTokens / 1_000_000) * pricing.cachedInput +
    (params.outputTokens / 1_000_000) * pricing.output;

  return roundUsd(cost);
}

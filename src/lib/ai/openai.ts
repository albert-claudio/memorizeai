import { estimateOpenAITextCostUsd } from '@/lib/ai/cost-estimator';
import { fetchWithTimeout } from '@/lib/ai/timeout';
import type { AITextRequest, AITextResult } from '@/lib/ai/types';

const DEFAULT_OPENAI_MAX_OUTPUT_TOKENS = parseInt(process.env.OPENAI_MAX_OUTPUT_TOKENS || '8000', 10);

function getPromptCacheRetention(model: string): string | undefined {
  const configured = process.env.OPENAI_PROMPT_CACHE_RETENTION?.trim();
  if (!configured) return undefined;

  if (configured === '24h') {
    const supportsExtended = model.startsWith('gpt-5') || model.startsWith('gpt-4.1');
    return supportsExtended ? '24h' : 'in_memory';
  }

  return configured;
}

function extractOutputText(data: Record<string, unknown>): string {
  if (typeof data.output_text === 'string') {
    return data.output_text;
  }

  const output = Array.isArray(data.output)
    ? data.output
    : Array.isArray(data.outputs)
      ? data.outputs
      : [];

  const parts: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = Array.isArray((item as { content?: unknown[] }).content)
      ? (item as { content: unknown[] }).content
      : [];

    for (const entry of content) {
      if (
        entry &&
        typeof entry === 'object' &&
        (entry as { type?: string }).type === 'output_text' &&
        typeof (entry as { text?: unknown }).text === 'string'
      ) {
        parts.push((entry as { text: string }).text);
      }
    }
  }

  return parts.join('\n').trim();
}

export async function callOpenAIText(request: AITextRequest): Promise<AITextResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const startTime = Date.now();
  const response = await fetchWithTimeout('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: request.model,
      instructions: request.system,
      input: request.user,
      max_output_tokens: request.maxOutputTokens ?? DEFAULT_OPENAI_MAX_OUTPUT_TOKENS,
      store: false,
      prompt_cache_key: request.promptCacheKey,
      prompt_cache_retention: getPromptCacheRetention(request.model),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const usage = (data.usage ?? {}) as {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
  };

  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cachedTokens = usage.input_tokens_details?.cached_tokens ?? 0;

  return {
    provider: 'openai',
    model: request.model,
    text: extractOutputText(data),
    totalTokens: usage.total_tokens ?? inputTokens + outputTokens,
    inputTokens,
    outputTokens,
    cachedTokens,
    estimatedCostUsd: estimateOpenAITextCostUsd({
      model: request.model,
      inputTokens,
      outputTokens,
      cachedTokens,
    }),
    durationMs: Date.now() - startTime,
    rawUsage: usage,
  };
}

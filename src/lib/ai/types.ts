export type AIProvider = 'groq' | 'gemini' | 'openai';
export type AIModelPreference = AIProvider | 'auto';

export interface AITextRequest {
  provider: AIProvider;
  model: string;
  system: string;
  user: string;
  promptCacheKey?: string;
  maxOutputTokens?: number;
}

export interface AITextResult {
  provider: AIProvider;
  model: string;
  text: string;
  totalTokens: number;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  estimatedCostUsd?: number;
  rawUsage?: unknown;
}

export interface ResolvedAIModel {
  provider: AIProvider;
  model: string;
}

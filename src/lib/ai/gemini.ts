import { fetchWithTimeout } from '@/lib/ai/timeout';
import type { AITextRequest, AITextResult } from '@/lib/ai/types';

const DEFAULT_GEMINI_MODEL = process.env.GEMINI_DEFAULT_MODEL || 'gemini-2.5-flash-lite';
const DEFAULT_GEMINI_MAX_OUTPUT_TOKENS = parseInt(process.env.GEMINI_MAX_OUTPUT_TOKENS || '16000', 10);

export async function callGeminiText(request: AITextRequest): Promise<AITextResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const model = request.model || DEFAULT_GEMINI_MODEL;
  const startTime = Date.now();
  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${request.system}\n\n${request.user}` }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: request.maxOutputTokens ?? DEFAULT_GEMINI_MAX_OUTPUT_TOKENS,
          responseMimeType: 'application/json',
        },
      }),
    },
    request.timeoutMs,
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const usage = data.usageMetadata;

  return {
    provider: 'gemini',
    model,
    text: data.candidates?.[0]?.content?.parts?.[0]?.text || '[]',
    totalTokens: usage?.totalTokenCount ?? 0,
    inputTokens: usage?.promptTokenCount,
    outputTokens: usage?.candidatesTokenCount,
    durationMs: Date.now() - startTime,
    rawUsage: usage ?? null,
  };
}

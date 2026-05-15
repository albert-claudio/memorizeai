import { fetchWithTimeout } from '@/lib/ai/timeout';
import type { AITextRequest, AITextResult } from '@/lib/ai/types';

const DEFAULT_GROQ_MODEL = process.env.GROQ_DEFAULT_MODEL || 'llama-3.3-70b-versatile';
const DEFAULT_GROQ_MAX_OUTPUT_TOKENS = parseInt(process.env.GROQ_MAX_OUTPUT_TOKENS || '8000', 10);

export async function callGroqText(request: AITextRequest): Promise<AITextResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');

  const startTime = Date.now();
  const model = request.model || DEFAULT_GROQ_MODEL;

  const response = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
      temperature: 0.2,
      max_tokens: request.maxOutputTokens ?? DEFAULT_GROQ_MAX_OUTPUT_TOKENS,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const usage = data.usage;

  return {
    provider: 'groq',
    model,
    text: data.choices?.[0]?.message?.content || '[]',
    totalTokens: usage?.total_tokens ?? 0,
    inputTokens: usage?.prompt_tokens,
    outputTokens: usage?.completion_tokens,
    durationMs: Date.now() - startTime,
    rawUsage: usage ?? null,
  };
}

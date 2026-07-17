import { generateAIText, getDefaultModelForProvider, resolveRunProviderModel } from '@/lib/ai/provider-router';
import type { RunObjective } from '@/lib/billing/run-entitlement';
import type { AIProvider, AITextResult } from '@/lib/ai/types';
import type { ProcessLogger } from '../contracts';

export type AICallResult = AITextResult;

async function callProvider(
  provider: AIProvider,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  promptCacheKey?: string,
  maxOutputTokens?: number,
  renewLease?: (context: string) => Promise<void>,
  leaseContext: string = 'provider-call',
  log: ProcessLogger = () => {},
  timeoutMs?: number,
): Promise<AICallResult> {
  await renewLease?.(`before:${leaseContext}`);
  log(provider.toUpperCase(), `Calling provider ${provider} (${model})...`);
  try {
    const result = await generateAIText({
      provider,
      model,
      system: systemPrompt,
      user: userPrompt,
      promptCacheKey,
      maxOutputTokens,
      timeoutMs,
    });
    log(provider.toUpperCase(), `API responded in ${result.durationMs}ms, ${result.totalTokens} tokens`);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(provider.toUpperCase(), `Provider call failed: ${message}`);
    throw error;
  } finally {
    await renewLease?.(`after:${leaseContext}`);
  }
}

async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  renewLease?: (context: string) => Promise<void>,
  leaseContext?: string,
  log: ProcessLogger = () => {},
): Promise<AICallResult> {
  return callProvider(
    'gemini',
    getDefaultModelForProvider('gemini', 'default'),
    systemPrompt,
    userPrompt,
    undefined,
    undefined,
    renewLease,
    leaseContext,
    log,
  );
}

async function callGroq(
  systemPrompt: string,
  userPrompt: string,
  renewLease?: (context: string) => Promise<void>,
  leaseContext?: string,
  log: ProcessLogger = () => {},
): Promise<AICallResult> {
  return callProvider(
    'groq',
    getDefaultModelForProvider('groq', 'default'),
    systemPrompt,
    userPrompt,
    undefined,
    undefined,
    renewLease,
    leaseContext,
    log,
  );
}

export function createProviderCaller(log: ProcessLogger) {
  return {
    callProvider: (
      provider: AIProvider,
      model: string,
      systemPrompt: string,
      userPrompt: string,
      promptCacheKey?: string,
      maxOutputTokens?: number,
      renewLease?: (context: string) => Promise<void>,
      leaseContext?: string,
      timeoutMs?: number,
    ) => callProvider(provider, model, systemPrompt, userPrompt, promptCacheKey, maxOutputTokens, renewLease, leaseContext, log, timeoutMs),
    callGemini: (systemPrompt: string, userPrompt: string, renewLease?: (context: string) => Promise<void>, leaseContext?: string) =>
      callGemini(systemPrompt, userPrompt, renewLease, leaseContext, log),
    callGroq: (systemPrompt: string, userPrompt: string, renewLease?: (context: string) => Promise<void>, leaseContext?: string) =>
      callGroq(systemPrompt, userPrompt, renewLease, leaseContext, log),
  };
}

export function selectModel(runId: string, objective: RunObjective, preference: string) {
  return resolveRunProviderModel({
    runId,
    objective,
    preference,
  });
}

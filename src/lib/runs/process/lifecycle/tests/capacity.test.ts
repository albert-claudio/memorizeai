import { describe, expect, it } from 'vitest';

import { getFallbackSlotKey, shouldFailoverProviderToOpenAI } from '../capacity';

describe('run provider fallback capacity policy', () => {
  it('keeps the existing flashcards Groq to OpenAI fallback', () => {
    expect(getFallbackSlotKey('flashcards', 'auto', 'groq:flashcards')).toBe('openai:flashcards');
    expect(shouldFailoverProviderToOpenAI('flashcards', 'auto', 'groq', 'provider_unavailable')).toBe(true);
  });

  it('allows question generation to fail over from Gemini to OpenAI on transient provider errors', () => {
    expect(getFallbackSlotKey('questoes_banca', 'auto', 'gemini:questoes')).toBe('openai:questoes');
    expect(shouldFailoverProviderToOpenAI('questoes_banca', 'auto', 'gemini', 'provider_unavailable')).toBe(true);
    expect(shouldFailoverProviderToOpenAI('questoes_banca', 'auto', 'gemini', 'invalid_json')).toBe(false);
  });

  it('does not fail over question generation from a non-primary provider slot', () => {
    expect(getFallbackSlotKey('questoes_banca', 'auto', 'openai:questoes')).toBeNull();
    expect(getFallbackSlotKey('questoes_banca', 'openai', 'openai:questoes')).toBeNull();
  });
});

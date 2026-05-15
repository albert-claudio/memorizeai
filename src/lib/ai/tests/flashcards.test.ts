import { describe, expect, it } from 'vitest';

import {
  estimateFlashcardsMaxOutputTokens,
  FLASHCARDS_OPENAI_CACHE_KEY,
  formatFlashcardContext,
  getFlashcardsPrompt,
  normalizeCompactFlashcards,
} from '../flashcards';

describe('flashcards prompt optimization', () => {
  it('formats context with compact chunk markers', () => {
    const formatted = formatFlashcardContext([
      {
        id: 'chunk-1',
        pageNumber: 3,
        content: '  Texto relevante do chunk.  ',
      },
    ]);

    expect(formatted).toBe('@id=chunk-1|p=3\nTexto relevante do chunk.');
  });

  it('uses a stable global prompt cache key and compact output contract', () => {
    const prompt = getFlashcardsPrompt(6, '@id=1\nctx');

    expect(prompt.promptCacheKey).toBe(FLASHCARDS_OPENAI_CACHE_KEY);
    expect(prompt.user).toContain('{"f":"pergunta","b":"resposta","id":"chunkId","x":"citacao curta"}');
    expect(prompt.user).toContain('COUNT=6');
  });

  it('normalizes compact output keys into the existing flashcard shape', () => {
    const normalized = normalizeCompactFlashcards([
      { f: 'Q', b: 'A', id: 'chunk-1', x: 'trecho' },
    ]) as Array<{ front: string; back: string; chunkId: string; citationExcerpt: string }>;

    expect(normalized[0]).toEqual({
      front: 'Q',
      back: 'A',
      chunkId: 'chunk-1',
      citationExcerpt: 'trecho',
    });
  });

  it('caps flashcard output tokens aggressively', () => {
    expect(estimateFlashcardsMaxOutputTokens(1)).toBeGreaterThanOrEqual(300);
    expect(estimateFlashcardsMaxOutputTokens(20)).toBeLessThanOrEqual(1600);
  });
});

import { describe, expect, it } from 'vitest';

import {
  buildFallbackSourceDigestContent,
  formatDigestForFlashcards,
  formatSourceDigestInput,
  normalizeSourceDigestContent,
  selectChunksForDigest,
} from '@/lib/source-digest';

describe('source digest helpers', () => {
  it('selects a bounded subset of chunks for digest generation', () => {
    const chunks = Array.from({ length: 30 }, (_, index) => ({
      id: `chunk-${index}`,
      position: index,
      content: `Conteudo ${index} `.repeat(120),
      pageNumber: null,
    }));

    const selected = selectChunksForDigest(chunks);

    expect(selected.length).toBeLessThanOrEqual(12);
    expect(selected.length).toBeGreaterThan(0);
  });

  it('formats compact digest input with chunk ids', () => {
    const text = formatSourceDigestInput([
      {
        id: 'chunk-1',
        content: 'Texto base',
        position: 0,
        pageNumber: 4,
      },
    ]);

    expect(text).toBe('@id=chunk-1|p=4\nTexto base');
  });

  it('normalizes digest content and discards invalid entries', () => {
    const normalized = normalizeSourceDigestContent({
      summary: '  resumo  ',
      topics: ['A', 'B'],
      flashcard_context: [
        { id: 'chunk-1', fact: 'Fato', detail: 'Detalhe', quote: 'Citação' },
        { id: '', fact: 'invalido', quote: 'x' },
      ],
      pitfalls: ['erro comum'],
    });

    expect(normalized.summary).toBe('resumo');
    expect(normalized.flashcard_context).toHaveLength(1);
    expect(normalized.pitfalls).toEqual(['erro comum']);
  });

  it('formats digest-first flashcard context within a tight compact shape', () => {
    const context = formatDigestForFlashcards(
      {
        summary: 'Resumo central',
        topics: ['Tema 1', 'Tema 2'],
        flashcard_context: [
          { id: 'chunk-1', fact: 'Fato cobravel', detail: 'Detalhe curto', quote: 'Trecho literal' },
        ],
        pitfalls: ['confusao frequente'],
      },
      'openai',
      false,
    );

    expect(context).toContain('SUM=Resumo central');
    expect(context).toContain('@id=chunk-1');
    expect(context).toContain('"Trecho literal"');
  });

  it('keeps OpenAI digest flashcard context bounded with stable chunk ids', () => {
    const digest = {
      summary: 'Resumo central '.repeat(40),
      topics: ['Tema 1', 'Tema 2'],
      flashcard_context: Array.from({ length: 20 }, (_, index) => ({
        id: `chunk-${index}`,
        fact: `Fato cobravel ${index} `.repeat(12),
        detail: `Detalhe ${index} `.repeat(12),
        quote: `Trecho literal ${index} `.repeat(12),
      })),
      pitfalls: ['confusao frequente'],
    };

    const openaiContext = formatDigestForFlashcards(digest, 'openai', false);
    const groqContext = formatDigestForFlashcards(digest, 'groq', false);

    expect(openaiContext).not.toBeNull();
    expect(groqContext).not.toBeNull();
    expect(openaiContext!.length).toBeLessThanOrEqual(groqContext!.length);
    expect(openaiContext).toContain('@id=chunk-0');
    expect(openaiContext).not.toContain('@id=chunk-19');
  });

  it('builds a deterministic fallback digest from chunks when AI digest is unavailable', () => {
    const digest = buildFallbackSourceDigestContent([
      {
        id: 'chunk-1',
        content: 'Primeiro trecho com definicao central. Ele explica o conceito principal com detalhe objetivo.',
        position: 0,
        pageNumber: 2,
      },
      {
        id: 'chunk-2',
        content: 'Segundo trecho com requisitos cumulativos e efeitos praticos relevantes para revisao.',
        position: 1,
        pageNumber: 3,
      },
    ]);

    expect(digest.flashcard_context).toHaveLength(2);
    expect(digest.flashcard_context[0]?.id).toBe('chunk-1');
    expect(digest.summary.length).toBeGreaterThan(0);
  });
});

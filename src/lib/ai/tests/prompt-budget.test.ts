import { describe, expect, it } from 'vitest';
import { selectChunksWithinTokenBudget } from '@/lib/ai/prompt-budget';

describe('selectChunksWithinTokenBudget', () => {
  it('keeps selection within budget while preserving document order', () => {
    const chunks = Array.from({ length: 20 }, (_, index) => ({
      content: `chunk-${index} ` + 'conteudo '.repeat(25),
      position: index,
    }));

    const selected = selectChunksWithinTokenBudget(chunks, 1800, 100);
    const estimatedChars = selected.reduce((sum, chunk) => sum + chunk.content.length + 100, 0);

    expect(selected.length).toBeGreaterThan(0);
    expect(selected.length).toBeLessThan(chunks.length);
    expect(estimatedChars).toBeLessThanOrEqual(1800);
    expect(selected.map(chunk => chunk.position)).toEqual(
      [...selected.map(chunk => chunk.position)].sort((a, b) => a - b)
    );
  });

  it('samples early, middle, and late chunks for large documents', () => {
    const chunks = Array.from({ length: 250 }, (_, index) => ({
      content: `pagina-${index} ` + 'norma '.repeat(35),
      position: index,
    }));

    const selected = selectChunksWithinTokenBudget(chunks, 5000, 100);
    const positions = selected.map(chunk => chunk.position);

    expect(selected.length).toBeLessThan(chunks.length);
    expect(positions.some(position => position <= 5)).toBe(true);
    expect(positions.some(position => position >= 100 && position <= 150)).toBe(true);
    expect(positions.some(position => position >= 220)).toBe(true);
  });
});

import { describe, expect, it, vi } from 'vitest';

import { getClaimRejection } from './lifecycle/claim';
import { getMaxRefillRounds, shouldAttemptRefill } from './generation/refill';
import { sanitizeAlternatives, sanitizeText } from './validation/sanitization';
import { validateGeneratedItems } from './validation/citations';

describe('run processing modules', () => {
  it('rejects terminal and delayed runs before claiming them', () => {
    expect(getClaimRejection({ status: 'concluido' }, 3)).toBe('Run already concluido');
    expect(getClaimRejection({ status: 'retry_wait', next_attempt_at: 2_000 }, 3, 1_000))
      .toBe('Run not ready yet');
    expect(getClaimRejection({ status: 'queued', next_attempt_at: 500 }, 3, 1_000)).toBeNull();
  });

  it('keeps refill policy objective-specific', () => {
    expect(getMaxRefillRounds(true)).toBe(1);
    expect(getMaxRefillRounds(false)).toBe(5);
    expect(shouldAttemptRefill({ isFlashcards: true, generatedCount: 5, targetCount: 10 })).toBe(true);
    expect(shouldAttemptRefill({ isFlashcards: true, generatedCount: 6, targetCount: 10 })).toBe(false);
  });

  it('sanitizes generated content and salvages invalid citations', () => {
    expect(sanitizeText('texto\\')).toBe('texto');
    expect(sanitizeAlternatives(['A) uma', 'B) duas'])).toEqual(['uma', 'duas', '', '', '']);

    const log = vi.fn();
    const items = validateGeneratedItems(
      [{ front: 'Pergunta', back: 'Resposta', chunkId: 'invalid', citationExcerpt: 'não corresponde ao texto de origem' }],
      new Set(['chunk-1']),
      new Map([['chunk-1', 'conteúdo de origem']]),
      log,
    ) as Array<{ chunkId: string; citationExcerpt: string }>;

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ chunkId: 'chunk-1', citationExcerpt: '' });
    expect(log).toHaveBeenCalled();
  });
});

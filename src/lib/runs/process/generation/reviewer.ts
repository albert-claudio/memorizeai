import type { GeneratedQuestion } from '../contracts';

export function buildGroundedReviewPayload(
  items: unknown[],
  chunkContent: Map<string, string>,
): string {
  return JSON.stringify(items.map((item, index) => {
    const question = item as GeneratedQuestion;
    const sources = [
      { chunkId: question.chunkId, citationExcerpt: question.citationExcerpt },
      ...(question.sources ?? []),
    ]
      .filter(source => source.chunkId && chunkContent.has(source.chunkId))
      .map(source => ({
        ...source,
        trechoCompleto: (chunkContent.get(source.chunkId) || '').slice(0, 500),
      }));
    return {
      index,
      enunciado: question.enunciado || question.assertiva,
      alternativas: question.alternativas,
      respostaCorreta: question.respostaCorreta || question.gabarito,
      fontes: sources,
    };
  }), null, 2);
}

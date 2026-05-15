export const SOURCE_DIGEST_VERSION = process.env.SOURCE_DIGEST_VERSION || 'v1';
export const SOURCE_DIGEST_PROMPT_CACHE_KEY = `source-digest:${SOURCE_DIGEST_VERSION}`;

export const SOURCE_DIGEST_PROMPT = {
  system: [
    'Voce comprime material juridico em um digest reutilizavel para flashcards.',
    'Use somente fatos presentes no contexto.',
    'Cada item precisa apontar para um chunk real via id.',
    'Prefira fatos cobraveis, definicoes, requisitos, excecoes, prazos e distincoes.',
    'Retorne somente JSON valido.',
  ].join('\n'),

  user: (targetCount: number, context: string) => [
    'Saida JSON:',
    '{"summary":"...","topics":["..."],"flashcard_context":[{"id":"chunkId","fact":"...","detail":"...","quote":"..."}],"pitfalls":["..."]}',
    'Regras:',
    '- summary <= 280 chars',
    '- topics: 4 a 8 itens',
    `- flashcard_context: ${targetCount} a ${targetCount + 4} itens`,
    '- fact <= 20 palavras',
    '- detail <= 24 palavras',
    '- quote <= 14 palavras, literal do contexto',
    '- use ids existentes em CTX',
    '- sem markdown, sem comentarios',
    `CTX\n${context}`,
  ].join('\n'),
};

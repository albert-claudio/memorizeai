import type { ChunkWithContextLike } from '@/lib/ai/flashcards.types';

export const FLASHCARDS_PROMPT_VERSION = 'v2';
export const FLASHCARDS_OPENAI_CACHE_KEY = `flashcards:${FLASHCARDS_PROMPT_VERSION}`;

const FLASHCARDS_SYSTEM = [
  'Voce gera flashcards juridicos fiéis ao contexto.',
  'Use so fatos presentes no contexto.',
  'Nao invente, nao combine chunks sem evidência.',
  'Cada card testa 1 fato util de prova.',
  'Resposta curta e precisa.',
  'Trecho citado deve ser literal e curto.',
  'Retorne somente JSON valido.',
].join('\n');

const FLASHCARDS_USER_PREFIX = [
  'Saida: array JSON.',
  'Campos por item: {"f":"pergunta","b":"resposta","id":"chunkId","x":"citacao curta"}.',
  'Regras:',
  '- use exatamente um id presente em CTX',
  '- f <= 18 palavras',
  '- b <= 28 palavras',
  '- x <= 12 palavras, literal do contexto',
  '- nao repita cards',
  '- sem markdown, sem comentarios',
].join('\n');

export function getFlashcardsPrompt(targetCount: number, context: string) {
  return {
    system: FLASHCARDS_SYSTEM,
    user: `${FLASHCARDS_USER_PREFIX}\nCOUNT=${targetCount}\nCTX\n${context}`,
    promptCacheKey: FLASHCARDS_OPENAI_CACHE_KEY,
  };
}

export function formatFlashcardContext(chunks: ChunkWithContextLike[]): string {
  return chunks
    .map(chunk => {
      const page = chunk.pageNumber != null ? `|p=${chunk.pageNumber}` : '';
      return `@id=${chunk.id}${page}\n${chunk.content.trim()}`;
    })
    .join('\n\n');
}

export function estimateFlashcardsMaxOutputTokens(targetCount: number): number {
  const perCard = 85;
  const base = 120;
  return Math.min(1600, Math.max(300, base + targetCount * perCard));
}

export interface CompactFlashcardCandidate {
  f?: string;
  b?: string;
  id?: string;
  x?: string;
  front?: string;
  back?: string;
  chunkId?: string;
  citationExcerpt?: string;
}

export function normalizeCompactFlashcards(items: unknown[]): unknown[] {
  return items.map(item => {
    if (!item || typeof item !== 'object') return item;
    const typed = item as CompactFlashcardCandidate;

    if (typed.front && typed.back && typed.chunkId) {
      return typed;
    }

    return {
      front: typed.front ?? typed.f ?? '',
      back: typed.back ?? typed.b ?? '',
      chunkId: typed.chunkId ?? typed.id ?? '',
      citationExcerpt: typed.citationExcerpt ?? typed.x ?? '',
    };
  });
}

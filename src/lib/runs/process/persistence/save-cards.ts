import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChunkWithContext, GeneratedFlashcard, GeneratedQuestion, ProcessLogger } from '../contracts';

interface SaveCardsInput {
  supabase: SupabaseClient;
  runId: string;
  userId: string;
  sourceId: string;
  sourceFilename: string;
  objective: string;
  model: string;
  deckId: string | null;
  chunks: ChunkWithContext[];
  items: unknown[];
  log: ProcessLogger;
}

export async function saveCards(input: SaveCardsInput): Promise<number> {
  const { supabase, runId, userId, sourceId, sourceFilename, objective, model, chunks, items, log } = input;
  let deckId = input.deckId;
  if (deckId) {
    const { data } = await supabase.from('decks').select('id, user_id').eq('id', deckId).single();
    if (!data || data.user_id !== userId) throw new Error('Deck ownership mismatch - access denied');
  }
  if (!deckId) {
    const now = Date.now();
    const title = objective === 'flashcards' ? 'Flashcards' : 'Lógica Jurídica';
    const { data, error } = await supabase.from('decks').insert({
      id: crypto.randomUUID(),
      user_id: userId,
      title: `${title} - ${sourceFilename}`,
      description: `Gerado automaticamente via IA (${model})`,
      created_at: now,
      updated_at: now,
    }).select().single();
    if (error || !data) throw new Error('Failed to create deck for results');
    deckId = data.id;
    await supabase.from('runs').update({ deck_id: deckId, updated_at: Date.now() }).eq('id', runId);
  }

  const metadata = new Map(chunks.map(chunk => [chunk.id, chunk.pageNumber]));
  const now = Date.now();
  const cards: Record<string, unknown>[] = [];
  const references: Record<string, unknown>[] = [];
  for (const item of items) {
    const typed = item as GeneratedFlashcard | GeneratedQuestion;
    if (!typed.chunkId) continue;
    const cardId = crypto.randomUUID();
    const flashcard = typed as GeneratedFlashcard;
    const question = typed as GeneratedQuestion;
    let front = flashcard.front || question.statement || '';
    if (objective !== 'flashcards' && question.options) front += `\n\n${question.options.join('\n')}`;
    const back = objective === 'flashcards'
      ? flashcard.back
      : `Resposta: ${question.correctAnswer || ''}\n\n${question.explanation || ''}`;
    cards.push({ id: cardId, deck_id: deckId, front, back, step: 0, source_id: sourceId, citation_text: typed.citationExcerpt, created_at: now, updated_at: now });
    references.push({ id: crypto.randomUUID(), card_id: cardId, chunk_id: typed.chunkId, source_id: sourceId, page_number: metadata.get(typed.chunkId), excerpt: typed.citationExcerpt || '', created_at: now });
  }
  if (cards.length === 0) return 0;
  const { error: cardError } = await supabase.from('cards').insert(cards);
  if (cardError) return 0;
  const { error: referenceError } = await supabase.from('card_references').insert(references);
  const savedCount = referenceError ? 0 : cards.length;
  log('Save', `Saved ${savedCount}/${items.length} cards successfully`);
  return savedCount;
}


import { createClient } from '@/lib/supabase/client';
import type { Deck } from '@/lib/types';

const normalizeStr = (str?: string | null) => {
  if (!str) return null;
  const val = str.replace(/\s+/g, ' ').trim();
  return val || null;
};

export const deckService = {
  async getDecks(userId: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('decks')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as Deck[];
  },

  async getDeckCardCounts(userId: string, deckIds: string[]) {
    if (deckIds.length === 0) return {} as Record<string, number>;

    const supabase = createClient();

    // Single query: fetch all non-deleted cards that belong to any of the decks.
    // We then count per deck_id in JS — one round-trip instead of N.
    const { data, error } = await supabase
      .from('cards')
      .select('deck_id')
      .in('deck_id', deckIds)
      .is('deleted_at', null);

    if (error) throw error;

    const counts: Record<string, number> = Object.fromEntries(deckIds.map(id => [id, 0]));
    for (const row of data ?? []) {
      counts[row.deck_id] = (counts[row.deck_id] ?? 0) + 1;
    }
    return counts;
  },

  async createDeck(userId: string, title: string, description: string, concurso?: string | null, materia?: string | null, tema?: string | null) {
    const supabase = createClient();
    const now = Date.now();
    const id = `${now}-${Math.random().toString(36).substr(2, 9)}`; // Keep original ID generation logic

    const { data, error } = await supabase
      .from('decks')
      .insert({
        id,
        user_id: userId,
        title: title.trim(),
        description: description.trim() || null,
        concurso: normalizeStr(concurso),
        materia: normalizeStr(materia),
        tema: normalizeStr(tema),
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) throw error;
    return data as Deck;
  },

  async updateDeck(deckId: string, title: string, description: string, concurso?: string | null, materia?: string | null, tema?: string | null) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('decks')
      .update({
        title: title.trim(),
        description: description.trim() || null,
        concurso: normalizeStr(concurso),
        materia: normalizeStr(materia),
        tema: normalizeStr(tema),
        updated_at: Date.now(),
      })
      .eq('id', deckId)
      .select()
      .single();

    if (error) throw error;
    return data as Deck;
  },

  async deleteDeck(deckId: string, userId: string) {
    const supabase = createClient();
    const now = Date.now();

    // Soft delete associated cards first
    const { error: cardsError } = await supabase
      .from('cards')
      .update({
        deleted_at: now,
        updated_at: now,
      })
      .eq('deck_id', deckId);

    if (cardsError) throw cardsError;

    // Soft delete deck
    const { error } = await supabase
      .from('decks')
      .update({
        deleted_at: now,
        updated_at: now,
      })
      .eq('id', deckId)
      .eq('user_id', userId);

    if (error) throw error;
    return true;
  }
};

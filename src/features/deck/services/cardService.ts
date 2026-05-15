
import { createClient } from '@/lib/supabase/client';
import type { Card } from '@/lib/types';
import { attachCardSourceReferences } from '@/lib/cards/source-references';

export const cardService = {
  async getCards(deckId: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('cards')
      .select('*')
      .eq('deck_id', deckId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return attachCardSourceReferences(supabase, data as Card[], 'deck.cards');
  },

  async createCard(deckId: string, front: string, back: string) {
    const supabase = createClient();
    const now = Date.now();
    const id = `${now}-${Math.random().toString(36).substr(2, 9)}`;

    const { data, error } = await supabase
      .from('cards')
      .insert({
        id,
        deck_id: deckId,
        front: front.trim(),
        back: back.trim(),
        step: 0,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) throw error;
    return data as Card;
  },

  async updateCard(cardId: string, front: string, back: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('cards')
      .update({
        front: front.trim(),
        back: back.trim(),
        updated_at: Date.now(),
      })
      .eq('id', cardId)
      .select()
      .single();

    if (error) throw error;
    return data as Card;
  },

  async deleteCard(cardId: string, deckId: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from('cards')
      .update({
        deleted_at: Date.now(),
        updated_at: Date.now(),
      })
      .eq('id', cardId)
      .eq('deck_id', deckId); // Security check

    if (error) throw error;
    return true;
  }
};

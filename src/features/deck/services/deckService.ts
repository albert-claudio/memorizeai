
import { createClient } from '@/lib/supabase/client';
import type { Deck } from '@/lib/types';

export const deckService = {
  async getDeck(deckId: string, userId: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('decks')
      .select('*')
      .eq('id', deckId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single();

    if (error) throw error;
    return data as Deck;
  }
};

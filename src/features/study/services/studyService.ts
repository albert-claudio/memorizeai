
import { createClient } from '@/lib/supabase/client';
import type { Card } from '@/lib/types';
import type { Grade } from '@/lib/fsrs';

export const studyService = {
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
    return data;
  },

  async getDueCards(deckId: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('cards')
      .select('*')
      .eq('deck_id', deckId)
      .is('deleted_at', null);

    if (error) throw error;
    return data as Card[];
  },

  async getUserSettings(userId: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from('user_srs_settings')
      .select('desired_retention')
      .eq('user_id', userId)
      .single();
    
    return data;
  },

  async getUserWeights(userId: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from('user_weights')
      .select('weights, is_custom')
      .eq('user_id', userId)
      .single();
    
    return data;
  },

  async updateCard(card: Card, now: number) {
    const supabase = createClient();
    const { error } = await supabase
      .from('cards')
      .update({
        difficulty: card.difficulty,
        stability: card.stability,
        ease_factor: card.ease_factor,
        lapses: card.lapses,
        is_leech: card.is_leech,
        next_review_at: card.next_review_at,
        last_review_at: card.last_review_at,
        relearning_step: card.relearning_step,
        step: card.step,
        updated_at: now,
      })
      .eq('id', card.id);

    if (error) throw error;
  },

  async logReview(review: {
    card_id: string;
    user_id: string;
    grade: Grade;
    difficulty_before: number;
    stability_before: number;
    interval_days: number;
    reviewed_at: number;
  }) {
    const supabase = createClient();
    const { error } = await supabase
      .from('card_reviews')
      .insert(review);

    if (error) {
      console.error('Error logging review:', error);
      // Don't throw here to avoid blocking the user flow
    }
  }
};


import { createClient } from '@/lib/supabase/client';
import type { Card } from '@/lib/types';
import type { Grade } from '@/lib/fsrs';
import type { Deck } from '@/lib/types';
import { attachCardSourceReferences } from '@/lib/cards/source-references';

interface ReviewQueueResponse {
  deck: Deck;
  cards: Card[];
  planner?: {
    strategy: string;
    appliedRules: string[];
    examTarget: {
      id: string;
      title: string;
      target_date: number;
      target_retention: number;
    } | null;
  };
}

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
    return attachCardSourceReferences(supabase, data as Card[], 'study.cards');
  },

  async getReviewQueue(deckId: string) {
    const response = await fetch(`/api/review/queue?deckId=${encodeURIComponent(deckId)}`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      let message = 'Falha ao carregar fila de revisão';
      try {
        const body = await response.json();
        if (body?.error) message = body.error;
      } catch {
        // Ignore JSON parsing errors and use default message.
      }
      throw new Error(message);
    }

    return await response.json() as ReviewQueueResponse;
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
  },

  async triggerFsrsCalibration() {
    const response = await fetch('/api/fsrs/calibrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      keepalive: true,
    });

    if (!response.ok) {
      let message = 'Falha ao calibrar FSRS';
      try {
        const body = await response.json();
        if (body?.error) message = body.error;
      } catch {
        // Keep the default message.
      }
      throw new Error(message);
    }

    return response.json() as Promise<
      | { status: 'skipped'; reason: string }
      | { status: 'calibrated'; reviewCount: number; improved: boolean }
    >;
  }
};

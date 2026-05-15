import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildReviewQueue } from '@/lib/review-planner/build-review-queue';
import { isSafeEntityId } from '@/lib/security/input-validation';
import { attachCardSourceReferences } from '@/lib/cards/source-references';
import type { ReviewPlannerPreferences } from '@/lib/review-planner/types';
import type { Card, Deck, ExamTarget } from '@/lib/types';

function normalizePreferences(
  data: { prioritize_weak?: boolean | null; prioritize_near_exam?: boolean | null } | null,
): ReviewPlannerPreferences {
  return {
    prioritizeWeak: Boolean(data?.prioritize_weak),
    prioritizeNearExam: Boolean(data?.prioritize_near_exam),
  };
}

async function getActiveExamTarget(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  deckId: string,
): Promise<ExamTarget | null> {
  try {
    const { data, error } = await supabase
      .from('exam_targets')
      .select('id, user_id, deck_id, title, target_date, target_retention, is_active, created_at, updated_at')
      .eq('user_id', userId)
      .eq('deck_id', deckId)
      .eq('is_active', true)
      .order('target_date', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('[review.queue] exam_targets unavailable, using default order:', error.message);
      return null;
    }

    return data as ExamTarget | null;
  } catch (error) {
    console.warn('[review.queue] failed to read exam_targets, using default order:', error);
    return null;
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const deckId = searchParams.get('deckId');

    if (!deckId) {
      return NextResponse.json({ error: 'deckId é obrigatório' }, { status: 400 });
    }

    if (!isSafeEntityId(deckId)) {
      return NextResponse.json({ error: 'deckId inválido' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { data: deck, error: deckError } = await supabase
      .from('decks')
      .select('*')
      .eq('id', deckId)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single();

    if (deckError || !deck) {
      return NextResponse.json({ error: 'Deck não encontrado' }, { status: 404 });
    }

    const now = Date.now();

    const [{ data: cards, error: cardsError }, { data: preferences }, examTarget] = await Promise.all([
      supabase
        .from('cards')
        .select('*')
        .eq('deck_id', deckId)
        .is('deleted_at', null)
        .or(`next_review_at.is.null,next_review_at.lte.${now}`),
      supabase
        .from('user_preferences')
        .select('prioritize_weak, prioritize_near_exam')
        .eq('user_id', user.id)
        .maybeSingle(),
      getActiveExamTarget(supabase, user.id, deckId),
    ]);

    if (cardsError) {
      console.error('[review.queue] failed to load cards:', cardsError);
      return NextResponse.json({ error: 'Erro ao carregar fila de revisão' }, { status: 500 });
    }

    const queue = buildReviewQueue({
      cards: (cards ?? []) as Card[],
      now,
      preferences: normalizePreferences(preferences),
      examTarget,
    });

    const cardsWithReferences = await attachCardSourceReferences(supabase, queue.cards, 'review.queue');

    return NextResponse.json({
      deck: deck as Deck,
      cards: cardsWithReferences,
      planner: {
        strategy: queue.strategy,
        appliedRules: queue.appliedRules,
        examTarget: queue.examTarget,
      },
    });
  } catch (error) {
    console.error('[review.queue] unexpected error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

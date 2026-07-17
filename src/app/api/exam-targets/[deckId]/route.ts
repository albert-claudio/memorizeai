import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSafeEntityId } from '@/lib/security/input-validation';
import { getEffectiveProAccess } from '@/lib/billing/effective-pro-access';
import type { ExamTarget } from '@/lib/types';

function isExamTargetsUnavailable(
  error: { code?: string; message?: string; details?: string } | null | undefined,
): boolean {
  if (!error) return false;
  const haystack = `${error.code ?? ''} ${error.message ?? ''} ${error.details ?? ''}`.toLowerCase();
  return haystack.includes('exam_targets') && (
    haystack.includes('does not exist') ||
    haystack.includes('schema cache') ||
    haystack.includes('could not find') ||
    haystack.includes('pgrst205')
  );
}

async function validateDeckOwnership(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  deckId: string,
  userId: string,
) {
  const { data: deck, error } = await supabase
    .from('decks')
    .select('id')
    .eq('id', deckId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .single();

  if (error || !deck) {
    return null;
  }

  return deck;
}

async function getPrioritizeNearExam(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('user_preferences')
    .select('prioritize_near_exam')
    .eq('user_id', userId)
    .maybeSingle();

  return Boolean(data?.prioritize_near_exam);
}

async function getExamTargetByDeck(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  deckId: string,
  userId: string,
) {
  return await supabase
    .from('exam_targets')
    .select('id, user_id, deck_id, title, target_date, target_retention, is_active, created_at, updated_at')
    .eq('deck_id', deckId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('target_date', { ascending: true })
    .limit(1)
    .maybeSingle();
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ deckId: string }> },
) {
  try {
    const { deckId } = await context.params;
    if (!isSafeEntityId(deckId)) {
      return NextResponse.json({ error: 'Deck inválido' }, { status: 400 });
    }
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const deck = await validateDeckOwnership(supabase, deckId, user.id);
    if (!deck) {
      return NextResponse.json({ error: 'Deck não encontrado' }, { status: 404 });
    }

    const hasProAccess = await getEffectiveProAccess(supabase, user.id);
    if (!hasProAccess) {
      return NextResponse.json({
        examTarget: null,
        prioritizeNearExam: false,
        unavailable: false,
        locked: true,
      });
    }

    const prioritizeNearExam = await getPrioritizeNearExam(supabase, user.id);
    const { data, error } = await getExamTargetByDeck(supabase, deckId, user.id);

    if (error) {
      if (isExamTargetsUnavailable(error)) {
        return NextResponse.json({
          examTarget: null,
          prioritizeNearExam,
          unavailable: true,
        });
      }

      console.error('[exam-targets] GET failed:', error);
      return NextResponse.json({ error: 'Erro ao carregar meta de prova' }, { status: 500 });
    }

    return NextResponse.json({
      examTarget: (data ?? null) as ExamTarget | null,
      prioritizeNearExam,
      unavailable: false,
    });
  } catch (error) {
    console.error('[exam-targets] GET unexpected error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ deckId: string }> },
) {
  try {
    const { deckId } = await context.params;
    if (!isSafeEntityId(deckId)) {
      return NextResponse.json({ error: 'Deck inválido' }, { status: 400 });
    }
    const body = await request.json();
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const targetDate = Number(body.target_date);
    const targetRetention = Number(body.target_retention);

    if (!title) {
      return NextResponse.json({ error: 'Título é obrigatório' }, { status: 400 });
    }

    if (!Number.isFinite(targetDate)) {
      return NextResponse.json({ error: 'Data da prova inválida' }, { status: 400 });
    }

    if (!Number.isFinite(targetRetention) || targetRetention < 0.7 || targetRetention > 0.99) {
      return NextResponse.json({ error: 'Retenção alvo inválida' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const deck = await validateDeckOwnership(supabase, deckId, user.id);
    if (!deck) {
      return NextResponse.json({ error: 'Deck não encontrado' }, { status: 404 });
    }

    const putHasProAccess = await getEffectiveProAccess(supabase, user.id);
    if (!putHasProAccess) {
      return NextResponse.json(
        {
          error: 'Meta de prova é exclusiva para planos Pro e Premium.',
          code: 'PRO_REQUIRED',
          upgradeUrl: '/upgrade',
        },
        { status: 403 },
      );
    }

    const { data: existing, error: existingError } = await getExamTargetByDeck(supabase, deckId, user.id);
    if (existingError) {
      if (isExamTargetsUnavailable(existingError)) {
        return NextResponse.json({ error: 'Migration de exam_targets ainda não foi aplicada' }, { status: 503 });
      }

      console.error('[exam-targets] PUT existing lookup failed:', existingError);
      return NextResponse.json({ error: 'Erro ao salvar meta de prova' }, { status: 500 });
    }

    const payload = {
      user_id: user.id,
      deck_id: deckId,
      title,
      target_date: targetDate,
      target_retention: targetRetention,
      is_active: true,
      updated_at: Date.now(),
    };

    let saveResult;
    if (existing?.id) {
      saveResult = await supabase
        .from('exam_targets')
        .update(payload)
        .eq('id', existing.id)
        .eq('user_id', user.id)
        .select('id, user_id, deck_id, title, target_date, target_retention, is_active, created_at, updated_at')
        .single();
    } else {
      saveResult = await supabase
        .from('exam_targets')
        .insert(payload)
        .select('id, user_id, deck_id, title, target_date, target_retention, is_active, created_at, updated_at')
        .single();
    }

    if (saveResult.error) {
      console.error('[exam-targets] PUT save failed:', saveResult.error);
      return NextResponse.json({ error: 'Erro ao salvar meta de prova' }, { status: 500 });
    }

    return NextResponse.json({
      examTarget: saveResult.data as ExamTarget,
      prioritizeNearExam: await getPrioritizeNearExam(supabase, user.id),
      unavailable: false,
    });
  } catch (error) {
    console.error('[exam-targets] PUT unexpected error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ deckId: string }> },
) {
  try {
    const { deckId } = await context.params;
    if (!isSafeEntityId(deckId)) {
      return NextResponse.json({ error: 'Deck inválido' }, { status: 400 });
    }
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const deck = await validateDeckOwnership(supabase, deckId, user.id);
    if (!deck) {
      return NextResponse.json({ error: 'Deck não encontrado' }, { status: 404 });
    }

    const deleteHasProAccess = await getEffectiveProAccess(supabase, user.id);
    if (!deleteHasProAccess) {
      return NextResponse.json(
        {
          error: 'Meta de prova é exclusiva para planos Pro e Premium.',
          code: 'PRO_REQUIRED',
          upgradeUrl: '/upgrade',
        },
        { status: 403 },
      );
    }

    const { data: existing, error: existingError } = await getExamTargetByDeck(supabase, deckId, user.id);
    if (existingError) {
      if (isExamTargetsUnavailable(existingError)) {
        return NextResponse.json({ error: 'Migration de exam_targets ainda não foi aplicada' }, { status: 503 });
      }

      console.error('[exam-targets] DELETE lookup failed:', existingError);
      return NextResponse.json({ error: 'Erro ao remover meta de prova' }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json({
        examTarget: null,
        prioritizeNearExam: await getPrioritizeNearExam(supabase, user.id),
        unavailable: false,
      });
    }

    const { error: deleteError } = await supabase
      .from('exam_targets')
      .delete()
      .eq('id', existing.id)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('[exam-targets] DELETE failed:', deleteError);
      return NextResponse.json({ error: 'Erro ao remover meta de prova' }, { status: 500 });
    }

    return NextResponse.json({
      examTarget: null,
      prioritizeNearExam: await getPrioritizeNearExam(supabase, user.id),
      unavailable: false,
    });
  } catch (error) {
    console.error('[exam-targets] DELETE unexpected error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

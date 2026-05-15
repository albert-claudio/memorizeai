'use server';

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { RunObjective, ModelPreference, Banca, Dificuldade } from '@/lib/types';
import { getEffectiveProAccess } from '@/lib/billing/effective-pro-access';
import { trackServer } from '@/lib/analytics/server-tracker';
import { getStudyGoalProfile } from '@/lib/study-goal-profiles';
import { getStudyGoalByUserId } from '@/lib/study-goal/get-study-goal';
import { isSafeEntityId } from '@/lib/security/input-validation';
import {
  checkRunEntitlement,
  getMonthlyRunCounts,
  buildMonthlyUsage,
  type MonthlyUsage,
} from '@/lib/billing/run-entitlement';
import { triggerRunDispatch } from '@/lib/queue/trigger-run-dispatch';

// Generate cryptographically secure random ID
function generateId() {
  return crypto.randomUUID();
}

/**
 * Create a Supabase client for server-side operations
 */
async function createSupabaseServer() {
  const cookieStore = await cookies();
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}

export interface CreateRunResult {
  success: boolean;
  runId?: string;
  error?: string;
}

/**
 * Get user's monthly generation usage for UI display.
 */
export async function getMonthlyUsage(): Promise<MonthlyUsage | null> {
  const supabase = await createSupabaseServer();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const isPro = await getEffectiveProAccess(adminSupabase, user.id);
  const counts = await getMonthlyRunCounts(adminSupabase, user.id);

  return buildMonthlyUsage(isPro, counts);
}

/**
 * Create a new AI generation run
 * 
 * @param sourceId - The source (PDF) to generate content from
 * @param objective - Type of content to generate: flashcards, questoes_banca, or exercicios_aplicados
 * @param modelPreference - Which AI model to prefer: groq, gemini, or auto
 * @param targetCount - How many items to generate (default 10)
 * @param deckId - Optional existing deck to add cards to
 */
export async function createRun(
  sourceId: string,
  objective: RunObjective,
  modelPreference: ModelPreference = 'auto',
  targetCount: number = 10,
  deckId?: string,
  banca?: Banca | null,
  dificuldade?: Dificuldade | null,
): Promise<CreateRunResult> {
  try {
    const supabase = await createSupabaseServer();
    
    // 1. Validate user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Usuário não autenticado' };
    }

    if (!isSafeEntityId(sourceId)) {
      return { success: false, error: 'Formato de sourceId inválido' };
    }

    if (deckId != null && !isSafeEntityId(deckId)) {
      return { success: false, error: 'Formato de deckId inválido' };
    }
    
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const isPro = await getEffectiveProAccess(adminSupabase, user.id);

    const studyGoal = await getStudyGoalByUserId(adminSupabase, user.id);
    const studyProfile = getStudyGoalProfile(studyGoal);
    if (!studyProfile.allowedObjectives.includes(objective)) {
      return {
        success: false,
        error: `Objetivo "${objective}" não permitido para o perfil ${studyProfile.label}`,
      };
    }

    const entitlement = await checkRunEntitlement(
      adminSupabase, user.id, isPro, objective, targetCount,
    );

    if (!entitlement.allowed) {
      return { success: false, error: entitlement.reason };
    }
    
    // 3. Validate source exists and belongs to user
    const { data: source, error: sourceError } = await supabase
      .from('sources')
      .select('id, status')
      .eq('id', sourceId)
      .eq('user_id', user.id)
      .single();
    
    if (sourceError || !source) {
      return { success: false, error: 'Fonte não encontrada' };
    }
    
    if (source.status !== 'concluido') {
      return { success: false, error: 'Fonte ainda não foi processada' };
    }
    
    // ================================================================
    // DECK OWNERSHIP VALIDATION (IDOR Prevention)
    // ================================================================
    let validatedDeckId: string | null = null;
    if (deckId) {
      const { data: deck, error: deckError } = await supabase
        .from('decks')
        .select('id')
        .eq('id', deckId)
        .eq('user_id', user.id)
        .single();

      if (deckError || !deck) {
        return { success: false, error: 'Deck não encontrado ou acesso negado' };
      }
      validatedDeckId = deck.id;
    }
    
    // 4. Create the run — enqueue instead of fire-and-forget
    const now = Date.now();
    const runId = generateId();
    
    // targetCount already validated by entitlement check
    const validatedTargetCount = entitlement.validatedTargetCount;
    
    // Backend-enforced: only questoes_banca gets banca/dificuldade
    const VALID_BANCAS: Banca[] = ['FCC', 'FGV', 'CESPE'];
    const VALID_DIFICULDADES: Dificuldade[] = ['facil', 'medio', 'dificil', 'muito_dificil'];

    const safeBanca = objective === 'questoes_banca' && banca && VALID_BANCAS.includes(banca)
      ? banca
      : null;
    const safeDificuldade = objective === 'questoes_banca' && dificuldade && VALID_DIFICULDADES.includes(dificuldade)
      ? dificuldade
      : null;

    // Build insert payload — only include banca/dificuldade when non-null
    // so the insert works even before the migration is applied
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runPayload: Record<string, any> = {
      id: runId,
      user_id: user.id,
      source_id: sourceId,
      deck_id: validatedDeckId,
      objective,
      model_preference: modelPreference,
      target_count: validatedTargetCount,
      status: 'queued',
      attempt_count: 0,
      provider_attempt_count: 0,
      items_generated: 0,
      next_attempt_at: now,
      created_at: now,
      updated_at: now,
    };
    if (safeBanca) runPayload.banca = safeBanca;
    if (safeDificuldade) runPayload.dificuldade = safeDificuldade;

    const { error: insertError } = await supabase
      .from('runs')
      .insert(runPayload);
    
    if (insertError) {
      console.error('[createRun] Insert error:', insertError);
      return { success: false, error: 'Erro ao criar run' };
    }
    
    // 5. Track and opportunistic dispatch
    trackServer('run_created', user.id, { runId, objective });
    console.log(`[createRun] Run ${runId} enqueued (status=queued)`);
    triggerRunDispatch(runId);
    
    return { success: true, runId };
    
  } catch (error) {
    console.error('[createRun] Error:', error);
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    return { success: false, error: message };
  }
}

/**
 * Get all runs for the current user
 */
export async function getUserRuns(limit: number = 20) {
  const supabase = await createSupabaseServer();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  
  const { data: runs, error } = await supabase
    .from('runs')
    .select(`
      *,
      source:sources(id, filename),
      deck:decks(id, title)
    `)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (error) {
    console.error('[getUserRuns] Error:', error);
    return [];
  }
  
  return runs || [];
}

/**
 * Get a specific run by ID
 */
export async function getRun(runId: string) {
  const supabase = await createSupabaseServer();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  
  const { data: run, error } = await supabase
    .from('runs')
    .select(`
      *,
      source:sources(id, filename),
      deck:decks(id, title)
    `)
    .eq('id', runId)
    .eq('user_id', user.id)
    .single();
  
  if (error) {
    console.error('[getRun] Error:', error);
    return null;
  }
  
  return run;
}

/**
 * Cancel a pending run
 */
export async function cancelRun(runId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createSupabaseServer();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Usuário não autenticado' };
  }
  
  const { error } = await supabase
    .from('runs')
    .update({
      status: 'erro',
      error_message: 'Cancelado pelo usuário',
      updated_at: Date.now(),
    })
    .eq('id', runId)
    .eq('user_id', user.id)
    .in('status', ['pendente', 'queued', 'retry_wait']); // Can only cancel queued retryable runs
  
  if (error) {
    return { success: false, error: 'Não foi possível cancelar a run' };
  }
  
  return { success: true };
}

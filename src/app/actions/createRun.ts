'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { RunObjective, ModelPreference } from '@/lib/types';
import { hasProAccess } from '@/lib/billing/pro-access';

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

export interface UserCreditsInfo {
  planRunsRemaining: number;
  extraCredits: number;
  totalCredits: number;
}

/**
 * Get user's current credit balance
 */
export async function getUserCredits(): Promise<UserCreditsInfo | null> {
  const supabase = await createSupabaseServer();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  
  const { data: credits } = await supabase
    .from('user_credits')
    .select('plan_runs_remaining, extra_credits')
    .eq('user_id', user.id)
    .single();
  
  if (!credits) {
    // New user, default credits
    return {
      planRunsRemaining: 10,
      extraCredits: 0,
      totalCredits: 10,
    };
  }
  
  return {
    planRunsRemaining: credits.plan_runs_remaining,
    extraCredits: credits.extra_credits,
    totalCredits: credits.plan_runs_remaining + credits.extra_credits,
  };
}

/**
 * Create a new AI generation run
 * 
 * @param sourceId - The source (PDF) to generate content from
 * @param objective - Type of content to generate: flashcards, questoes_banca, or logica_juridica
 * @param modelPreference - Which AI model to prefer: groq, gemini, or auto
 * @param targetCount - How many items to generate (default 10)
 * @param deckId - Optional existing deck to add cards to
 */
export async function createRun(
  sourceId: string,
  objective: RunObjective,
  modelPreference: ModelPreference = 'auto',
  targetCount: number = 10,
  deckId?: string
): Promise<CreateRunResult> {
  try {
    const supabase = await createSupabaseServer();
    
    // 1. Validate user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Usuário não autenticado' };
    }
    
    // 2. Check Pro status for non-flashcard objectives
    // Free users CAN generate flashcards from uploaded sources
    // but simulados and other advanced objectives require Pro
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_pro, subscription_status, subscription_period_end')
      .eq('id', user.id)
      .single();

    const isPro = hasProAccess(profile);
    
    if (!isPro && objective !== 'flashcards') {
      return { 
        success: false, 
        error: 'Este tipo de geração é exclusivo para usuários Pro. Faça upgrade para usar este recurso.' 
      };
    }

    if (!isPro && targetCount > 10) {
      return {
        success: false,
        error: 'Usuários gratuitos estão limitados a 10 itens por geração. Faça upgrade para gerar mais.'
      };
    }
    
    // 3. Check credits (only for simulados, flashcards are FREE for Pro)
    const requiresCredits = objective !== 'flashcards';
    
    if (requiresCredits) {
      const credits = await getUserCredits();
      if (!credits || credits.totalCredits <= 0) {
        return { success: false, error: 'Sem créditos disponíveis' };
      }
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
    
    // 4. Create the run
    const now = Date.now();
    const runId = generateId();
    
    // SECURITY: Server-side targetCount enforcement to prevent abuse
    const MAX_TARGET_COUNT = 50;
    const validatedTargetCount = Math.min(Math.max(1, targetCount), MAX_TARGET_COUNT);
    
    const { error: insertError } = await supabase
      .from('runs')
      .insert({
        id: runId,
        user_id: user.id,
        source_id: sourceId,
        deck_id: validatedDeckId,
        objective,
        model_preference: modelPreference,
        target_count: validatedTargetCount,
        status: 'pendente',
        attempt_count: 0,
        items_generated: 0,
        created_at: now,
        updated_at: now,
      });
    
    if (insertError) {
      console.error('[createRun] Insert error:', insertError);
      return { success: false, error: 'Erro ao criar run' };
    }
    
    // 5. Trigger the local API processor (fire and forget)
    // Using local API instead of Edge Function for better debugging
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    console.log(`[createRun] Triggering local processor for run ${runId}`);
    
    fetch(`${baseUrl}/api/runs/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      },
      body: JSON.stringify({ runId }),
    }).catch(err => {
      console.error('[createRun] Failed to trigger local processor:', err);
    });
    
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
    .eq('status', 'pendente'); // Can only cancel pending runs
  
  if (error) {
    return { success: false, error: 'Não foi possível cancelar a run' };
  }
  
  return { success: true };
}

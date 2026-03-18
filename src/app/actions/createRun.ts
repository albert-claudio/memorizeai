'use server';

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { RunObjective, ModelPreference, Banca, Dificuldade } from '@/lib/types';
import { hasProAccess } from '@/lib/billing/pro-access';
import { trackServer } from '@/lib/analytics/server-tracker';
import {
  checkRunEntitlement,
  getMonthlyRunCounts,
  buildMonthlyUsage,
  type MonthlyUsage,
} from '@/lib/billing/run-entitlement';

// Generate cryptographically secure random ID
function generateId() {
  return crypto.randomUUID();
}

function getRunProcessInternalSecret(): string | null {
  return process.env.RUNS_PROCESS_INTERNAL_SECRET?.trim() || null;
}

const MAX_TRIGGER_ATTEMPTS = 3;
const INITIAL_BACKOFF_MS = 200;

/**
 * Fire-and-forget trigger with exponential backoff.
 * If all attempts fail, the run stays 'pendente' and the recovery cron picks it up.
 */
function triggerProcessWithRetry(
  baseUrl: string,
  runId: string,
  secret: string
): void {
  const attempt = async (n: number) => {
    try {
      const res = await fetch(`${baseUrl}/api/runs/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': secret,
        },
        body: JSON.stringify({ runId }),
      });
      if (!res.ok && n < MAX_TRIGGER_ATTEMPTS) {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      if (n < MAX_TRIGGER_ATTEMPTS) {
        const delay = INITIAL_BACKOFF_MS * Math.pow(2, n - 1);
        await new Promise(r => setTimeout(r, delay));
        return attempt(n + 1);
      }
      console.error(`[createRun] All ${MAX_TRIGGER_ATTEMPTS} trigger attempts failed for run ${runId}:`, err);
    }
  };
  attempt(1).catch(() => {});
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_pro, subscription_status, subscription_period_end, admin_override_pro')
    .eq('id', user.id)
    .single();

  const isPro = hasProAccess(profile);

  // Use service role to count runs (RLS would filter by user anyway, but
  // server actions run with the user's session so this is fine)
  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const counts = await getMonthlyRunCounts(adminSupabase, user.id);

  return buildMonthlyUsage(isPro, counts);
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
  deckId?: string,
  banca?: Banca | null,
  dificuldade?: Dificuldade | null,
): Promise<CreateRunResult> {
  try {
    const runProcessSecret = getRunProcessInternalSecret();
    if (!runProcessSecret) {
      return {
        success: false,
        error: 'Configuraçao interna ausente para processamento de runs.',
      };
    }

    const supabase = await createSupabaseServer();
    
    // 1. Validate user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Usuário não autenticado' };
    }
    
    // 2. Entitlement check (tier + monthly limits)
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_pro, subscription_status, subscription_period_end, admin_override_pro')
      .eq('id', user.id)
      .single();

    const isPro = hasProAccess(profile);

    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
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
    
    // 4. Create the run
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
      status: 'pendente',
      attempt_count: 0,
      items_generated: 0,
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
    
    // 5. Trigger the local API processor (fire-and-forget with retry)
    const { getBaseUrl } = await import('@/lib/url');
    const baseUrl = getBaseUrl();
    console.log(`[createRun] Triggering processor for run ${runId} (up to ${MAX_TRIGGER_ATTEMPTS} attempts)`);
    triggerProcessWithRetry(baseUrl, runId, runProcessSecret);
    trackServer('run_created', user.id, { runId, objective });
    
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

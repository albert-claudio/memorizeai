import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// MONTHLY GENERATION LIMITS
// ============================================================================

export type RunObjective = 'flashcards' | 'questoes_banca' | 'exercicios_aplicados';

/** Objectives that count towards the simulado/advanced quota */
const ADVANCED_OBJECTIVES = new Set<RunObjective>(['questoes_banca', 'exercicios_aplicados']);

export const RUN_LIMITS = {
  free: {
    monthlyFlashcards: 3,
    monthlySimulados: 0,      // Not allowed
    maxTargetCount: 10,
  },
  pro: {
    monthlyFlashcards: Infinity,
    monthlySimulados: 10,
    maxTargetCount: 50,
  },
} as const;

// ============================================================================
// TYPES
// ============================================================================

export interface MonthlyRunCounts {
  flashcards: number;
  simulados: number;   // questoes_banca + exercicios_aplicados
}

export interface RunAuthResult {
  allowed: boolean;
  reason?: string;
  validatedTargetCount: number;
}

export interface MonthlyUsage {
  flashcardsUsed: number;
  flashcardsLimit: number;          // Infinity serialized as 999999
  simuladosUsed: number;
  simuladosLimit: number;
  isPro: boolean;
}

// ============================================================================
// PURE AUTHORIZATION (no I/O)
// ============================================================================

/**
 * Pure function: decides whether a run is allowed given current monthly counts.
 * No database calls — all inputs are pre-fetched.
 */
export function authorizeRunCreation(
  isPro: boolean,
  objective: RunObjective,
  targetCount: number,
  monthlyCounts: MonthlyRunCounts,
): RunAuthResult {
  const tier = isPro ? 'pro' : 'free';
  const limits = RUN_LIMITS[tier];

  // 1. Sanitize targetCount
  const validatedTargetCount = Math.min(Math.max(1, targetCount), limits.maxTargetCount);

  // Desativado temporariamente: geração ilimitada
  return { allowed: true, validatedTargetCount };

  /*
  // 2. Check objective permission + monthly quota
  if (ADVANCED_OBJECTIVES.has(objective)) {
    // Advanced objectives (simulados, lógica jurídica)
    if (!isPro) {
      return {
        allowed: false,
        reason: 'Simulados e questões de banca são exclusivos para usuários Pro. Faça upgrade para usar.',
        validatedTargetCount,
      };
    }

    if (monthlyCounts.simulados >= limits.monthlySimulados) {
      return {
        allowed: false,
        reason: `Limite mensal de ${limits.monthlySimulados} gerações de simulados atingido. O limite será renovado no próximo mês.`,
        validatedTargetCount,
      };
    }
  } else {
    // Flashcards
    if (monthlyCounts.flashcards >= limits.monthlyFlashcards) {
      const msg = isPro
        ? 'Erro inesperado de limite.'  // Should never happen (Infinity)
        : `Limite mensal de ${limits.monthlyFlashcards} gerações de flashcards atingido. Faça upgrade para Pro para gerações ilimitadas.`;
      return {
        allowed: false,
        reason: msg,
        validatedTargetCount,
      };
    }
  }
  */

  // return { allowed: true, validatedTargetCount };
}

// ============================================================================
// SERVER-SIDE HELPERS
// ============================================================================

/**
 * Get the start of the current month as epoch ms (UTC)
 */
function getMonthStartMs(): number {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getTime();
}

/**
 * Count completed/in-progress runs for the current month.
 * Only counts runs that were actually processed (status != 'erro' with 0 items).
 */
export async function getMonthlyRunCounts(
  supabase: SupabaseClient,
  userId: string,
): Promise<MonthlyRunCounts> {
  const monthStart = getMonthStartMs();

  // Count flashcard runs this month
  const { count: flashcardCount } = await supabase
    .from('runs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('objective', 'flashcards')
    .is('deleted_at', null)
    .gte('created_at', monthStart)
    .in('status', ['pendente', 'processando', 'concluido']);

  // Count advanced runs this month (questoes_banca + exercicios_aplicados)
  const { count: simuladoCount } = await supabase
    .from('runs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('deleted_at', null)
    .gte('created_at', monthStart)
    .in('status', ['pendente', 'processando', 'concluido'])
    .in('objective', ['questoes_banca', 'exercicios_aplicados']);

  return {
    flashcards: flashcardCount ?? 0,
    simulados: simuladoCount ?? 0,
  };
}

/**
 * Full server-side entitlement check: fetches counts + authorizes.
 * Use in createRun, /api/runs, and as defense-in-depth in process route.
 */
export async function checkRunEntitlement(
  supabase: SupabaseClient,
  userId: string,
  isPro: boolean,
  objective: RunObjective,
  targetCount: number,
): Promise<RunAuthResult & { usage: MonthlyRunCounts }> {
  const monthlyCounts = await getMonthlyRunCounts(supabase, userId);
  const result = authorizeRunCreation(isPro, objective, targetCount, monthlyCounts);

  return { ...result, usage: monthlyCounts };
}

/**
 * Get monthly usage info for UI display.
 */
export function buildMonthlyUsage(
  isPro: boolean,
  counts: MonthlyRunCounts,
): MonthlyUsage {
  const tier = isPro ? 'pro' : 'free';
  const limits = RUN_LIMITS[tier];

  return {
    flashcardsUsed: counts.flashcards,
    flashcardsLimit: limits.monthlyFlashcards === Infinity ? 999999 : limits.monthlyFlashcards,
    simuladosUsed: counts.simulados,
    simuladosLimit: limits.monthlySimulados,
    isPro,
  };
}

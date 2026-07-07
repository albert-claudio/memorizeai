import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// PUBLIC LAUNCH RUN LIMITS
// ============================================================================

export type RunObjective = 'flashcards' | 'questoes_banca' | 'exercicios_aplicados';

export const RUN_TARGET_LIMITS = {
  free: {
    maxTargetCount: 10,
  },
  pro: {
    maxTargetCount: 50,
  },
} as const;

export const MONTHLY_RUN_LIMITS = {
  free: {
    flashcards: parsePositiveInt(process.env.FREE_FLASHCARD_RUNS_PER_MONTH, 5),
    simulados: parsePositiveInt(process.env.FREE_SIMULADO_RUNS_PER_MONTH, 0),
  },
  pro: {
    flashcards: parsePositiveInt(process.env.PRO_FLASHCARD_RUNS_PER_MONTH, 999999),
    simulados: parsePositiveInt(process.env.PRO_SIMULADO_RUNS_PER_MONTH, 999999),
  },
} as const;

// ============================================================================
// TYPES
// ============================================================================

export interface MonthlyRunCounts {
  flashcards: number;
  simulados: number; // questoes_banca + exercicios_aplicados
}

export interface RunAuthResult {
  allowed: boolean;
  reason?: string;
  validatedTargetCount: number;
}

export interface MonthlyUsage {
  flashcardsUsed: number;
  flashcardsLimit: number;
  simuladosUsed: number;
  simuladosLimit: number;
  isPro: boolean;
}

const COUNTED_RUN_STATUSES = ['pendente', 'queued', 'retry_wait', 'processando', 'concluido'] as const;
const UNLIMITED_USAGE_SENTINEL = 999999;

// ============================================================================
// PURE AUTHORIZATION (no I/O)
// ============================================================================

/**
 * Validates per-run target size. Monthly quotas are enforced in checkRunEntitlement().
 */
export function authorizeRunCreation(
  isPro: boolean,
  targetCount: number,
): RunAuthResult {
  const tier = isPro ? 'pro' : 'free';
  const limits = RUN_TARGET_LIMITS[tier];
  const numericTargetCount = Number(targetCount);
  const requestedTargetCount = Number.isFinite(numericTargetCount)
    ? Math.floor(numericTargetCount)
    : 1;
  const validatedTargetCount = Math.min(Math.max(1, requestedTargetCount), limits.maxTargetCount);

  return { allowed: true, validatedTargetCount };
}

// ============================================================================
// SERVER-SIDE HELPERS
// ============================================================================

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function getMonthStartMs(): number {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getTime();
}

/**
 * Counts run usage for the current UTC calendar month.
 */
export async function getMonthlyRunCounts(
  supabase: SupabaseClient,
  userId: string,
): Promise<MonthlyRunCounts> {
  const monthStart = getMonthStartMs();

  const { count: flashcardCount } = await supabase
    .from('runs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('objective', 'flashcards')
    .is('deleted_at', null)
    .gte('created_at', monthStart)
    .in('status', [...COUNTED_RUN_STATUSES]);

  const { count: simuladoCount } = await supabase
    .from('runs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('deleted_at', null)
    .gte('created_at', monthStart)
    .in('status', [...COUNTED_RUN_STATUSES])
    .in('objective', ['questoes_banca', 'exercicios_aplicados']);

  return {
    flashcards: flashcardCount ?? 0,
    simulados: simuladoCount ?? 0,
  };
}

/**
 * Server-side entitlement check for public launch.
 * Enforces monthly run quotas and blocks free users from simulado objectives.
 */
export interface CheckRunEntitlementOptions {
  /**
   * When true, allows processing the Nth run already counted in monthly usage
   * (used > limit blocks bypass inserts beyond the quota).
   */
  atProcessTime?: boolean;
}

export async function checkRunEntitlement(
  supabase: SupabaseClient,
  userId: string,
  isPro: boolean,
  objective: RunObjective,
  targetCount: number,
  options?: CheckRunEntitlementOptions,
): Promise<RunAuthResult & { usage: MonthlyRunCounts }> {
  const result = authorizeRunCreation(isPro, targetCount);
  const usage = await getMonthlyRunCounts(supabase, userId);
  const tier = isPro ? 'pro' : 'free';
  const limits = MONTHLY_RUN_LIMITS[tier];
  const isSimulado = objective === 'questoes_banca' || objective === 'exercicios_aplicados';
  const used = isSimulado ? usage.simulados : usage.flashcards;
  const limit = isSimulado ? limits.simulados : limits.flashcards;
  const overLimit = options?.atProcessTime ? used > limit : used >= limit;

  if (overLimit) {
    const label = isSimulado ? 'simulados' : 'geracoes de flashcards';
    const upgradeHint = isPro ? '' : ' Faca upgrade para Pro para continuar.';
    return {
      allowed: false,
      reason: limit === 0
        ? `${label} nao estao disponiveis no plano gratuito.${upgradeHint}`
        : `Limite mensal de ${limit} ${label} atingido.${upgradeHint}`,
      validatedTargetCount: result.validatedTargetCount,
      usage,
    };
  }

  return { ...result, usage };
}

/**
 * Monthly usage info for UI display.
 */
export function buildMonthlyUsage(
  isPro: boolean,
  counts: MonthlyRunCounts,
): MonthlyUsage {
  const limits = isPro ? MONTHLY_RUN_LIMITS.pro : MONTHLY_RUN_LIMITS.free;

  return {
    flashcardsUsed: counts.flashcards,
    flashcardsLimit: limits.flashcards >= UNLIMITED_USAGE_SENTINEL ? UNLIMITED_USAGE_SENTINEL : limits.flashcards,
    simuladosUsed: counts.simulados,
    simuladosLimit: limits.simulados >= UNLIMITED_USAGE_SENTINEL ? UNLIMITED_USAGE_SENTINEL : limits.simulados,
    isPro,
  };
}

import { createClient } from '@/lib/supabase/server';
import { getEffectiveProAccess } from '@/lib/billing/effective-pro-access';
import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TIER LIMITS CONFIGURATION
// ============================================================================

export const TIER_LIMITS = {
  free: {
    maxDecks: 3,
    maxCardsPerDeck: 50,
    hasFlashcardGeneration: true,
    hasSimulados: false,
    hasUploads: true,       // Free pode fazer upload (limitado por semana)
    maxWeeklyUploads: 3,    // 3 uploads por semana
    hasFSRS: false,
    hasCardReview: false,   // Revisão detalhada de erros só para Pro
  },
  pro: {
    maxDecks: Infinity,
    maxCardsPerDeck: 10000,
    hasFlashcardGeneration: true,
    hasSimulados: true,
    hasUploads: true,
    maxWeeklyUploads: Infinity,
    hasFSRS: true,
    hasCardReview: true,
  },
} as const;

export type UserTier = 'free' | 'pro';

export interface TierLimits {
  tier: UserTier;
  maxDecks: number;
  maxCardsPerDeck: number;
  hasFlashcardGeneration: boolean;
  hasSimulados: boolean;
  hasUploads: boolean;
  maxWeeklyUploads: number;
  hasFSRS: boolean;
  hasCardReview: boolean;
  currentDeckCount: number;
  weeklyUploadsUsed: number;
  weeklyUploadsMax: number;
  isPro: boolean;
}

export interface DeckCreationAuthorization {
  allowed: boolean;
  reason?: string;
  currentCount: number;
  maxCount: number;
}

export interface CardCreationAuthorization {
  allowed: boolean;
  reason?: string;
  currentCount: number;
  maxCount: number;
}

// ============================================================================
// GET USER TIER AND LIMITS
// ============================================================================

/**
 * Get the current user's tier and all limits
 */
/**
 * Get the start of the current ISO week (Monday 00:00 UTC) as epoch ms
 */
function getWeekStartMs(): number {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.getTime();
}

/**
 * Count how many sources (uploads) the user created this week
 */
export async function getWeeklyUploadCount(userId: string): Promise<number> {
  const supabase = await createClient();
  const weekStart = getWeekStartMs();

  const { count } = await supabase
    .from('sources')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', weekStart);
    // .is('deleted_at', null); // REMOVED: Count deleted uploads too to prevent abuse

  return count || 0;
}

export async function getUserTierLimits(userId: string): Promise<TierLimits> {
  const supabase = await createClient();

  const isPro = await getEffectiveProAccess(supabase, userId);

  const tier: UserTier = isPro ? 'pro' : 'free';
  const limits = TIER_LIMITS[tier];

  // Get current deck count
  const { count: deckCount } = await supabase
    .from('decks')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('deleted_at', null);

  // Get weekly upload count
  const weeklyUploadsUsed = await getWeeklyUploadCount(userId);

  return {
    tier,
    ...limits,
    maxWeeklyUploads: limits.maxWeeklyUploads === Infinity ? 999999 : limits.maxWeeklyUploads,
    currentDeckCount: deckCount || 0,
    weeklyUploadsUsed,
    weeklyUploadsMax: limits.maxWeeklyUploads === Infinity ? 999999 : limits.maxWeeklyUploads,
    isPro: isPro || false,
  };
}

// ============================================================================
// PERMISSION CHECKS
// ============================================================================

/**
 * Check if user can create a new deck
 * Free users: max 3 decks
 */
export async function authorizeDeckCreation(
  supabase: SupabaseClient,
  userId: string,
): Promise<DeckCreationAuthorization> {
  const isPro = await getEffectiveProAccess(supabase, userId);
  const tier: UserTier = isPro ? 'pro' : 'free';
  const limits = TIER_LIMITS[tier];

  const { count: deckCount } = await supabase
    .from('decks')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('deleted_at', null);

  const currentCount = deckCount || 0;

  if (tier === 'pro') {
    return { allowed: true, currentCount, maxCount: limits.maxDecks };
  }

  if (currentCount >= limits.maxDecks) {
    return {
      allowed: false,
      reason: `Limite de ${limits.maxDecks} decks atingido. Faca upgrade para Pro para decks ilimitados.`,
      currentCount,
      maxCount: limits.maxDecks,
    };
  }

  return { allowed: true, currentCount, maxCount: limits.maxDecks };
}

export async function canCreateDeck(userId: string): Promise<{ allowed: boolean; reason?: string; currentCount: number; maxCount: number }> {
  const limits = await getUserTierLimits(userId);

  if (limits.tier === 'pro') {
    return { allowed: true, currentCount: limits.currentDeckCount, maxCount: limits.maxDecks };
  }

  if (limits.currentDeckCount >= limits.maxDecks) {
    return {
      allowed: false,
      reason: `Limite de ${limits.maxDecks} decks atingido. Faça upgrade para Pro para decks ilimitados.`,
      currentCount: limits.currentDeckCount,
      maxCount: limits.maxDecks,
    };
  }

  return { allowed: true, currentCount: limits.currentDeckCount, maxCount: limits.maxDecks };
}

/**
 * Check if user can add a card to a deck
 * Free users: max 50 cards per deck
 */
export async function authorizeCardCreation(
  supabase: SupabaseClient,
  deckId: string,
  userId: string,
  cardsToAdd: number = 1,
): Promise<CardCreationAuthorization> {
  const isPro = await getEffectiveProAccess(supabase, userId);
  const tier: UserTier = isPro ? 'pro' : 'free';
  const limits = TIER_LIMITS[tier];

  const { count: cardCount } = await supabase
    .from('cards')
    .select('id', { count: 'exact', head: true })
    .eq('deck_id', deckId)
    .is('deleted_at', null);

  const currentCount = cardCount || 0;

  if (tier === 'pro') {
    return { allowed: true, currentCount, maxCount: limits.maxCardsPerDeck };
  }

  if (currentCount + Math.max(1, Math.floor(cardsToAdd)) > limits.maxCardsPerDeck) {
    return {
      allowed: false,
      reason: `Limite de ${limits.maxCardsPerDeck} cards por deck atingido. Faca upgrade para Pro para ate 10.000 cards por deck.`,
      currentCount,
      maxCount: limits.maxCardsPerDeck,
    };
  }

  return { allowed: true, currentCount, maxCount: limits.maxCardsPerDeck };
}

export async function canAddCardToDeck(deckId: string, userId: string): Promise<{ allowed: boolean; reason?: string; currentCount: number; maxCount: number }> {
  const supabase = await createClient();
  const limits = await getUserTierLimits(userId);

  // Get current card count in deck
  const { count: cardCount } = await supabase
    .from('cards')
    .select('id', { count: 'exact', head: true })
    .eq('deck_id', deckId)
    .is('deleted_at', null);

  const currentCount = cardCount || 0;

  if (limits.tier === 'pro') {
    return { allowed: true, currentCount, maxCount: limits.maxCardsPerDeck };
  }

  if (currentCount >= limits.maxCardsPerDeck) {
    return {
      allowed: false,
      reason: `Limite de ${limits.maxCardsPerDeck} cards por deck atingido. Faça upgrade para Pro para até 10.000 cards por deck.`,
      currentCount,
      maxCount: limits.maxCardsPerDeck,
    };
  }

  return { allowed: true, currentCount, maxCount: limits.maxCardsPerDeck };
}

/**
 * @deprecated Use authorizeRunCreation from '@/lib/billing/run-entitlement' instead.
 * This function incorrectly blocks Free users from flashcard generation.
 */
export async function canUseAI(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const limits = await getUserTierLimits(userId);

  if (!limits.hasFlashcardGeneration && !limits.hasSimulados) {
    return {
      allowed: false,
      reason: 'Geração por IA é exclusiva para usuários Pro. Faça upgrade para usar este recurso.',
    };
  }

  return { allowed: true };
}

/**
 * Check if user can upload documents (PDF, PPTX, DOCX)
 * Pro users: unlimited. Free users: 3 per week.
 */
export async function canUploadDocument(userId: string): Promise<{ allowed: boolean; reason?: string; weeklyUsed?: number; weeklyMax?: number }> {
  const limits = await getUserTierLimits(userId);

  if (limits.isPro) {
    return { allowed: true };
  }

  // Free user — check weekly quota
  const weeklyUsed = limits.weeklyUploadsUsed;
  const weeklyMax = TIER_LIMITS.free.maxWeeklyUploads;

  if (weeklyUsed >= weeklyMax) {
    return {
      allowed: false,
      reason: `Limite de ${weeklyMax} uploads por semana atingido. Faça upgrade para Pro para uploads ilimitados.`,
      weeklyUsed,
      weeklyMax,
    };
  }

  return { allowed: true, weeklyUsed, weeklyMax };
}

/**
 * Check if user can use FSRS (advanced spaced repetition)
 * Only Pro users - Free users get basic study mode
 */
export async function canUseFSRS(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const limits = await getUserTierLimits(userId);

  if (!limits.hasFSRS) {
    return {
      allowed: false,
      reason: 'Repetição espaçada avançada é exclusiva para usuários Pro.',
    };
  }

  return { allowed: true };
}

// ============================================================================
// CLIENT-SIDE COMPATIBLE HELPER (for 'use client' components)
// ============================================================================

/**
 * Check tier limits from client-side by calling API
 * Use this in 'use client' components
 */
export async function checkTierLimitsClient(): Promise<TierLimits | null> {
  try {
    const response = await fetch('/api/user/tier-limits');
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

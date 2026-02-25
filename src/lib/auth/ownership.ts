import { createClient } from '@/lib/supabase/client';
import type { Deck } from '@/lib/types';

// ============================================================================
// OWNERSHIP VALIDATION HELPERS
// ============================================================================
// Funções para verificar se recursos pertencem ao usuário autenticado.
// Camada extra de segurança além do RLS do Supabase.

/**
 * Verifica se um deck pertence ao usuário
 * @returns true se o deck pertence ao usuário, false caso contrário
 */
export async function verifyDeckOwnership(
  deckId: string,
  userId: string
): Promise<boolean> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('decks')
    .select('id')
    .eq('id', deckId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .single();

  return !error && !!data;
}

/**
 * Verifica se um card pertence a um deck do usuário (verificação em cascata)
 * @returns true se o card pertence ao usuário, false caso contrário
 */
export async function verifyCardOwnership(
  cardId: string,
  userId: string
): Promise<boolean> {
  const supabase = createClient();

  // Busca o card e verifica se o deck pai pertence ao usuário
  const { data: card, error: cardError } = await supabase
    .from('cards')
    .select('deck_id')
    .eq('id', cardId)
    .is('deleted_at', null)
    .single();

  if (cardError || !card) return false;

  // Verifica se o deck pertence ao usuário
  return verifyDeckOwnership(card.deck_id, userId);
}

/**
 * Busca um deck garantindo que pertence ao usuário
 * @returns O deck se pertencer ao usuário, null caso contrário
 */
export async function getOwnedDeck(
  deckId: string,
  userId: string
): Promise<Deck | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('decks')
    .select('*')
    .eq('id', deckId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .single();

  if (error || !data) return null;
  return data as Deck;
}

/**
 * Soft delete de um deck com cascata para cards
 * Deleta o deck E todos os cards associados
 * @returns true se deletou com sucesso, false caso contrário
 */
export async function softDeleteDeckWithCascade(
  deckId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const now = Date.now();

  // Primeiro verifica se o deck pertence ao usuário
  const isOwner = await verifyDeckOwnership(deckId, userId);
  if (!isOwner) {
    return { success: false, error: 'Deck não encontrado ou não pertence ao usuário' };
  }

  // Soft delete dos cards associados (em massa)
  const { error: cardsError } = await supabase
    .from('cards')
    .update({
      deleted_at: now,
      updated_at: now,
    })
    .eq('deck_id', deckId)
    .is('deleted_at', null);

  if (cardsError) {
    console.error('Erro ao deletar cards:', cardsError);
    return { success: false, error: 'Erro ao deletar cards associados' };
  }

  // Soft delete do deck
  const { error: deckError } = await supabase
    .from('decks')
    .update({
      deleted_at: now,
      updated_at: now,
    })
    .eq('id', deckId)
    .eq('user_id', userId); // Garantia extra de ownership

  if (deckError) {
    console.error('Erro ao deletar deck:', deckError);
    return { success: false, error: 'Erro ao deletar deck' };
  }

  return { success: true };
}

/**
 * Soft delete de um card específico com verificação de ownership
 * @returns true se deletou com sucesso, false caso contrário
 */
export async function softDeleteCard(
  cardId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  // Verifica ownership em cascata
  const isOwner = await verifyCardOwnership(cardId, userId);
  if (!isOwner) {
    return { success: false, error: 'Card não encontrado ou não pertence ao usuário' };
  }

  const now = Date.now();
  const { error } = await supabase
    .from('cards')
    .update({
      deleted_at: now,
      updated_at: now,
    })
    .eq('id', cardId);

  if (error) {
    console.error('Erro ao deletar card:', error);
    return { success: false, error: 'Erro ao deletar card' };
  }

  return { success: true };
}

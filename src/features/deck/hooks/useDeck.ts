
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Deck } from '@/lib/types';
import { deckService } from '../services/deckService';

export function useDeck(deckId: string, userId: string | undefined) {
  const router = useRouter();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDeck = useCallback(async () => {
    if (!userId) return;
    
    try {
      setLoading(true);
      const data = await deckService.getDeck(deckId, userId);
      setDeck(data);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch deck';
      console.error('Error fetching deck:', err);
      setError(msg);
      // If deck not found or error, redirect to dashboard
      if (!deck) router.push('/dashboard'); 
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId, userId, router]);

  useEffect(() => {
    fetchDeck();
  }, [fetchDeck]);

  return {
    deck,
    loading,
    error,
    refreshDeck: fetchDeck
  };
}

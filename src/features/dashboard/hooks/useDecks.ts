
import { useState, useEffect, useCallback } from 'react';
import type { Deck } from '@/lib/types';
import { deckService } from '../services/deckService';

export function useDecks(userId: string | undefined) {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [cardCounts, setCardCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDecks = useCallback(async () => {
    if (!userId) return;
    
    try {
      setLoading(true);
      const data = await deckService.getDecks(userId);
      setDecks(data);
      
      const counts = await deckService.getDeckCardCounts(userId, data.map(d => d.id));
      setCardCounts(counts);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch decks';
      console.error('Error fetching decks:', err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchDecks();
  }, [fetchDecks]);

  const addDeck = async (title: string, description: string) => {
    if (!userId) return null;
    try {
      const newDeck = await deckService.createDeck(userId, title, description);
      setDecks(prev => [newDeck, ...prev]);
      setCardCounts(prev => ({ ...prev, [newDeck.id]: 0 }));
      return newDeck;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create deck';
      setError(msg);
      throw err;
    }
  };

  const updateDeck = async (deckId: string, title: string, description: string) => {
    try {
      const updatedDeck = await deckService.updateDeck(deckId, title, description);
      setDecks(prev => prev.map(d => d.id === updatedDeck.id ? updatedDeck : d));
      return updatedDeck;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update deck';
      setError(msg);
      throw err;
    }
  };

  const removeDeck = async (deckId: string) => {
    if (!userId) return;
    try {
      await deckService.deleteDeck(deckId, userId);
      setDecks(prev => prev.filter(d => d.id !== deckId));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete deck';
      setError(msg);
      throw err;
    }
  };

  return {
    decks,
    cardCounts,
    loading,
    error,
    addDeck,
    updateDeck,
    removeDeck,
    refreshDecks: fetchDecks
  };
}

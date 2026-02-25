
import { useState, useEffect, useCallback } from 'react';
import type { Card } from '@/lib/types';
import { cardService } from '../services/cardService';

export function useCards(deckId: string) {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCards = useCallback(async () => {
    try {
      setLoading(true);
      const data = await cardService.getCards(deckId);
      setCards(data);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch cards';
      console.error('Error fetching cards:', err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [deckId]);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  const addCard = async (front: string, back: string) => {
    try {
      const newCard = await cardService.createCard(deckId, front, back);
      setCards(prev => [newCard, ...prev]);
      return newCard;
    } catch (err: unknown) {
      throw err;
    }
  };

  const updateCard = async (cardId: string, front: string, back: string) => {
    try {
      const updatedCard = await cardService.updateCard(cardId, front, back);
      setCards(prev => prev.map(c => c.id === updatedCard.id ? updatedCard : c));
      return updatedCard;
    } catch (err: unknown) {
      throw err;
    }
  };

  const removeCard = async (cardId: string) => {
    try {
      await cardService.deleteCard(cardId, deckId);
      setCards(prev => prev.filter(c => c.id !== cardId));
    } catch (err: unknown) {
      throw err;
    }
  };

  return {
    cards,
    loading,
    error,
    addCard,
    updateCard,
    removeCard,
    refreshCards: fetchCards
  };
}

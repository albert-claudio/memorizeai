
import { useState, useEffect } from 'react';

export interface TierLimits {
  tier: 'free' | 'pro';
  maxDecks: number;
  maxCardsPerDeck: number;
  currentDeckCount: number;
  isPro: boolean;
  hasAI: boolean;
  hasUploads: boolean;
}

export function useTierLimits() {
  const [tierLimits, setTierLimits] = useState<TierLimits | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTierLimits = async () => {
    try {
      const response = await fetch('/api/user/tier-limits');
      if (response.ok) {
        const data = await response.json();
        setTierLimits(data);
      }
    } catch (err) {
      console.error('Failed to fetch tier limits:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTierLimits();
  }, []);

  const incrementDeckCount = () => {
    if (tierLimits) {
      setTierLimits({ 
        ...tierLimits, 
        currentDeckCount: tierLimits.currentDeckCount + 1 
      });
    }
  };

  return {
    tierLimits,
    loading,
    incrementDeckCount,
    refreshTierLimits: fetchTierLimits
  };
}

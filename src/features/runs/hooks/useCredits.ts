
import { useState, useEffect } from 'react';
import { getUserCredits, type UserCreditsInfo } from '@/app/actions/createRun';

export function useCredits() {
  const [credits, setCredits] = useState<UserCreditsInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCredits = async () => {
    try {
      const userCredits = await getUserCredits();
      setCredits(userCredits);
    } catch (err) {
      console.error('Failed to fetch credits:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCredits();
  }, []);

  const deductCredit = () => {
    if (credits) {
      setCredits({
        ...credits,
        planRunsRemaining: Math.max(0, credits.planRunsRemaining - 1),
        totalCredits: credits.totalCredits - 1,
      });
    }
  };

  return {
    credits,
    loading,
    deductCredit,
    refreshCredits: fetchCredits
  };
}

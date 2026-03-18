import { useState, useEffect, useCallback } from 'react';

export interface DashboardStats {
  today: { dueCards: number; reviewedToday: number; };
  performance: { recentPerformance7d: null | number; studyStreakDays: number; };
  focusDecks: Array<{
    deckId: string;
    deckTitle: string;
    concurso: string | null;
    materia: string | null;
    tema: string | null;
    overdueCards: number;
    leechCards: number;
    riskScore: number;
  }>;
  simulados: { recentAverage: null | number; lastScore: null | number; };
}

export function useDashboardStats(userId: string | undefined) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const tzOffset = new Date().getTimezoneOffset();
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const startOfDay = now.getTime();
      
      const res = await fetch(`/api/dashboard/stats?tzOffset=${tzOffset}&startOfDay=${startOfDay}`);
      if (!res.ok) {
        throw new Error('Failed to fetch stats');
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStats(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refreshStats: fetchStats };
}

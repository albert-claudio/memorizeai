import { useState, useEffect, useCallback } from 'react';

export interface FocusDeck {
  deckId: string;
  deckTitle: string;
  concurso: string | null;
  materia: string | null;
  tema: string | null;
  overdueCards: number;
  leechCards: number;
  avgLapses: number;
  avgDifficulty: number;
  avgStability: number;
  errorRate7d: number;
  errorRate30d?: number;
  accuracy7d?: number | null;
  accuracy30d?: number | null;
  trendDelta?: number | null;
  riskScore: number;
  riskLevel?: 'low' | 'medium' | 'high';
  primaryIssue?: DiagnosticIssue;
  riskDrivers?: string[];
}

export type DiagnosticIssue =
  | 'high_error'
  | 'worsening'
  | 'overdue'
  | 'leeches'
  | 'repeated_lapses'
  | 'low_stability'
  | 'high_difficulty'
  | 'low_volume'
  | 'none';

export interface WeakTopic {
  key: string;
  label: string;
  type: 'materia' | 'tema';
  errorRate7d: number;
  errorRate30d: number;
  accuracy7d?: number | null;
  accuracy30d?: number | null;
  totalReviews7d: number;
  totalReviews30d?: number;
  avgLapses: number;
  avgDifficulty: number;
  avgStability: number;
  isWeak: boolean;
  weaknessScore?: number;
  confidence?: 'low' | 'medium' | 'high';
  trendDelta?: number | null;
  primaryIssue?: DiagnosticIssue;
  recommendation?: string;
}

export interface Reinforcement {
  deckId: string;
  deckTitle: string;
  materia: string | null;
  tema: string | null;
  reason: string;
  reasonType: 'high_error' | 'overdue' | 'leeches' | 'low_stability';
  overdueCards: number;
  errorRate7d: number;
  avgStability: number;
}

export interface DashboardStats {
  today: { dueCards: number; reviewedToday: number };
  performance: {
    recentPerformance7d: number | null;
    recentPerformance30d: number | null;
    studyStreakDays: number;
    trend: 'improving' | 'declining' | 'stable';
  };
  performanceSeries: Array<{
    day: string;
    label: string;
    accuracy: number | null;
    reviews: number;
  }>;
  focusDecks: FocusDeck[];
  weakTopics: WeakTopic[];
  reinforcement: Reinforcement | null;
  simulados: { lastScore: number | null; recentAverage: number | null };
  forecast: { dueToday: number; dueTomorrow: number; dueNext7d: number };
  distribution: {
    overdueTotal: number;
    leechTotal: number;
    highLapses: number;
    lowStability: number;
  };
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
      
      const res = await fetch(
        `/api/dashboard/stats?tzOffset=${tzOffset}&startOfDay=${startOfDay}&seriesDays=14`,
      );
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

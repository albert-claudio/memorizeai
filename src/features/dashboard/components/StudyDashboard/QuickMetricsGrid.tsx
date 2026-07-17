'use client';

import { Icons } from '@/app/dashboard/components';
import type { DashboardStats } from '@/features/dashboard/hooks/useDashboardStats';
import { MetricCard } from './MetricCard';

interface QuickMetricsGridProps {
  stats: DashboardStats;
}

export function QuickMetricsGrid({ stats }: QuickMetricsGridProps) {
  const avgSim =
    stats.simulados.recentAverage != null
      ? `${Math.round(stats.simulados.recentAverage * 100)}%`
      : '--';

  return (
    <div className="study-metrics-grid">
      <MetricCard
        label="Cards hoje"
        value={String(stats.today.dueCards)}
        subtext={
          stats.today.dueCards > 0
            ? `${stats.today.dueCards} cards para revisar hoje`
            : 'Nenhum card pendente hoje'
        }
        icon={<Icons.Cards />}
      />
      <MetricCard
        label="Sequência"
        value={`${stats.performance.studyStreakDays} dias`}
        subtext={
          stats.performance.studyStreakDays > 0
            ? 'Ótimo! Mantenha a consistência'
            : 'Comece sua sequência hoje'
        }
        icon={<Icons.Flame />}
      />
      <MetricCard
        label="Média recente"
        value={avgSim}
        subtext="Baseado nos últimos simulados"
        icon={<Icons.TrendingUp />}
      />
      <MetricCard
        label="Previsão 7 dias"
        value={`${stats.forecast.dueNext7d} cards`}
        subtext="Estimativa de cards a revisar"
        icon={<Icons.Calendar />}
      />
    </div>
  );
}

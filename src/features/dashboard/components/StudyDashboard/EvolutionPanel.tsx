'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Simulado } from '@/app/dashboard/components';
import { Icons } from '@/app/dashboard/components';
import { EvolutionLineChart } from '@/features/dashboard/components/EvolutionLineChart';
import type { DashboardStats } from '@/features/dashboard/hooks/useDashboardStats';
import {
  buildSimuladoSeries,
  formatSimuladoTitle,
  getCompletedSimulados,
  performanceSeriesToChart,
  scoreColor,
  simuladoScorePercent,
} from '@/features/dashboard/utils/dashboardPresentation';
import { SectionCard } from './SectionCard';
import { sectionTitleStyle, tokens } from './tokens';

type ChartMode = 'reviews' | 'simulados';
type RangeDays = 7 | 14;

interface EvolutionPanelProps {
  stats: DashboardStats;
  simulados: Simulado[];
  startOfDay: number;
  tzOffset?: number;
}

export function EvolutionPanel({ stats, simulados, startOfDay, tzOffset = 0 }: EvolutionPanelProps) {
  const router = useRouter();
  const [mode, setMode] = useState<ChartMode>('reviews');
  const [rangeDays, setRangeDays] = useState<RangeDays>(14);

  const chartSeries = useMemo(() => {
    if (mode === 'reviews') {
      return performanceSeriesToChart(stats.performanceSeries, rangeDays);
    }
    return buildSimuladoSeries(simulados, rangeDays, startOfDay, tzOffset);
  }, [mode, rangeDays, stats.performanceSeries, simulados, startOfDay, tzOffset]);

  const recentSimulados = getCompletedSimulados(simulados, 4);

  return (
    <SectionCard className="study-section-card">
      <div
        className="study-evolution-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: tokens.accent }}><Icons.LineChart /></span>
          <h2 style={sectionTitleStyle}>Evolução</h2>
        </div>
        <div className="study-evolution-controls" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select
            className="study-evolution-select"
            value={rangeDays}
            onChange={(e) => setRangeDays(Number(e.target.value) as RangeDays)}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: tokens.cardBorder,
              borderRadius: 8,
              color: tokens.textSecondary,
              fontSize: 12,
              padding: '6px 10px',
              cursor: 'pointer',
            }}
          >
            <option value={7}>Últimos 7 dias</option>
            <option value={14}>Últimos 14 dias</option>
          </select>
        </div>
      </div>

      <div
        className="study-evolution-toggle"
        style={{
          display: 'inline-flex',
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 8,
          padding: 3,
          marginBottom: 16,
          border: tokens.cardBorder,
        }}
      >
        {(['reviews', 'simulados'] as ChartMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: 'none',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              background: mode === m ? tokens.accentMuted : 'transparent',
              color: mode === m ? tokens.accent : tokens.textSecondary,
            }}
          >
            {m === 'reviews' ? 'Revisões' : 'Simulados'}
          </button>
        ))}
      </div>

      <EvolutionLineChart series={chartSeries} showLabels />

      <div style={{ marginTop: 24, paddingTop: 20, borderTop: tokens.cardBorder }}>
        <p style={{ ...sectionTitleStyle, marginBottom: 12, fontSize: 11 }}>Últimos simulados</p>
        {recentSimulados.length === 0 ? (
          <p style={{ color: tokens.textMuted, fontSize: 13, margin: 0 }}>Nenhum simulado concluído ainda.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentSimulados.map((sim) => {
              const pct = simuladoScorePercent(sim);
              return (
                <button
                  key={sim.id}
                  type="button"
                  className="study-recent-simulado-card"
                  onClick={() => router.push(`/simulado/${sim.id}/resultado`)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.04)',
                    borderRadius: 8,
                    padding: '10px 12px',
                    cursor: 'pointer',
                    width: '100%',
                    textAlign: 'left',
                  }}
                >
                  <span
                    className="study-recent-simulado-title"
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: tokens.textPrimary,
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      marginRight: 12,
                    }}
                  >
                    {formatSimuladoTitle(sim)}
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: pct != null ? scoreColor(pct) : tokens.textMuted,
                    }}
                  >
                    {pct != null ? `${pct}%` : '--'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

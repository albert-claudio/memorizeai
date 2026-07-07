'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { DashboardStats } from '@/features/dashboard/hooks/useDashboardStats';

interface SessionSummaryProps {
  results: { correct: number; wrong: number };
  deckId: string;
  userId: string;
}

function buildLinePath(values: number[]) {
  if (values.length === 0) return '';

  const width = 320;
  const height = 120;

  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - (value / 100) * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

function getTrendCopy(trend: DashboardStats['performance']['trend']) {
  if (trend === 'improving') return 'Voce esta melhorando nos ultimos dias.';
  if (trend === 'declining') return 'Seu desempenho caiu nos ultimos dias e vale revisar com foco.';
  return 'Seu desempenho esta estavel neste momento.';
}

function TrendChart({ series }: { series: DashboardStats['performanceSeries'] }) {
  const chartSeries = series.map((point) => ({
    ...point,
    score: point.accuracy === null ? 0 : Math.round(point.accuracy * 100),
  }));
  const linePath = buildLinePath(chartSeries.map((point) => point.score));

  return (
    <div style={{
      width: '100%',
      padding: 20,
      borderRadius: 20,
      background: 'linear-gradient(180deg, rgba(99, 102, 241, 0.12) 0%, rgba(15, 23, 42, 0.3) 100%)',
      border: '1px solid rgba(99, 102, 241, 0.18)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#818CF8', marginBottom: 6 }}>
            Evolucao recente
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
            Desempenho dos ultimos 7 dias
          </div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Cada ponto mostra taxa de acerto do dia
        </div>
      </div>

      <div style={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
        <svg viewBox="0 0 320 120" width="100%" height="120" aria-label="Grafico de desempenho">
          {[0, 25, 50, 75, 100].map((grid) => {
            const y = 120 - (grid / 100) * 120;
            return (
              <line
                key={grid}
                x1="0"
                y1={y}
                x2="320"
                y2={y}
                stroke="rgba(255,255,255,0.08)"
                strokeDasharray="4 6"
              />
            );
          })}
          <path d={linePath} fill="none" stroke="#818CF8" strokeWidth="3" strokeLinecap="round" />
          {chartSeries.map((point, index) => {
            const x = chartSeries.length === 1 ? 160 : (index / (chartSeries.length - 1)) * 320;
            const y = 120 - (point.score / 100) * 120;
            const hasData = point.accuracy !== null;

            return (
              <circle
                key={point.day}
                cx={x}
                cy={y}
                r={hasData ? 5 : 4}
                fill={hasData ? '#FFFFFF' : 'rgba(255,255,255,0.28)'}
                stroke="#818CF8"
                strokeWidth="2"
              />
            );
          })}
        </svg>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
        gap: 8,
        marginTop: 12,
      }}>
        {chartSeries.map((point) => (
          <div key={point.day} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
              {point.label}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              {point.accuracy === null ? '--' : `${point.score}%`}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {point.reviews} rev.
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SessionSummary({ results, deckId, userId }: SessionSummaryProps) {
  const total = results.correct + results.wrong;
  const percentage = total > 0 ? Math.round((results.correct / total) * 100) : 0;
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadStats = async () => {
      if (!userId) {
        setStatsLoading(false);
        return;
      }

      try {
        setStatsLoading(true);
        const tzOffset = new Date().getTimezoneOffset();
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const startOfDay = now.getTime();
        const response = await fetch(`/api/dashboard/stats?tzOffset=${tzOffset}&startOfDay=${startOfDay}`, {
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error('Falha ao carregar estatisticas');
        }

        const payload = await response.json() as DashboardStats;
        if (active) {
          setStats(payload);
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (active) {
          setStatsLoading(false);
        }
      }
    };

    loadStats();

    return () => {
      active = false;
    };
  }, [userId]);

  const sessionDelta = useMemo(() => {
    if (stats?.performance.recentPerformance7d == null) return null;
    return percentage - Math.round(stats.performance.recentPerformance7d * 100);
  }, [percentage, stats?.performance.recentPerformance7d]);

  const bestDay = useMemo(() => {
    if (!stats?.performanceSeries?.length) return null;

    return stats.performanceSeries.reduce<DashboardStats['performanceSeries'][number] | null>((best, point) => {
      if (point.accuracy === null) return best;
      if (!best || (best.accuracy ?? 0) < point.accuracy) return point;
      return best;
    }, null);
  }, [stats?.performanceSeries]);

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'radial-gradient(circle at top, rgba(99, 102, 241, 0.18), transparent 45%), var(--bg-base)',
      padding: '40px 20px 56px',
    }}>
      <div style={{ maxWidth: 960, margin: '0 auto', display: 'grid', gap: 24 }}>
        <section style={{
          padding: 28,
          borderRadius: 28,
          background: 'linear-gradient(135deg, rgba(17, 24, 39, 0.95) 0%, rgba(30, 41, 59, 0.92) 100%)',
          border: '1px solid rgba(129, 140, 248, 0.18)',
          boxShadow: '0 24px 80px rgba(15, 23, 42, 0.45)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                borderRadius: 999,
                background: 'rgba(129, 140, 248, 0.12)',
                border: '1px solid rgba(129, 140, 248, 0.22)',
                fontSize: 12,
                fontWeight: 700,
                color: '#A5B4FC',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: 18,
              }}>
                Resultado da sessao
              </div>
              <h1 style={{ fontSize: 36, lineHeight: 1.05, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 10 }}>
                Sessao concluida com {percentage}% de aproveitamento
              </h1>
              <p style={{ fontSize: 16, color: 'var(--text-secondary)', maxWidth: 560 }}>
                Voce revisou {total} cards agora. Este painel mostra seu resultado imediato e a evolucao recente do seu desempenho.
              </p>
            </div>
            <div style={{
              minWidth: 140,
              padding: '18px 20px',
              borderRadius: 20,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 6 }}>
                Precisao
              </div>
              <div style={{ fontSize: 42, fontWeight: 800, color: '#F8FAFC' }}>
                {percentage}%
              </div>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 14,
            marginTop: 24,
          }}>
            <div style={{ padding: 18, borderRadius: 18, background: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.24)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#86EFAC', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Acertos</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: '#22C55E' }}>{results.correct}</div>
            </div>
            <div style={{ padding: 18, borderRadius: 18, background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.24)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#FCA5A5', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Erros</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: '#EF4444' }}>{results.wrong}</div>
            </div>
            <div style={{ padding: 18, borderRadius: 18, background: 'rgba(99, 102, 241, 0.12)', border: '1px solid rgba(99, 102, 241, 0.24)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#A5B4FC', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Media 7d</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: '#818CF8' }}>
                {stats?.performance.recentPerformance7d != null ? `${Math.round(stats.performance.recentPerformance7d * 100)}%` : '--'}
              </div>
            </div>
            <div style={{ padding: 18, borderRadius: 18, background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.24)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#FCD34D', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Delta da sessao</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: '#F59E0B' }}>
                {sessionDelta == null ? '--' : `${sessionDelta > 0 ? '+' : ''}${sessionDelta} pts`}
              </div>
            </div>
          </div>
        </section>

        <section style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 20,
        }}>
          <div style={{
            padding: 24,
            borderRadius: 24,
            background: 'rgba(15, 23, 42, 0.7)',
            border: '1px solid rgba(148, 163, 184, 0.14)',
          }}>
            {statsLoading || !stats ? (
              <div style={{ minHeight: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                Carregando evolucao...
              </div>
            ) : (
              <TrendChart series={stats.performanceSeries} />
            )}
          </div>

          <div style={{
            padding: 24,
            borderRadius: 24,
            background: 'rgba(15, 23, 42, 0.7)',
            border: '1px solid rgba(148, 163, 184, 0.14)',
            display: 'grid',
            gap: 16,
            alignContent: 'start',
          }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 6 }}>
                Leitura rapida
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                {stats ? getTrendCopy(stats.performance.trend) : 'Resumo da sua evolucao recente.'}
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                {stats?.today.reviewedToday
                  ? `Hoje voce ja acumulou ${stats.today.reviewedToday} revisoes registradas.`
                  : 'Esta foi sua primeira revisao registrada hoje.'}
              </p>
            </div>

            <div style={{
              padding: 16,
              borderRadius: 18,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                Melhor dia recente
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
                {bestDay?.accuracy != null ? `${Math.round(bestDay.accuracy * 100)}%` : '--'}
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                {bestDay ? `${bestDay.label} com ${bestDay.reviews} revisoes` : 'Sem historico suficiente ainda'}
              </div>
            </div>

            <div style={{
              padding: 16,
              borderRadius: 18,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                Proxima acao
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                Continue reforcando o que ainda esta fraco
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                Abra o painel de desempenho para ver tendencia, temas fracos e decks criticos.
              </div>
            </div>
          </div>
        </section>

        <section style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/dashboard/performance" style={{ textDecoration: 'none' }}>
            <button style={{
              padding: '16px 22px',
              background: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
              border: 'none',
              borderRadius: 16,
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 12px 32px rgba(99, 102, 241, 0.28)',
            }}>
              Ver desempenho completo
            </button>
          </Link>

          <Link href={`/deck/${deckId}`} style={{ textDecoration: 'none' }}>
            <button style={{
              padding: '16px 22px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 16,
              color: 'var(--text-primary)',
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
            }}>
              Voltar ao deck
            </button>
          </Link>

          <Link href="/dashboard" style={{ textDecoration: 'none' }}>
            <button style={{
              padding: '16px 22px',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 16,
              color: 'var(--text-secondary)',
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
            }}>
              Ir para dashboard
            </button>
          </Link>
        </section>
      </div>
    </div>
  );
}

'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import { useDashboardStats } from '@/features/dashboard/hooks/useDashboardStats';
import { globalStyles } from '../components';

const cardStyle: React.CSSProperties = {
  background: '#111',
  padding: 24,
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,0.06)',
};

const labelStyle: React.CSSProperties = {
  color: '#a1a1aa',
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 8,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
};

const valueStyle: React.CSSProperties = {
  color: '#f4f4f5',
  fontSize: 24,
  fontWeight: 700,
  marginBottom: 4,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  color: '#f4f4f5',
  marginBottom: 16,
};

function buildLinePath(values: number[]) {
  if (values.length === 0) return '';

  const width = 640;
  const height = 220;

  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - (value / 100) * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

function PerformanceChart({
  series,
}: {
  series: Array<{ day: string; label: string; accuracy: number | null; reviews: number }>;
}) {
  const points = series.map((point) => ({
    ...point,
    score: point.accuracy == null ? 0 : Math.round(point.accuracy * 100),
  }));
  const path = buildLinePath(points.map((point) => point.score));
  const bestScore = points.some((point) => point.accuracy != null)
    ? Math.max(...points.map((point) => point.score))
    : null;
  const totalReviews = points.reduce((sum, point) => sum + point.reviews, 0);

  return (
    <div style={{
      background: 'linear-gradient(180deg, rgba(99,102,241,0.12) 0%, rgba(17,17,17,0.25) 100%)',
      border: '1px solid rgba(99,102,241,0.18)',
      borderRadius: 20,
      padding: 24,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#818CF8', marginBottom: 6 }}>
            Evolucao
          </div>
          <h3 style={{ fontSize: 24, fontWeight: 700, color: '#f4f4f5', marginBottom: 6 }}>
            Desempenho nos ultimos 7 dias
          </h3>
          <p style={{ fontSize: 14, color: '#a1a1aa' }}>
            Um grafico direto para o usuario ver diferenca real entre dias bons, ruins e estaveis.
          </p>
        </div>
        <div style={{ display: 'grid', gap: 8, minWidth: 180 }}>
          <div style={{ padding: 14, borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#71717a', marginBottom: 4 }}>
              Melhor dia
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#f4f4f5' }}>
              {bestScore == null ? '--' : `${bestScore}%`}
            </div>
          </div>
          <div style={{ padding: 14, borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#71717a', marginBottom: 4 }}>
              Volume
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#f4f4f5' }}>
              {totalReviews} rev.
            </div>
          </div>
        </div>
      </div>

      <div style={{ width: '100%', overflowX: 'auto' }}>
        <svg viewBox="0 0 640 220" width="100%" height="220" aria-label="Grafico de desempenho semanal">
          {[0, 25, 50, 75, 100].map((grid) => {
            const y = 220 - (grid / 100) * 220;
            return (
              <g key={grid}>
                <line
                  x1="0"
                  y1={y}
                  x2="640"
                  y2={y}
                  stroke="rgba(255,255,255,0.08)"
                  strokeDasharray="5 7"
                />
                <text x="0" y={Math.max(y - 6, 12)} fill="#71717a" fontSize="11">
                  {grid}%
                </text>
              </g>
            );
          })}
          <path d={path} fill="none" stroke="#818CF8" strokeWidth="4" strokeLinecap="round" />
          {points.map((point, index) => {
            const x = points.length === 1 ? 320 : (index / (points.length - 1)) * 640;
            const y = 220 - (point.score / 100) * 220;
            const hasData = point.accuracy != null;

            return (
              <circle
                key={point.day}
                cx={x}
                cy={y}
                r={hasData ? 6 : 4}
                fill={hasData ? '#fff' : 'rgba(255,255,255,0.24)'}
                stroke="#818CF8"
                strokeWidth="3"
              />
            );
          })}
        </svg>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8, marginTop: 12 }}>
        {points.map((point) => (
          <div key={point.day} style={{ textAlign: 'center', padding: '8px 4px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#71717a', marginBottom: 4 }}>
              {point.label}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f4f4f5' }}>
              {point.accuracy == null ? '--' : `${point.score}%`}
            </div>
            <div style={{ fontSize: 11, color: '#71717a' }}>
              {point.reviews} rev.
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DesempenhoPageInner() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const { stats, loading: loadingStats } = useDashboardStats(user?.id);

  useEffect(() => {
    const checkUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = '/login';
        return;
      }
      setUser(user);
      setLoadingUser(false);
    };
    checkUser();
  }, []);

  if (loadingUser || loadingStats) {
    return (
      <div style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 48, height: 48, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#6366F1', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style jsx global>{globalStyles}</style>
      </div>
    );
  }

  const trendIcon = stats?.performance.trend === 'improving' ? '↑' : stats?.performance.trend === 'declining' ? '↓' : '→';
  const trendColor = stats?.performance.trend === 'improving' ? '#22c55e' : stats?.performance.trend === 'declining' ? '#ef4444' : '#a1a1aa';
  const trendLabel = stats?.performance.trend === 'improving' ? 'Melhorando' : stats?.performance.trend === 'declining' ? 'Piorando' : 'Estavel';
  const firstPoint = stats?.performanceSeries.find((point) => point.accuracy != null) ?? null;
  const lastPoint = stats?.performanceSeries.toReversed().find((point) => point.accuracy != null) ?? null;
  const weeklyDelta =
    firstPoint?.accuracy != null && lastPoint?.accuracy != null
      ? Math.round(lastPoint.accuracy * 100) - Math.round(firstPoint.accuracy * 100)
      : null;

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
      <style jsx global>{globalStyles}</style>
      <h1 style={{ fontSize: 32, fontWeight: 700, color: '#f4f4f5', marginBottom: 8, letterSpacing: '-0.03em' }}>Desempenho</h1>
      <p style={{ color: '#71717a', marginBottom: 40, fontSize: 15 }}>Diagnostico completo: onde voce erra, o que reforcar e se esta melhorando</p>

      {stats ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 18 }}>
              <div>
                <h3 style={{ ...sectionTitle, marginBottom: 8 }}>Grafico de Evolucao</h3>
                <p style={{ color: '#71717a', fontSize: 14 }}>
                  Uma leitura visual simples para o usuario ver a diferenca no desempenho ao longo da semana.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#71717a', marginBottom: 4 }}>
                    Variacao 7d
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: weeklyDelta == null ? '#f4f4f5' : weeklyDelta >= 0 ? '#22c55e' : '#ef4444' }}>
                    {weeklyDelta == null ? '--' : `${weeklyDelta > 0 ? '+' : ''}${weeklyDelta} pts`}
                  </div>
                </div>
                <div style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#71717a', marginBottom: 4 }}>
                    Tendencia
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: trendColor }}>
                    {trendIcon} {trendLabel}
                  </div>
                </div>
              </div>
            </div>
            <PerformanceChart series={stats.performanceSeries} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            <div style={cardStyle}>
              <p style={labelStyle}>Hoje</p>
              <h4 style={valueStyle}>
                {stats.today.dueCards} <span style={{ fontSize: 14, fontWeight: 500, color: '#a1a1aa' }}>pendentes</span>
              </h4>
              <p style={{ color: '#22c55e', fontSize: 13, fontWeight: 500 }}>{stats.today.reviewedToday} revisados</p>
            </div>
            <div style={cardStyle}>
              <p style={labelStyle}>Aproveitamento (7d)</p>
              <h4 style={valueStyle}>
                {stats.performance.recentPerformance7d != null ? `${Math.round(stats.performance.recentPerformance7d * 100)}%` : '--'}
              </h4>
            </div>
            <div style={cardStyle}>
              <p style={labelStyle}>Aproveitamento (30d)</p>
              <h4 style={valueStyle}>
                {stats.performance.recentPerformance30d != null ? `${Math.round(stats.performance.recentPerformance30d * 100)}%` : '--'}
              </h4>
            </div>
            <div style={cardStyle}>
              <p style={labelStyle}>Tendencia</p>
              <h4 style={{ ...valueStyle, color: trendColor }}>
                {trendIcon} {trendLabel}
              </h4>
            </div>
            <div style={cardStyle}>
              <p style={labelStyle}>Consistencia</p>
              <h4 style={valueStyle}>
                {stats.performance.studyStreakDays} <span style={{ fontSize: 14, fontWeight: 500, color: '#a1a1aa' }}>dias</span>
              </h4>
            </div>
          </div>

          <div style={cardStyle}>
            <h3 style={sectionTitle}>Ranking de Temas Fracos</h3>
            {stats.weakTopics.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <th style={{ textAlign: 'left', padding: '10px 12px', color: '#71717a', fontWeight: 600, fontSize: 12, textTransform: 'uppercase' }}>Tema/Materia</th>
                      <th style={{ textAlign: 'center', padding: '10px 12px', color: '#71717a', fontWeight: 600, fontSize: 12, textTransform: 'uppercase' }}>Tipo</th>
                      <th style={{ textAlign: 'right', padding: '10px 12px', color: '#71717a', fontWeight: 600, fontSize: 12, textTransform: 'uppercase' }}>Erro 7d</th>
                      <th style={{ textAlign: 'right', padding: '10px 12px', color: '#71717a', fontWeight: 600, fontSize: 12, textTransform: 'uppercase' }}>Erro 30d</th>
                      <th style={{ textAlign: 'right', padding: '10px 12px', color: '#71717a', fontWeight: 600, fontSize: 12, textTransform: 'uppercase' }}>Lapsos</th>
                      <th style={{ textAlign: 'right', padding: '10px 12px', color: '#71717a', fontWeight: 600, fontSize: 12, textTransform: 'uppercase' }}>Estab.</th>
                      <th style={{ textAlign: 'center', padding: '10px 12px', color: '#71717a', fontWeight: 600, fontSize: 12, textTransform: 'uppercase' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.weakTopics.map((wt) => (
                      <tr key={wt.key} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '12px', color: '#f4f4f5', fontWeight: 500 }}>{wt.label}</td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: wt.type === 'materia' ? '#a78bfa' : '#60a5fa',
                            background: wt.type === 'materia' ? 'rgba(167,139,250,0.1)' : 'rgba(96,165,250,0.1)',
                            padding: '3px 8px',
                            borderRadius: 6,
                            textTransform: 'uppercase',
                          }}>
                            {wt.type === 'materia' ? 'Materia' : 'Tema'}
                          </span>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', color: wt.errorRate7d > 30 ? '#ef4444' : '#f4f4f5', fontWeight: 600 }}>{wt.errorRate7d}%</td>
                        <td style={{ padding: '12px', textAlign: 'right', color: '#a1a1aa' }}>{wt.errorRate30d}%</td>
                        <td style={{ padding: '12px', textAlign: 'right', color: wt.avgLapses > 3 ? '#f87171' : '#a1a1aa' }}>{wt.avgLapses}</td>
                        <td style={{ padding: '12px', textAlign: 'right', color: wt.avgStability < 2 ? '#f87171' : '#a1a1aa' }}>{wt.avgStability}d</td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          {wt.isWeak ? (
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '3px 10px', borderRadius: 6 }}>FRACO</span>
                          ) : (
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', background: 'rgba(34,197,94,0.1)', padding: '3px 10px', borderRadius: 6 }}>OK</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: '#22c55e', fontWeight: 500 }}>Sem dados de revisao por tema ainda.</p>
            )}
          </div>

          <div style={cardStyle}>
            <h3 style={sectionTitle}>Ranking de Decks Criticos</h3>
            {stats.focusDecks.length > 0 ? (
              <div style={{ display: 'grid', gap: 12 }}>
                {stats.focusDecks.map((fd, idx) => (
                  <div key={fd.deckId} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: 16,
                    background: 'rgba(239,68,68,0.05)',
                    borderRadius: 12,
                    border: '1px solid rgba(239,68,68,0.15)',
                    gap: 16,
                    flexWrap: 'wrap',
                  }}>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                      <span style={{
                        fontSize: 16,
                        fontWeight: 800,
                        color: idx === 0 ? '#ef4444' : '#71717a',
                        minWidth: 24,
                        textAlign: 'center',
                      }}>
                        #{idx + 1}
                      </span>
                      <div>
                        <h4 style={{ fontWeight: 600, color: '#f4f4f5', fontSize: 15, marginBottom: 4 }}>{fd.deckTitle}</h4>
                        {(fd.materia || fd.tema) && (
                          <p style={{ fontSize: 12, color: '#71717a', marginBottom: 6 }}>{[fd.materia, fd.tema].filter(Boolean).join(' > ')}</p>
                        )}
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
                          {fd.overdueCards > 0 && <span style={{ color: '#ef4444' }}>{fd.overdueCards} atrasados</span>}
                          {fd.leechCards > 0 && <span style={{ color: '#f59e0b' }}>{fd.leechCards} leeches</span>}
                          {fd.errorRate7d > 20 && <span style={{ color: '#fb923c' }}>{fd.errorRate7d}% erro 7d</span>}
                          {fd.avgDifficulty > 6 && <span style={{ color: '#c084fc' }}>Dif. {fd.avgDifficulty}</span>}
                          {fd.avgLapses > 2 && <span style={{ color: '#f87171' }}>{fd.avgLapses} lapsos</span>}
                          {fd.avgStability < 3 && <span style={{ color: '#94a3b8' }}>Est. {fd.avgStability}d</span>}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <span style={{ fontSize: 13, color: '#71717a', fontWeight: 600 }}>Risco: {fd.riskScore}</span>
                      <button
                        onClick={() => router.push(`/deck/${fd.deckId}`)}
                        style={{ background: 'transparent', border: 'none', color: '#ef4444', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        Revisar →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: '#22c55e', fontWeight: 500 }}>Nenhum deck critico. Tudo em dia.</p>
            )}
          </div>

          <div style={cardStyle}>
            <h3 style={sectionTitle}>Distribuicao de Problemas</h3>
            <p style={{ fontSize: 12, color: '#52525b', marginBottom: 16 }}>Calculado sobre todos os cards ativos</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
              <div style={{ padding: 16, background: 'rgba(239,68,68,0.06)', borderRadius: 12, textAlign: 'center' }}>
                <p style={{ fontSize: 28, fontWeight: 700, color: stats.distribution.overdueTotal > 0 ? '#ef4444' : '#22c55e' }}>
                  {stats.distribution.overdueTotal}
                </p>
                <p style={{ fontSize: 12, color: '#a1a1aa', fontWeight: 600 }}>Cards atrasados</p>
              </div>
              <div style={{ padding: 16, background: 'rgba(245,158,11,0.06)', borderRadius: 12, textAlign: 'center' }}>
                <p style={{ fontSize: 28, fontWeight: 700, color: stats.distribution.leechTotal > 0 ? '#f59e0b' : '#22c55e' }}>
                  {stats.distribution.leechTotal}
                </p>
                <p style={{ fontSize: 12, color: '#a1a1aa', fontWeight: 600 }}>Leeches</p>
              </div>
              <div style={{ padding: 16, background: 'rgba(248,113,113,0.06)', borderRadius: 12, textAlign: 'center' }}>
                <p style={{ fontSize: 28, fontWeight: 700, color: stats.distribution.highLapses > 0 ? '#f87171' : '#22c55e' }}>
                  {stats.distribution.highLapses}
                </p>
                <p style={{ fontSize: 12, color: '#a1a1aa', fontWeight: 600 }}>Lapses &gt; 3</p>
              </div>
              <div style={{ padding: 16, background: 'rgba(148,163,184,0.06)', borderRadius: 12, textAlign: 'center' }}>
                <p style={{ fontSize: 28, fontWeight: 700, color: stats.distribution.lowStability > 0 ? '#94a3b8' : '#22c55e' }}>
                  {stats.distribution.lowStability}
                </p>
                <p style={{ fontSize: 12, color: '#a1a1aa', fontWeight: 600 }}>Estab. &lt; 2d</p>
              </div>
            </div>
          </div>

          <div style={cardStyle}>
            <h3 style={sectionTitle}>Previsao de Carga</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
              <div style={{ padding: 16, background: 'rgba(99,102,241,0.06)', borderRadius: 12, textAlign: 'center' }}>
                <p style={{ fontSize: 28, fontWeight: 700, color: '#6366f1' }}>{stats.forecast.dueToday}</p>
                <p style={{ fontSize: 12, color: '#a1a1aa', fontWeight: 600 }}>Hoje</p>
              </div>
              <div style={{ padding: 16, background: 'rgba(168,85,247,0.06)', borderRadius: 12, textAlign: 'center' }}>
                <p style={{ fontSize: 28, fontWeight: 700, color: '#a855f7' }}>{stats.forecast.dueTomorrow}</p>
                <p style={{ fontSize: 12, color: '#a1a1aa', fontWeight: 600 }}>Amanha</p>
              </div>
              <div style={{ padding: 16, background: 'rgba(139,92,246,0.06)', borderRadius: 12, textAlign: 'center' }}>
                <p style={{ fontSize: 28, fontWeight: 700, color: '#8b5cf6' }}>{stats.forecast.dueNext7d}</p>
                <p style={{ fontSize: 12, color: '#a1a1aa', fontWeight: 600 }}>Proximos 7 dias</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <p style={{ color: '#a1a1aa' }}>Nenhum dado encontrado.</p>
      )}
    </div>
  );
}

export default function DesempenhoPage() {
  return (
    <Suspense>
      <DesempenhoPageInner />
    </Suspense>
  );
}

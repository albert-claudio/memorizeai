'use client';

import { Suspense, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import {
  type DashboardStats,
  type FocusDeck,
  type WeakTopic,
  useDashboardStats,
} from '@/features/dashboard/hooks/useDashboardStats';
import { EvolutionLineChart } from '@/features/dashboard/components/EvolutionLineChart';
import { STUDY_DASHBOARD_RESPONSIVE_CSS } from '@/features/dashboard/components/StudyDashboard/studyDashboardResponsive';
import { tokens } from '@/features/dashboard/components/StudyDashboard/tokens';
import { performanceSeriesToChart, scoreColor } from '@/features/dashboard/utils/dashboardPresentation';
import { Icons, globalStyles, getDeckColor } from '../components';

type TrendMeta = {
  label: string;
  color: string;
  icon: string;
  title: string;
};

type Severity = 'critical' | 'warning' | 'ok';

type MateriaInsight = {
  key: string;
  label: string;
  accuracy: number;
  errorRate: number;
  reviews: number;
  stability: number;
  severity: Severity;
  isWeak: boolean;
  deckId: string | null;
};

type Diagnosis = {
  headline: string;
  bullets: string[];
  tone: 'good' | 'warn' | 'bad';
};

function percent(value: number | null | undefined) {
  return value == null ? '--' : `${Math.round(value * 100)}%`;
}

function signedPoints(value: number | null) {
  if (value == null) return '--';
  return `${value > 0 ? '+' : ''}${value} pts`;
}

function accuracyFromError(errorRate: number) {
  return Math.max(0, Math.min(100, Math.round(100 - errorRate)));
}

function getSeverity(errorRate: number, isWeak: boolean): Severity {
  if (isWeak || errorRate >= 40) return 'critical';
  if (errorRate >= 25) return 'warning';
  return 'ok';
}

function severityMeta(severity: Severity) {
  if (severity === 'critical') {
    return { label: 'Crítico', color: tokens.error, bg: 'rgba(239,68,68,0.14)' };
  }
  if (severity === 'warning') {
    return { label: 'Atenção', color: tokens.warning, bg: 'rgba(245,158,11,0.14)' };
  }
  return { label: 'Estável', color: tokens.success, bg: 'rgba(16,185,129,0.14)' };
}

function getTrendMeta(trend: DashboardStats['performance']['trend']): TrendMeta {
  if (trend === 'improving') {
    return { label: 'Em alta', color: '#22c55e', icon: '↑', title: 'Você está evoluindo' };
  }
  if (trend === 'declining') {
    return { label: 'Em queda', color: tokens.warning, icon: '↓', title: 'Queda recente' };
  }
  return { label: 'Estável', color: tokens.textSecondary, icon: '→', title: 'Ritmo estável' };
}

function getWeeklyDelta(series: DashboardStats['performanceSeries']) {
  const withAccuracy = series.filter((point) => point.accuracy != null);
  if (withAccuracy.length < 2) return null;
  const first = withAccuracy[0].accuracy;
  const last = withAccuracy[withAccuracy.length - 1].accuracy;
  if (first == null || last == null) return null;
  return Math.round(last * 100) - Math.round(first * 100);
}

function getBestDay(series: DashboardStats['performanceSeries']) {
  return series.reduce<DashboardStats['performanceSeries'][number] | null>((best, point) => {
    if (point.accuracy == null) return best;
    if (!best || best.accuracy == null || point.accuracy > best.accuracy) return point;
    return best;
  }, null);
}

function findDeckForMateria(stats: DashboardStats, label: string): string | null {
  const deck = stats.focusDecks.find((d) => d.materia === label);
  return deck?.deckId ?? null;
}

function buildMateriaInsights(stats: DashboardStats): MateriaInsight[] {
  const map = new Map<string, MateriaInsight>();

  for (const topic of stats.weakTopics) {
    if (topic.type !== 'materia') continue;
    map.set(topic.label, {
      key: topic.key,
      label: topic.label,
      accuracy: accuracyFromError(topic.errorRate7d),
      errorRate: topic.errorRate7d,
      reviews: topic.totalReviews7d,
      stability: topic.avgStability,
      severity: getSeverity(topic.errorRate7d, topic.isWeak),
      isWeak: topic.isWeak,
      deckId: findDeckForMateria(stats, topic.label),
    });
  }

  for (const deck of stats.focusDecks) {
    if (!deck.materia) continue;
    const existing = map.get(deck.materia);
    if (existing && existing.errorRate >= deck.errorRate7d) continue;

    const errorRate = existing ? Math.max(existing.errorRate, deck.errorRate7d) : deck.errorRate7d;
    const isWeak = existing?.isWeak ?? deck.riskScore >= 7;

    map.set(deck.materia, {
      key: existing?.key ?? `deck-materia-${deck.deckId}`,
      label: deck.materia,
      accuracy: accuracyFromError(errorRate),
      errorRate,
      reviews: existing?.reviews ?? 0,
      stability: deck.avgStability,
      severity: getSeverity(errorRate, isWeak),
      isWeak,
      deckId: deck.deckId,
    });
  }

  return Array.from(map.values()).sort((a, b) => b.errorRate - a.errorRate);
}

function buildDiagnosis(stats: DashboardStats): Diagnosis {
  const weakMaterias = stats.weakTopics.filter((t) => t.type === 'materia' && t.isWeak);
  const weakTemas = stats.weakTopics.filter((t) => t.type === 'tema' && t.isWeak);
  const bullets: string[] = [];

  if (weakMaterias.length > 0) {
    const names = weakMaterias
      .slice(0, 3)
      .map((m) => m.label)
      .join(', ');
    bullets.push(
      weakMaterias.length === 1
        ? `${names} é sua matéria com maior taxa de erro — priorize revisão.`
        : `Priorize: ${names}. São as matérias com pior desempenho recente.`,
    );
  }

  if (weakTemas.length > 0) {
    bullets.push(
      `${weakTemas.length} tema${weakTemas.length > 1 ? 's' : ''} específico${weakTemas.length > 1 ? 's' : ''} com erro alto: ${weakTemas
        .slice(0, 2)
        .map((t) => t.label)
        .join(', ')}${weakTemas.length > 2 ? '…' : ''}.`,
    );
  }

  if (stats.distribution.overdueTotal > 0) {
    bullets.push(`${stats.distribution.overdueTotal} cards atrasados — revise antes que acumulem mais.`);
  }

  if (stats.performance.trend === 'improving') {
    bullets.push('Sua taxa de acerto subiu na última semana. Continue assim!');
  } else if (stats.performance.trend === 'declining') {
    bullets.push('Performance caiu recentemente. Foque nos pontos fracos abaixo.');
  }

  if (bullets.length === 0) {
    bullets.push('Nenhuma matéria crítica detectada. Mantenha as revisões em dia.');
  }

  let headline = 'Seu desempenho está equilibrado';
  let tone: Diagnosis['tone'] = 'good';

  if (weakMaterias.length >= 2 || (weakMaterias.length === 1 && weakMaterias[0].errorRate7d >= 35)) {
    headline = 'Estas matérias precisam da sua atenção agora';
    tone = 'bad';
  } else if (weakMaterias.length === 1 || weakTemas.length > 0 || stats.performance.trend === 'declining') {
    headline = 'Há pontos específicos para reforçar';
    tone = 'warn';
  } else if (stats.performance.trend === 'improving') {
    headline = 'Você está no caminho certo';
    tone = 'good';
  }

  return { headline, bullets, tone };
}

function getActionCopy(stats: DashboardStats) {
  if (stats.reinforcement) {
    return {
      title: `Revisar ${stats.reinforcement.materia || stats.reinforcement.deckTitle}`,
      detail: stats.reinforcement.reason,
      href: `/estudar/${stats.reinforcement.deckId}`,
      label: 'Começar revisão',
    };
  }

  const weakMateria = stats.weakTopics.find((t) => t.type === 'materia' && t.isWeak);
  if (weakMateria) {
    const deckId = findDeckForMateria(stats, weakMateria.label);
    return {
      title: `Reforçar ${weakMateria.label}`,
      detail: `${weakMateria.errorRate7d}% de erro nos últimos 7 dias.`,
      href: deckId ? `/estudar/${deckId}` : '/dashboard/decks',
      label: 'Ir para revisão',
    };
  }

  const weakTema = stats.weakTopics.find((t) => t.isWeak);
  if (weakTema) {
    return {
      title: `Atacar ${weakTema.label}`,
      detail: `${weakTema.errorRate7d}% de erro nos últimos 7 dias.`,
      href: '/dashboard/decks',
      label: 'Ver decks',
    };
  }

  if (stats.today.dueCards > 0) {
    return {
      title: 'Manter revisões em dia',
      detail: `${stats.today.dueCards} cards vencem hoje.`,
      href: '/dashboard/decks',
      label: 'Abrir decks',
    };
  }

  return {
    title: 'Gerar novo treino',
    detail: 'Use um material pronto para medir novas lacunas.',
    href: '/dashboard/runs',
    label: 'Criar treino',
  };
}

function StatTile({
  label,
  value,
  detail,
  color = '#f4f4f5',
}: {
  label: string;
  value: string;
  detail: string;
  color?: string;
}) {
  return (
    <div className="perf-stat-tile">
      <span>{label}</span>
      <strong style={{ color }}>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div className="perf-progress-track">
      <div className="perf-progress-fill" style={{ width: `${safeValue}%`, background: color }} />
    </div>
  );
}

function DiagnosisBanner({ diagnosis }: { diagnosis: Diagnosis }) {
  const toneColor =
    diagnosis.tone === 'bad' ? tokens.error : diagnosis.tone === 'warn' ? tokens.warning : tokens.success;
  const toneBg =
    diagnosis.tone === 'bad'
      ? 'rgba(239,68,68,0.08)'
      : diagnosis.tone === 'warn'
        ? 'rgba(245,158,11,0.08)'
        : 'rgba(16,185,129,0.08)';

  return (
    <section className="perf-diagnosis study-glass-card" style={{ '--tone-color': toneColor, '--tone-bg': toneBg } as CSSProperties}>
      <div className="perf-diagnosis-icon" style={{ color: toneColor, background: toneBg }}>
        <Icons.Target />
      </div>
      <div className="perf-diagnosis-body">
        <p className="study-kicker" style={{ color: toneColor }}>Seu diagnóstico</p>
        <h2>{diagnosis.headline}</h2>
        <ul>
          {diagnosis.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function AccuracyHero({ stats }: { stats: DashboardStats }) {
  const trend = getTrendMeta(stats.performance.trend);
  const delta = getWeeklyDelta(stats.performanceSeries);
  const bestDay = getBestDay(stats.performanceSeries);
  const reviewed = stats.performanceSeries.reduce((sum, point) => sum + point.reviews, 0);
  const chartSeries = performanceSeriesToChart(stats.performanceSeries, 14);
  const deltaColor = delta == null ? tokens.textPrimary : delta >= 0 ? tokens.success : tokens.error;
  const accuracyPct =
    stats.performance.recentPerformance7d != null
      ? Math.round(stats.performance.recentPerformance7d * 100)
      : 0;
  const ringColor = scoreColor(accuracyPct);

  return (
    <section className="perf-hero">
      <div className="perf-hero-ring-card study-glass-card">
        <div className="study-card-heading" style={{ marginBottom: 16 }}>
          <div>
            <p className="study-kicker" style={{ color: trend.color }}>
              {trend.icon} {trend.label}
            </p>
            <h2>{trend.title}</h2>
          </div>
        </div>

        <div
          className="study-big-ring perf-accuracy-ring"
          style={{ '--progress': `${accuracyPct}%`, '--ring-color': ringColor } as CSSProperties}
        >
          <div>
            <strong style={{ color: ringColor }}>{stats.performance.recentPerformance7d != null ? `${accuracyPct}%` : '--'}</strong>
            <span>acerto 7 dias</span>
          </div>
        </div>

        <p className="perf-hero-sub">
          {stats.performance.studyStreakDays} dias de sequência · {percent(stats.performance.recentPerformance30d)} nos últimos 30 dias
        </p>
      </div>

      <div className="perf-hero-chart-card study-glass-card">
        <div className="study-card-heading" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: tokens.accent }}><Icons.LineChart /></span>
            <div>
              <p className="study-kicker">Evolução</p>
              <h2>Taxa de acerto diária</h2>
            </div>
          </div>
        </div>
        <EvolutionLineChart series={chartSeries} accentColor={trend.color} height={200} showLabels />
      </div>

      <div className="perf-metric-strip">
        <StatTile label="Variação" value={signedPoints(delta)} detail="primeiro × último dia com revisão" color={deltaColor} />
        <StatTile
          label="Melhor dia"
          value={bestDay?.accuracy == null ? '--' : `${Math.round(bestDay.accuracy * 100)}%`}
          detail={bestDay?.label ?? 'sem revisões'}
        />
        <StatTile label="Volume" value={String(reviewed)} detail="revisões no período" />
      </div>
    </section>
  );
}

function MateriaCard({
  materia,
  onNavigate,
}: {
  materia: MateriaInsight;
  onNavigate: (href: string) => void;
}) {
  const meta = severityMeta(materia.severity);
  const color = getDeckColor(materia.key);
  const href = materia.deckId ? `/deck/${materia.deckId}` : '/dashboard/decks';

  return (
    <article className="perf-materia-card">
      <div className="perf-materia-top">
        <span className="perf-materia-icon" style={{ color, background: `${color}22` }}>
          <Icons.Cards />
        </span>
        <span className="perf-severity-pill" style={{ color: meta.color, background: meta.bg, borderColor: `${meta.color}44` }}>
          {meta.label}
        </span>
      </div>

      <h3>{materia.label}</h3>

      <div className="perf-materia-score">
        <strong style={{ color: scoreColor(materia.accuracy) }}>{materia.accuracy}%</strong>
        <span>de acerto</span>
      </div>

      <div className="perf-materia-bars">
        <div>
          <div className="perf-bar-label">
            <span>Acerto</span>
            <span style={{ color: scoreColor(materia.accuracy) }}>{materia.accuracy}%</span>
          </div>
          <ProgressBar value={materia.accuracy} color={scoreColor(materia.accuracy)} />
        </div>
        <div>
          <div className="perf-bar-label">
            <span>Erro 7d</span>
            <span style={{ color: meta.color }}>{materia.errorRate}%</span>
          </div>
          <ProgressBar value={materia.errorRate} color={meta.color} />
        </div>
      </div>

      <div className="perf-materia-meta">
        {materia.reviews > 0 && <span>{materia.reviews} revisões</span>}
        <span>{materia.stability}d estabilidade</span>
      </div>

      <button type="button" className="perf-materia-cta" onClick={() => onNavigate(href)}>
        Revisar matéria <Icons.ArrowRight />
      </button>
    </article>
  );
}

function TemaCard({ topic, index, onNavigate }: { topic: WeakTopic; index: number; onNavigate: (href: string) => void }) {
  const severity = getSeverity(topic.errorRate7d, topic.isWeak);
  const meta = severityMeta(severity);
  const accuracy = accuracyFromError(topic.errorRate7d);

  return (
    <article className="perf-tema-card">
      <div className="perf-tema-rank" style={{ color: meta.color }}>#{index + 1}</div>
      <div className="perf-tema-body">
        <div className="perf-tema-header">
          <h3>{topic.label}</h3>
          <span className="perf-severity-pill" style={{ color: meta.color, background: meta.bg, borderColor: `${meta.color}44` }}>
            {meta.label}
          </span>
        </div>
        <p className="perf-tema-detail">
          {accuracy}% de acerto · {topic.errorRate7d}% erro · {topic.totalReviews7d} revisões
        </p>
        <ProgressBar value={topic.errorRate7d} color={meta.color} />
      </div>
      <button type="button" className="perf-icon-btn" onClick={() => onNavigate('/dashboard/decks')} aria-label={`Ver decks de ${topic.label}`}>
        <Icons.ArrowRight />
      </button>
    </article>
  );
}

function FocusDeckRow({ deck, index, onOpen }: { deck: FocusDeck; index: number; onOpen: () => void }) {
  const riskColor = deck.riskScore >= 7 ? tokens.error : deck.riskScore >= 4 ? tokens.warning : tokens.success;
  const accuracy = accuracyFromError(deck.errorRate7d);

  return (
    <article className="perf-deck-row">
      <div className="perf-deck-rank">#{index + 1}</div>
      <div className="perf-deck-content">
        <div className="perf-deck-title-row">
          <h3>{deck.deckTitle}</h3>
          <span style={{ color: riskColor }}>Risco {deck.riskScore}/10</span>
        </div>
        {(deck.materia || deck.tema) && <p>{[deck.materia, deck.tema].filter(Boolean).join(' · ')}</p>}
        <div className="perf-deck-signals">
          <span style={{ color: scoreColor(accuracy) }}>{accuracy}% acerto</span>
          {deck.overdueCards > 0 && <span>{deck.overdueCards} atrasados</span>}
          {deck.leechCards > 0 && <span>{deck.leechCards} leeches</span>}
          <span>{deck.avgStability}d estabilidade</span>
        </div>
      </div>
      <button type="button" onClick={onOpen} className="perf-icon-btn" aria-label="Abrir deck">
        <Icons.ArrowRight />
      </button>
    </article>
  );
}

function ActionPanel({ stats, onNavigate }: { stats: DashboardStats; onNavigate: (href: string) => void }) {
  const action = getActionCopy(stats);
  const weakCount = stats.weakTopics.filter((t) => t.isWeak).length;
  const problemTotal =
    stats.distribution.overdueTotal +
    stats.distribution.leechTotal +
    stats.distribution.highLapses +
    stats.distribution.lowStability;

  return (
    <section className="perf-action-panel">
      <div className="perf-action-icon"><Icons.TrendingUp /></div>
      <div className="perf-action-copy">
        <span className="study-kicker">Próximo passo recomendado</span>
        <h2>{action.title}</h2>
        <p>{action.detail}</p>
      </div>
      <div className="perf-action-stats">
        <StatTile label="Pontos fracos" value={String(weakCount)} detail="temas críticos" color={weakCount > 0 ? tokens.error : tokens.success} />
        <StatTile label="Alertas" value={String(problemTotal)} detail="cards com risco" color={problemTotal > 0 ? tokens.warning : tokens.success} />
      </div>
      <button type="button" onClick={() => onNavigate(action.href)} className="perf-primary-btn">
        {action.label}
        <Icons.ArrowRight />
      </button>
    </section>
  );
}

function EmptyBlock({ title, detail, positive }: { title: string; detail: string; positive?: boolean }) {
  return (
    <div className={`perf-empty ${positive ? 'positive' : ''}`}>
      {positive && <span className="perf-empty-icon"><Icons.Trophy /></span>}
      <strong>{title}</strong>
      <span>{detail}</span>
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
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = '/login';
        return;
      }

      setUser(user);
      setLoadingUser(false);
    };

    checkUser();
  }, []);

  const diagnosis = useMemo(() => (stats ? buildDiagnosis(stats) : null), [stats]);
  const materias = useMemo(() => (stats ? buildMateriaInsights(stats) : []), [stats]);
  const weakMaterias = useMemo(() => materias.filter((m) => m.isWeak || m.severity !== 'ok'), [materias]);
  const temas = useMemo(() => stats?.weakTopics.filter((t) => t.type === 'tema').slice(0, 6) ?? [], [stats]);
  const topDecks = useMemo(() => stats?.focusDecks.slice(0, 4) ?? [], [stats]);

  if (loadingUser || loadingStats) {
    return (
      <div className="perf-loading study-dashboard-shell">
        <div className="study-dashboard-bg" />
        <div className="perf-spinner" />
        <style>{combinedPageStyles}</style>
      </div>
    );
  }

  if (!stats || !diagnosis) {
    return (
      <main className="study-dashboard-shell perf-shell">
        <div className="study-dashboard-bg" />
        <style>{combinedPageStyles}</style>
        <div className="study-dashboard-main perf-page">
          <EmptyBlock title="Sem dados ainda" detail="Revise cards ou conclua simulados para preencher este painel." />
        </div>
      </main>
    );
  }

  return (
    <div className="study-dashboard-shell perf-shell">
      <div className="study-dashboard-bg" />
      <style>{combinedPageStyles}</style>

      <main className="study-dashboard-main perf-page">
        <header className="study-home-header perf-header">
          <div>
            <p className="study-kicker">Desempenho</p>
            <h1>Onde melhorar e em quais matérias</h1>
            <p>Diagnóstico claro do que está fraco, o que evoluiu e qual revisão fazer agora.</p>
          </div>
          <div className="study-header-actions">
            <div className="study-streak-pill">
              <span className="study-pill-icon"><Icons.Flame /></span>
              <strong>{stats.performance.studyStreakDays}</strong>
              <span>dias de sequência</span>
            </div>
          </div>
        </header>

        <DiagnosisBanner diagnosis={diagnosis} />
        <AccuracyHero stats={stats} />
        <ActionPanel stats={stats} onNavigate={(href) => router.push(href)} />

        <section className="perf-grid">
          <div className="perf-section perf-section-large study-glass-card">
            <div className="perf-section-header">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span className="perf-section-icon accent"><Icons.Layers /></span>
                <div>
                  <span className="study-kicker">Matérias</span>
                  <h2>Em quais matérias você precisa melhorar</h2>
                </div>
              </div>
              <span className="perf-count-badge">{weakMaterias.length || materias.length} matérias</span>
            </div>

            {materias.length > 0 ? (
              <div className="perf-materias-grid">
                {materias.map((materia) => (
                  <MateriaCard key={materia.key} materia={materia} onNavigate={(href) => router.push(href)} />
                ))}
              </div>
            ) : (
              <EmptyBlock
                positive
                title="Nenhuma matéria crítica"
                detail="Continue revisando para o sistema mapear seu desempenho por matéria."
              />
            )}
          </div>

          <div className="perf-section study-glass-card">
            <div className="perf-section-header">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span className="perf-section-icon warn"><Icons.BarChart2 /></span>
                <div>
                  <span className="study-kicker">Carga</span>
                  <h2>O que está acumulando</h2>
                </div>
              </div>
            </div>

            <div className="perf-problem-grid">
              <StatTile
                label="Atrasados"
                value={String(stats.distribution.overdueTotal)}
                detail="cards vencidos"
                color={stats.distribution.overdueTotal > 0 ? tokens.error : tokens.success}
              />
              <StatTile
                label="Leeches"
                value={String(stats.distribution.leechTotal)}
                detail="erros repetidos"
                color={stats.distribution.leechTotal > 0 ? tokens.warning : tokens.success}
              />
              <StatTile
                label="Lapses"
                value={String(stats.distribution.highLapses)}
                detail="acima de 3"
                color={stats.distribution.highLapses > 0 ? '#fb923c' : tokens.success}
              />
              <StatTile
                label="Baixa estab."
                value={String(stats.distribution.lowStability)}
                detail="abaixo de 2 dias"
                color={stats.distribution.lowStability > 0 ? '#a78bfa' : tokens.success}
              />
            </div>

            <div className="perf-forecast">
              <div>
                <span>Hoje</span>
                <strong>{stats.forecast.dueToday}</strong>
              </div>
              <div>
                <span>Amanhã</span>
                <strong>{stats.forecast.dueTomorrow}</strong>
              </div>
              <div>
                <span>7 dias</span>
                <strong>{stats.forecast.dueNext7d}</strong>
              </div>
            </div>
          </div>
        </section>

        {temas.length > 0 && (
          <section className="perf-section study-glass-card">
            <div className="perf-section-header">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span className="perf-section-icon accent"><Icons.FileQuestion /></span>
                <div>
                  <span className="study-kicker">Temas</span>
                  <h2>Tópicos específicos com mais erro</h2>
                </div>
              </div>
            </div>
            <div className="perf-temas-list">
              {temas.map((topic, index) => (
                <TemaCard key={topic.key} topic={topic} index={index} onNavigate={(href) => router.push(href)} />
              ))}
            </div>
          </section>
        )}

        <section className="perf-section study-glass-card">
          <div className="perf-section-header">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span className="perf-section-icon accent"><Icons.Cards /></span>
              <div>
                <span className="study-kicker">Prioridade</span>
                <h2>Decks que mais precisam de revisão</h2>
              </div>
            </div>
          </div>

          {topDecks.length > 0 ? (
            <div className="perf-deck-list">
              {topDecks.map((deck, index) => (
                <FocusDeckRow
                  key={deck.deckId}
                  deck={deck}
                  index={index}
                  onOpen={() => router.push(`/deck/${deck.deckId}`)}
                />
              ))}
            </div>
          ) : (
            <EmptyBlock positive title="Nenhum deck crítico" detail="Os decks ativos não estão mostrando risco relevante agora." />
          )}
        </section>
      </main>
    </div>
  );
}

const pageStyles = `
  .perf-shell { min-height: 100vh; }
  .perf-page { width: 100%; max-width: 1340px; color: #f4f4f5; gap: 18px; }
  .perf-header { margin-bottom: 0; }

  .perf-loading {
    min-height: calc(100vh - 64px);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .perf-spinner {
    position: relative;
    z-index: 1;
    width: 46px;
    height: 46px;
    border: 3px solid rgba(255,255,255,0.1);
    border-top-color: #8b5cf6;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .perf-diagnosis {
    display: flex;
    gap: 20px;
    align-items: flex-start;
    padding: 24px 28px !important;
    border-color: color-mix(in srgb, var(--tone-color) 30%, rgba(148,163,184,0.15)) !important;
    background:
      linear-gradient(135deg, var(--tone-bg), transparent 55%),
      linear-gradient(145deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012)),
      rgba(14, 17, 29, 0.76) !important;
  }

  .perf-diagnosis-icon {
    width: 52px;
    height: 52px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 14px;
  }

  .perf-diagnosis-body { position: relative; z-index: 1; min-width: 0; }
  .perf-diagnosis-body h2 {
    margin: 4px 0 12px;
    font-size: 24px;
    font-weight: 800;
    line-height: 1.2;
    color: #fff;
  }

  .perf-diagnosis-body ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .perf-diagnosis-body li {
    position: relative;
    padding-left: 18px;
    color: #c5cdd9;
    font-size: 14px;
    line-height: 1.5;
  }

  .perf-diagnosis-body li::before {
    content: "";
    position: absolute;
    left: 0;
    top: 8px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--tone-color);
    box-shadow: 0 0 10px var(--tone-color);
  }

  .perf-hero {
    display: grid;
    grid-template-columns: minmax(280px, 0.85fr) minmax(420px, 1.15fr);
    gap: 18px;
    align-items: stretch;
  }

  .perf-hero-ring-card,
  .perf-hero-chart-card {
    min-width: 0;
  }

  .perf-accuracy-ring {
    background:
      radial-gradient(circle at center, #101320 0 56%, transparent 57%),
      conic-gradient(var(--ring-color) var(--progress), rgba(148, 163, 184, 0.15) 0) !important;
    box-shadow:
      0 0 40px color-mix(in srgb, var(--ring-color) 35%, transparent),
      inset 0 0 0 14px rgba(255,255,255,0.02) !important;
  }

  .perf-hero-sub {
    position: relative;
    z-index: 1;
    margin: 18px 0 0;
    text-align: center;
    color: #a8b0c2;
    font-size: 13px;
    line-height: 1.5;
  }

  .perf-metric-strip {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .perf-stat-tile {
    position: relative;
    z-index: 1;
    padding: 16px;
    border-radius: 8px;
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(148, 163, 184, 0.11);
  }

  .perf-stat-tile span {
    display: block;
    color: #9aa4b8;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    margin-bottom: 8px;
  }

  .perf-stat-tile strong {
    display: block;
    color: #ffffff;
    font-size: 28px;
    line-height: 1;
    font-weight: 800;
    margin-bottom: 7px;
  }

  .perf-stat-tile small {
    display: block;
    color: #8b96aa;
    font-size: 12px;
    line-height: 1.35;
  }

  .perf-action-panel {
    display: grid;
    grid-template-columns: auto minmax(240px, 1fr) minmax(220px, 0.7fr) auto;
    gap: 18px;
    align-items: center;
    padding: 22px 24px;
    border-radius: 8px;
    background:
      linear-gradient(135deg, rgba(124, 58, 237, 0.16), rgba(16, 185, 129, 0.07)),
      rgba(14, 17, 29, 0.74);
    border: 1px solid rgba(148, 163, 184, 0.14);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
    backdrop-filter: blur(18px);
  }

  .perf-action-icon {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    color: #a78bfa;
    background: rgba(124, 58, 237, 0.18);
    flex-shrink: 0;
  }

  .perf-action-copy h2 {
    font-size: 20px;
    font-weight: 800;
    margin: 4px 0 6px;
    color: #fff;
  }

  .perf-action-copy p {
    margin: 0;
    color: #a8b0c2;
    font-size: 14px;
    line-height: 1.5;
  }

  .perf-action-stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .perf-primary-btn,
  .perf-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    cursor: pointer;
    color: white;
  }

  .perf-primary-btn {
    gap: 10px;
    padding: 13px 18px;
    border-radius: 12px;
    background: linear-gradient(135deg, #8b5cf6 0%, #5b21b6 100%);
    font-size: 14px;
    font-weight: 800;
    white-space: nowrap;
    min-height: 46px;
    box-shadow: 0 18px 42px rgba(91, 33, 182, 0.3);
    flex-shrink: 0;
  }

  .perf-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(300px, 0.7fr);
    gap: 18px;
    align-items: start;
  }

  .perf-section {
    min-width: 0;
    padding: 22px !important;
  }

  .perf-section-large { min-height: 100%; }

  .perf-section-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 18px;
    position: relative;
    z-index: 1;
  }

  .perf-section-header h2 {
    font-size: 20px;
    font-weight: 800;
    margin: 4px 0 0;
    color: #fff;
    line-height: 1.2;
  }

  .perf-section-icon {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    flex-shrink: 0;
  }

  .perf-section-icon.accent { color: #a78bfa; background: rgba(124, 58, 237, 0.16); }
  .perf-section-icon.warn { color: #fbbf24; background: rgba(245, 158, 11, 0.14); }

  .perf-count-badge {
    flex-shrink: 0;
    padding: 6px 10px;
    border-radius: 999px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(148, 163, 184, 0.12);
    color: #a8b0c2;
    font-size: 12px;
    font-weight: 700;
  }

  .perf-materias-grid {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 14px;
  }

  .perf-materia-card {
    padding: 18px;
    border-radius: 12px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(148, 163, 184, 0.12);
    transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
  }

  .perf-materia-card:hover {
    border-color: rgba(167, 139, 250, 0.35);
    transform: translateY(-2px);
    box-shadow: 0 12px 32px rgba(0,0,0,0.22);
  }

  .perf-materia-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .perf-materia-icon {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
  }

  .perf-severity-pill {
    padding: 4px 9px;
    border-radius: 999px;
    border: 1px solid;
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .perf-materia-card h3 {
    margin: 0 0 10px;
    font-size: 17px;
    font-weight: 800;
    color: #fff;
    line-height: 1.25;
  }

  .perf-materia-score {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-bottom: 14px;
  }

  .perf-materia-score strong {
    font-size: 32px;
    font-weight: 900;
    line-height: 1;
  }

  .perf-materia-score span {
    color: #8b96aa;
    font-size: 13px;
  }

  .perf-materia-bars {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 12px;
  }

  .perf-bar-label {
    display: flex;
    justify-content: space-between;
    margin-bottom: 5px;
    font-size: 11px;
    font-weight: 700;
    color: #9aa4b8;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .perf-materia-meta {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 14px;
  }

  .perf-materia-meta span {
    color: #a8b0c2;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(148, 163, 184, 0.09);
    border-radius: 999px;
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 700;
  }

  .perf-materia-cta {
    width: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 14px;
    border: 1px solid rgba(167, 139, 250, 0.25);
    border-radius: 10px;
    background: rgba(124, 58, 237, 0.12);
    color: #d8ccff;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.18s ease;
  }

  .perf-materia-cta:hover { background: rgba(124, 58, 237, 0.22); }

  .perf-progress-track {
    width: 100%;
    height: 7px;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.14);
    overflow: hidden;
  }

  .perf-progress-fill {
    height: 100%;
    border-radius: inherit;
    transition: width 0.4s ease;
  }

  .perf-problem-grid {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 12px;
  }

  .perf-forecast {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .perf-forecast div {
    border-radius: 8px;
    padding: 14px;
    background: rgba(124, 58, 237, 0.1);
    border: 1px solid rgba(167, 139, 250, 0.14);
  }

  .perf-forecast span {
    display: block;
    color: #a8b0c2;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    margin-bottom: 6px;
  }

  .perf-forecast strong {
    font-size: 24px;
    font-weight: 900;
    color: #ffffff;
  }

  .perf-temas-list,
  .perf-deck-list {
    position: relative;
    z-index: 1;
    display: grid;
    gap: 12px;
  }

  .perf-tema-card,
  .perf-deck-row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px;
    border-radius: 10px;
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(148, 163, 184, 0.11);
    transition: border-color 0.18s ease, background 0.18s ease;
  }

  .perf-tema-card:hover,
  .perf-deck-row:hover {
    border-color: rgba(167, 139, 250, 0.26);
    background: rgba(255,255,255,0.038);
  }

  .perf-tema-rank,
  .perf-deck-rank {
    width: 34px;
    flex: 0 0 34px;
    text-align: center;
    font-size: 15px;
    font-weight: 900;
    color: #a78bfa;
  }

  .perf-tema-body,
  .perf-deck-content {
    flex: 1;
    min-width: 0;
  }

  .perf-tema-header,
  .perf-deck-title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 6px;
  }

  .perf-tema-header h3,
  .perf-deck-title-row h3 {
    font-size: 15px;
    font-weight: 800;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #fff;
  }

  .perf-tema-detail,
  .perf-deck-content p {
    color: #8b96aa;
    margin: 0 0 8px;
    font-size: 12px;
  }

  .perf-deck-title-row span {
    flex: 0 0 auto;
    font-size: 12px;
    font-weight: 900;
  }

  .perf-deck-signals {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .perf-deck-signals span {
    color: #a8b0c2;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(148, 163, 184, 0.09);
    border-radius: 999px;
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 700;
  }

  .perf-icon-btn {
    width: 38px;
    height: 38px;
    border-radius: 8px;
    background: rgba(255,255,255,0.06);
    color: #f4f4f5;
    flex: 0 0 auto;
  }

  .perf-empty {
    position: relative;
    z-index: 1;
    display: grid;
    place-items: center;
    text-align: center;
    gap: 8px;
    min-height: 160px;
    border: 1px dashed rgba(148, 163, 184, 0.22);
    border-radius: 8px;
    color: #f4f4f5;
    padding: 24px;
  }

  .perf-empty.positive { border-color: rgba(16, 185, 129, 0.28); }
  .perf-empty strong { font-size: 16px; }
  .perf-empty span { color: #a8b0c2; font-size: 14px; line-height: 1.5; max-width: 360px; }

  .perf-empty-icon {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: #10b981;
    background: rgba(16, 185, 129, 0.14);
  }

  @media (max-width: 1080px) {
    .perf-hero,
    .perf-grid,
    .perf-action-panel {
      grid-template-columns: 1fr;
    }

    .perf-action-panel { align-items: stretch; }
    .perf-primary-btn { width: 100%; }
  }

  @media (max-width: 720px) {
    .perf-page { padding: 22px 12px 36px; }

    .perf-diagnosis {
      flex-direction: column;
      padding: 20px !important;
    }

    .perf-metric-strip,
    .perf-action-stats,
    .perf-problem-grid,
    .perf-forecast {
      grid-template-columns: 1fr;
    }

    .perf-materias-grid { grid-template-columns: 1fr; }

    .perf-tema-card,
    .perf-deck-row {
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .perf-icon-btn { width: 100%; }
  }
`;

const combinedPageStyles = `${globalStyles}\n${STUDY_DASHBOARD_RESPONSIVE_CSS}\n${pageStyles}`;

export default function DesempenhoPage() {
  return (
    <Suspense>
      <DesempenhoPageInner />
    </Suspense>
  );
}

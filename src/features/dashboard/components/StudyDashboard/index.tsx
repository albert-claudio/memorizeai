'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { CSSProperties, ReactNode } from 'react';
import type { Simulado } from '@/app/dashboard/components/SimuladoCard';
import { Icons } from '@/app/dashboard/components/Icons';
import { ProgressRing } from '@/app/dashboard/components/ProgressRing';
import { getDeckColor } from '@/app/dashboard/components/styles';
import { BillingBanner } from '@/components/BillingBanner';
import type { DashboardStats } from '@/features/dashboard/hooks/useDashboardStats';
import type { Deck } from '@/lib/types';
import { STUDY_DASHBOARD_RESPONSIVE_CSS } from './studyDashboardResponsive';
import { tokens } from './tokens';
import {
  buildHeroAction,
  findPendingSimulado,
  retentionLevel,
} from '@/features/dashboard/utils/dashboardPresentation';

export interface StudyDashboardProps {
  stats: DashboardStats;
  decks: Deck[];
  cardCounts: Record<string, number>;
  simulados: Simulado[];
  userName?: string;
}

interface DashboardCardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

interface SubjectRow {
  id: string;
  title: string;
  subtitle: string;
  percent: number;
  color: string;
  href: string;
}

interface WeekDay {
  weekday: string;
  day: string;
  isToday: boolean;
}

const compactFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

function DashboardCard({ children, className = '', style }: DashboardCardProps) {
  return (
    <section className={`study-glass-card ${className}`} style={style}>
      {children}
    </section>
  );
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function percentFromRatio(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return 0;
  return clamp(Math.round(value * 100));
}

function cleanTitle(title: string): string {
  return title.replace(/\.(pdf|docx|pptx|txt)$/i, '');
}

function buildWeekDays(): WeekDay[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  const formatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today.getTime() + (index - 2) * dayMs);
    return {
      weekday: formatter.format(date).replace('.', '').slice(0, 3).toUpperCase(),
      day: String(date.getDate()).padStart(2, '0'),
      isToday: date.getTime() === today.getTime(),
    };
  });
}

function buildSubjectRows(
  decks: Deck[],
  cardCounts: Record<string, number>,
  stats: DashboardStats,
): SubjectRow[] {
  const focusRows = stats.focusDecks.slice(0, 4).map((deck) => {
    const percent = clamp(Math.round(100 - deck.riskScore * 9));
    return {
      id: deck.deckId,
      title: deck.materia || cleanTitle(deck.deckTitle),
      subtitle: deck.tema || deck.concurso || `${deck.overdueCards} cards em atenção`,
      percent,
      color: getDeckColor(deck.deckId),
      href: `/deck/${deck.deckId}`,
    };
  });

  if (focusRows.length >= 3) return focusRows;

  const existingIds = new Set(focusRows.map((row) => row.id));
  const deckRows = decks
    .filter((deck) => !existingIds.has(deck.id))
    .slice(0, 4 - focusRows.length)
    .map((deck) => {
      const retention = retentionLevel(deck.id, stats.focusDecks);
      const fallbackPercent = retention.level === 'high' ? 88 : retention.level === 'medium' ? 66 : 42;
      return {
        id: deck.id,
        title: deck.materia || cleanTitle(deck.title),
        subtitle: deck.tema || `${cardCounts[deck.id] ?? 0} cards`,
        percent: fallbackPercent,
        color: getDeckColor(deck.id),
        href: `/deck/${deck.id}`,
      };
    });

  return [...focusRows, ...deckRows];
}

function getInitial(name?: string): string {
  return (name?.trim().charAt(0) || 'A').toUpperCase();
}

export function StudyDashboard({ stats, decks, cardCounts, simulados, userName }: StudyDashboardProps) {
  const router = useRouter();
  const pendingSimuladoId = findPendingSimulado(simulados);
  const hero = buildHeroAction(stats, decks, pendingSimuladoId);
  const weekDays = useMemo(() => buildWeekDays(), []);
  const subjects = useMemo(() => buildSubjectRows(decks, cardCounts, stats), [cardCounts, decks, stats]);

  const totalCards = Object.values(cardCounts).reduce((sum, count) => sum + count, 0);
  const retentionPercent = percentFromRatio(
    stats.performance.recentPerformance7d ??
      stats.performance.recentPerformance30d ??
      stats.simulados.recentAverage,
  );
  const evolutionPercent = retentionPercent || percentFromRatio(stats.simulados.lastScore);
  const reviewedToday = stats.today.reviewedToday;
  const dueCards = stats.today.dueCards;
  const dueTomorrow = stats.forecast.dueTomorrow;
  const dueWeek = stats.forecast.dueNext7d;
  const longestSignal = Math.max(stats.performance.studyStreakDays, 0);
  const currentDayLabel = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(new Date());

  return (
    <div className="study-dashboard-shell">
      <style>{STUDY_DASHBOARD_RESPONSIVE_CSS}</style>

      <div className="study-dashboard-bg" />

      <div className="study-dashboard-banner-wrap">
        <BillingBanner />
      </div>

      <main className="study-dashboard-main">
        <header className="study-home-header">
          <div>
            <p className="study-kicker">Painel de estudos</p>
            <h1>Olá{userName ? `, ${userName}` : ''}. Bora avançar hoje?</h1>
            <p>Veja sua revisão, domínio das matérias e próximos passos em um só lugar.</p>
          </div>

          <div className="study-header-actions">
            <div className="study-streak-pill" aria-label={`${stats.performance.studyStreakDays} dias de sequência`}>
              <span className="study-pill-icon"><Icons.Flame /></span>
              <strong>{stats.performance.studyStreakDays}</strong>
              <span>dias de sequência</span>
            </div>
            <button
              type="button"
              className="study-avatar-button"
              aria-label="Abrir configurações"
              onClick={() => router.push('/dashboard/settings')}
            >
              {getInitial(userName)}
            </button>
          </div>
        </header>

        <div className="study-dashboard-grid">
          <DashboardCard className="study-progress-card">
            <div className="study-card-heading">
              <div>
                <p className="study-kicker">Seu progresso</p>
                <h2>Evolução da preparação</h2>
              </div>
              <span className="study-soft-badge">{stats.performance.trend === 'improving' ? 'em alta' : 'ativo'}</span>
            </div>

            <div className="study-progress-content">
              <div
                className="study-big-ring"
                style={{ '--progress': `${evolutionPercent}%` } as CSSProperties}
              >
                <div>
                  <strong>{evolutionPercent}%</strong>
                  <span>de evolução</span>
                </div>
              </div>

              <div className="study-progress-stats">
                <div>
                  <span>Cards estudados</span>
                  <strong>{compactFormatter.format(totalCards)}</strong>
                </div>
                <div>
                  <span>Retenção média</span>
                  <strong className="study-success-text">{retentionPercent || '--'}{retentionPercent ? '%' : ''}</strong>
                </div>
                <div className="study-wide-stat">
                  <span>Sequência atual</span>
                  <strong>{stats.performance.studyStreakDays} dias</strong>
                </div>
              </div>
            </div>
          </DashboardCard>

          <DashboardCard className="study-review-card">
            <div className="study-review-visual" aria-hidden="true">
              <span />
              <span />
              <span />
              <div><Icons.Check /></div>
            </div>

            <div className="study-card-heading">
              <div>
                <p className="study-kicker">Revisão de hoje</p>
                <h2>{dueCards > 0 ? `${dueCards} cards para revisar` : 'Tudo em dia por aqui'}</h2>
                <p className="study-card-subtitle">
                  {hero.estimatedMinutes} min estimados para manter a curva de memória forte.
                </p>
              </div>
            </div>

            <div className="study-review-stats">
              <div>
                <span>Feitos hoje</span>
                <strong>{reviewedToday}</strong>
              </div>
              <div>
                <span>Para revisar</span>
                <strong>{dueCards}</strong>
              </div>
              <div>
                <span>Domínio</span>
                <strong>{retentionPercent || '--'}{retentionPercent ? '%' : ''}</strong>
              </div>
            </div>

            <button type="button" className="study-primary-action" onClick={() => router.push(hero.reviewPath)}>
              <span>Iniciar revisão</span>
              <Icons.ArrowRight />
            </button>
          </DashboardCard>

          <DashboardCard className="study-calendar-card">
            <div className="study-card-heading">
              <div>
                <p className="study-kicker">Calendário</p>
                <h2>Ritmo semanal</h2>
              </div>
              <button type="button" className="study-link-button" onClick={() => router.push('/dashboard/performance')}>
                Ver desempenho <Icons.ArrowRight />
              </button>
            </div>

            <div className="study-week-strip">
              {weekDays.map((day) => (
                <div key={`${day.weekday}-${day.day}`} className={day.isToday ? 'active' : ''}>
                  <span>{day.weekday}</span>
                  <strong>{day.day}</strong>
                </div>
              ))}
            </div>

            <div className="study-calendar-callout">
              <div className="study-icon-tile accent"><Icons.Calendar /></div>
              <div>
                <strong>{currentDayLabel}</strong>
                <span>{dueTomorrow} cards previstos para amanhã.</span>
              </div>
              <div className="study-mini-badge">
                <strong>{dueWeek}</strong>
                <span>em 7 dias</span>
              </div>
            </div>
          </DashboardCard>

          <DashboardCard className="study-subjects-card">
            <div className="study-card-heading">
              <div>
                <p className="study-kicker">Matérias</p>
                <h2>Focos ativos</h2>
              </div>
              <button type="button" className="study-link-button" onClick={() => router.push('/dashboard/decks')}>
                Ver decks <Icons.ArrowRight />
              </button>
            </div>

            {subjects.length === 0 ? (
              <div className="study-empty-panel">
                <p>Crie seu primeiro deck para acompanhar matérias, retenção e revisão diária.</p>
                <button type="button" onClick={() => router.push('/dashboard/decks')}>
                  Criar deck
                </button>
              </div>
            ) : (
              <div className="study-subject-list">
                {subjects.map((subject) => (
                  <button key={subject.id} type="button" onClick={() => router.push(subject.href)}>
                    <span className="study-subject-icon" style={{ color: subject.color, background: `${subject.color}22` }}>
                      <Icons.Cards />
                    </span>
                    <span className="study-subject-copy">
                      <strong>{subject.title}</strong>
                      <small>{subject.subtitle}</small>
                    </span>
                    <span className="study-subject-bar">
                      <i style={{ width: `${subject.percent}%`, background: subject.color }} />
                    </span>
                    <span className="study-subject-percent">{subject.percent}%</span>
                    <Icons.ArrowRight />
                  </button>
                ))}
              </div>
            )}
          </DashboardCard>
        </div>

        <section className="study-bottom-metrics" aria-label="Resumo rápido">
          <div>
            <span className="study-icon-tile violet"><Icons.TrendingUp /></span>
            <p>Tempo de revisão</p>
            <strong>{Math.max(1, Math.ceil((reviewedToday || dueCards || 1) * 0.6))} min</strong>
            <small>estimativa de hoje</small>
          </div>
          <div>
            <span className="study-icon-tile pink"><Icons.Target /></span>
            <p>Meta semanal</p>
            <strong>{clamp(Math.round((reviewedToday / Math.max(dueCards + reviewedToday, 1)) * 100))}%</strong>
            <small>concluída hoje</small>
          </div>
          <div>
            <span className="study-icon-tile amber"><Icons.Flame /></span>
            <p>Sequência mais longa</p>
            <strong>{longestSignal} dias</strong>
            <small>recorde atual</small>
          </div>
          <div>
            <span className="study-icon-tile green"><Icons.Trophy /></span>
            <p>Simulados</p>
            <strong>{simulados.length}</strong>
            <small>no histórico</small>
          </div>
        </section>

        <section className="study-action-band">
          <div>
            <p className="study-kicker">Próxima ação recomendada</p>
            <h2>{hero.title}</h2>
            <span>
              {hero.dueCards > 0 ? `${hero.dueCards} cards pendentes · ` : ''}
              Prioridade {hero.priority} · {hero.estimatedMinutes} min
            </span>
          </div>
          <div className="study-action-band-buttons">
            <button type="button" onClick={() => router.push(hero.reviewPath)}>
              <Icons.Play />
              Revisar agora
            </button>
            <button type="button" onClick={() => router.push(hero.simuladoPath)}>
              <Icons.FileQuestion />
              Simulado
            </button>
          </div>
          <div className="study-mini-ring">
            <ProgressRing
              percentage={percentFromRatio(stats.simulados.lastScore)}
              size={74}
              strokeWidth={7}
              color={tokens.accent}
            />
            <span>último simulado</span>
          </div>
        </section>
      </main>
    </div>
  );
}

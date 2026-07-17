import type { Simulado } from '@/app/dashboard/components/SimuladoCard';
import type { DashboardStats, FocusDeck } from '@/features/dashboard/hooks/useDashboardStats';
import type { Deck } from '@/lib/types';
import { tokens } from '@/features/dashboard/components/StudyDashboard/tokens';

export type RetentionLevel = 'low' | 'medium' | 'high';

export interface RetentionInfo {
  level: RetentionLevel;
  label: string;
  color: string;
}

export interface HeroAction {
  title: string;
  topicLabel: string;
  dueCards: number;
  estimatedMinutes: number;
  priority: 'alta' | 'media' | 'baixa';
  reviewDeckId: string | null;
  reviewPath: string;
  simuladoPath: string;
}

export interface ChartPoint {
  day: string;
  label: string;
  value: number | null;
  hasData: boolean;
}

export function scoreColor(percent: number): string {
  if (percent >= 70) return tokens.success;
  if (percent >= 40) return tokens.warning;
  return tokens.error;
}

export function simuladoScorePercent(sim: Simulado): number | null {
  if (sim.status !== 'concluido' || sim.total_questoes <= 0) return null;
  return Math.round(((sim.acertos || 0) / sim.total_questoes) * 100);
}

export function formatSimuladoTitle(sim: Simulado): string {
  let name = sim.titulo || 'Simulado';
  if (name.toLowerCase().endsWith('.pdf') || name.toLowerCase().endsWith('.docx') || name.toLowerCase().endsWith('.pptx')) {
    name = name.substring(0, name.lastIndexOf('.'));
  }
  if (name.toLowerCase().includes('documento sem t')) name = 'Simulado Gerado';
  if (!name.toLowerCase().includes('simulado')) return `Simulado de ${name}`;
  return name;
}

export function estimateReviewMinutes(cardCount: number): number {
  return Math.max(1, Math.ceil(cardCount * 0.6));
}

export function retentionLevel(deckId: string, focusDecks: FocusDeck[]): RetentionInfo {
  const fd = focusDecks.find((d) => d.deckId === deckId);
  if (!fd || fd.riskScore <= 2) {
    return { level: 'high', label: 'Retenção alta', color: tokens.success };
  }
  if (fd.riskScore <= 6) {
    return { level: 'medium', label: 'Retenção média', color: tokens.warning };
  }
  return { level: 'low', label: 'Retenção baixa', color: tokens.error };
}

export function buildHeroAction(
  stats: DashboardStats | null,
  decks: Deck[],
  pendingSimuladoId?: string | null,
): HeroAction {
  const firstDeckId = decks[0]?.id ?? null;
  const dueCards = stats?.today.dueCards ?? 0;
  const reinforcement = stats?.reinforcement;
  const weakTopic = stats?.weakTopics.find((t) => t.isWeak);

  let topicLabel = '';
  let title = 'Gere um simulado a partir do seu material';
  let reviewDeckId: string | null = firstDeckId;
  let priority: HeroAction['priority'] = 'baixa';

  if (reinforcement) {
    topicLabel = reinforcement.materia || reinforcement.deckTitle;
    title = `Revise ${topicLabel}`;
    reviewDeckId = reinforcement.deckId;
    priority = reinforcement.reasonType === 'high_error' || reinforcement.overdueCards > 5 ? 'alta' : 'media';
  } else if (weakTopic) {
    const matchingDeck = decks.find((deck) =>
      weakTopic.type === 'materia' ? deck.materia === weakTopic.label : deck.tema === weakTopic.label,
    );
    topicLabel = weakTopic.label;
    title = `Revise ${topicLabel}`;
    reviewDeckId = matchingDeck?.id ?? firstDeckId;
    priority = weakTopic.errorRate7d > 40 ? 'alta' : 'media';
  } else if (dueCards > 0) {
    topicLabel = 'cards vencidos';
    title = `Revise ${dueCards} cards vencidos`;
    priority = dueCards > 15 ? 'alta' : 'media';
  }

  const cardCountForEstimate = reinforcement?.overdueCards ?? dueCards;
  const reviewPath = reviewDeckId ? `/estudar/${reviewDeckId}` : '/dashboard/decks';
  const simuladoPath = pendingSimuladoId
    ? `/simulado/${pendingSimuladoId}`
    : '/dashboard/runs';

  return {
    title,
    topicLabel,
    dueCards: reinforcement?.overdueCards ?? dueCards,
    estimatedMinutes: estimateReviewMinutes(cardCountForEstimate || dueCards || 5),
    priority,
    reviewDeckId,
    reviewPath,
    simuladoPath,
  };
}

function getDayString(ms: number, tzOffset = 0): string {
  const d = new Date(ms - tzOffset * 60000);
  return d.toISOString().split('T')[0];
}

function buildDayLabel(dayStartMs: number, tzOffset = 0): string {
  const weekdayFormatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' });
  const shifted = new Date(dayStartMs - tzOffset * 60000);
  return weekdayFormatter.format(shifted).replace('.', '').slice(0, 3).toUpperCase();
}

export function buildSimuladoSeries(
  simulados: Simulado[],
  rangeDays: 7 | 14,
  startOfDay: number,
  tzOffset = 0,
): ChartPoint[] {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const completed = simulados.filter(
    (s) => s.status === 'concluido' && s.total_questoes > 0,
  );

  const byDay: Record<string, number[]> = {};
  completed.forEach((sim) => {
    const day = getDayString(sim.created_at, tzOffset);
    const score = ((sim.acertos || 0) / sim.total_questoes) * 100;
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(score);
  });

  return Array.from({ length: rangeDays }, (_, index) => {
    const dayStartMs = startOfDay - (rangeDays - 1 - index) * DAY_MS;
    const day = getDayString(dayStartMs, tzOffset);
    const scores = byDay[day];
    const avg =
      scores && scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null;

    return {
      day,
      label: buildDayLabel(dayStartMs, tzOffset),
      value: avg,
      hasData: avg !== null,
    };
  });
}

export function performanceSeriesToChart(
  series: DashboardStats['performanceSeries'],
  rangeDays: 7 | 14,
): ChartPoint[] {
  const sliced = series.slice(-rangeDays);
  return sliced.map((point) => ({
    day: point.day,
    label: point.label,
    value: point.accuracy == null ? null : Math.round(point.accuracy * 100),
    hasData: point.accuracy !== null,
  }));
}

export function getCompletedSimulados(simulados: Simulado[], limit = 4): Simulado[] {
  return simulados
    .filter((s) => s.status === 'concluido' && s.total_questoes > 0)
    .slice(0, limit);
}

export function findPendingSimulado(simulados: Simulado[]): string | null {
  const pending = simulados.find(
    (s) => s.status !== 'concluido' && s.status !== 'cancelado',
  );
  return pending?.id ?? null;
}

export function stabilityLabel(avgStability: number): string {
  if (avgStability < 2) return 'estabilidade baixa';
  if (avgStability < 5) return 'estabilidade média';
  return 'estabilidade alta';
}

export function priorityLabel(priority: HeroAction['priority']): string {
  if (priority === 'alta') return 'prioridade alta';
  if (priority === 'media') return 'prioridade média';
  return 'prioridade baixa';
}

export function priorityColor(priority: HeroAction['priority']): string {
  if (priority === 'alta') return tokens.error;
  if (priority === 'media') return tokens.warning;
  return tokens.textSecondary;
}

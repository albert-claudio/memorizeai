import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================================
// TYPES
// ============================================================================

interface RawDeck {
  id: string;
  title: string;
  concurso: string | null;
  materia: string | null;
  tema: string | null;
}

interface RawCard {
  id: string;
  deck_id: string;
  next_review_at: number | null;
  is_leech: boolean;
  lapses: number;
  difficulty: number;
  stability: number;
}

interface RawReview {
  card_id: string;
  grade: number;
  reviewed_at: number;
}

interface RawSimulado {
  status: string;
  acertos: number | null;
  total_questoes: number;
}

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
  riskScore: number;
}

export interface WeakTopic {
  key: string;
  label: string;
  type: 'materia' | 'tema';
  errorRate7d: number;
  errorRate30d: number;
  totalReviews7d: number;
  avgLapses: number;
  avgDifficulty: number;
  avgStability: number;
  isWeak: boolean;
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

export interface DashboardStatsPayload {
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

// ============================================================================
// PURE COMPUTATION — testable without DB
// ============================================================================

export function computeDashboardStats(
  decks: RawDeck[],
  cards: RawCard[],
  reviews: RawReview[],
  simulados: RawSimulado[],
  reviewedTodayCount: number,
  now: number,
  tzOffset: number,
  startOfDay: number,
): DashboardStatsPayload {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const sevenDaysAgo = now - 7 * DAY_MS;
  const thirtyDaysAgo = now - 30 * DAY_MS;
  const weekdayFormatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' });

  // ── card_id → deck_id lookup ─────────────────────────────────────────────
  const cardIdToDeckId: Record<string, string> = {};
  cards.forEach(c => { cardIdToDeckId[c.id] = c.deck_id; });

  // ── Per-deck card stats ──────────────────────────────────────────────────
  interface DeckAcc {
    overdue: number; leech: number; totalCards: number;
    sumLapses: number; sumDifficulty: number; sumStability: number;
  }
  const deckCardStats: Record<string, DeckAcc> = {};
  decks.forEach(d => {
    deckCardStats[d.id] = { overdue: 0, leech: 0, totalCards: 0, sumLapses: 0, sumDifficulty: 0, sumStability: 0 };
  });

  // ── Distribution counters (from ALL active cards) ────────────────────────
  let overdueTotal = 0;
  let leechTotal = 0;
  let highLapses = 0;
  let lowStability = 0;
  let totalDueCards = 0;

  cards.forEach(card => {
    const isOverdue = card.next_review_at !== null && card.next_review_at <= now;
    if (isOverdue) totalDueCards++;
    if (isOverdue) overdueTotal++;
    if (card.is_leech) leechTotal++;
    if ((card.lapses ?? 0) > 3) highLapses++;
    if (card.stability < 2) lowStability++;

    const ds = deckCardStats[card.deck_id];
    if (ds) {
      if (isOverdue) ds.overdue++;
      if (card.is_leech) ds.leech++;
      ds.totalCards++;
      ds.sumLapses += (card.lapses ?? 0);
      ds.sumDifficulty += (card.difficulty ?? 5);
      ds.sumStability += (card.stability ?? 0);
    }
  });

  // ── Per-deck review aggregation (7d + 30d) ───────────────────────────────
  interface DeckRevAcc { total7d: number; errors7d: number; total30d: number; errors30d: number; }
  const deckRevStats: Record<string, DeckRevAcc> = {};

  reviews.forEach(r => {
    const dId = cardIdToDeckId[r.card_id];
    if (!dId) return;
    if (!deckRevStats[dId]) deckRevStats[dId] = { total7d: 0, errors7d: 0, total30d: 0, errors30d: 0 };
    const agg = deckRevStats[dId];
    if (r.reviewed_at >= thirtyDaysAgo) {
      agg.total30d++;
      if (r.grade < 2) agg.errors30d++;
    }
    if (r.reviewed_at >= sevenDaysAgo) {
      agg.total7d++;
      if (r.grade < 2) agg.errors7d++;
    }
  });

  // ── focusDecks ───────────────────────────────────────────────────────────
  const focusDecks: FocusDeck[] = decks.map(deck => {
    const ds = deckCardStats[deck.id] || { overdue: 0, leech: 0, totalCards: 0, sumLapses: 0, sumDifficulty: 0, sumStability: 0 };
    const n = ds.totalCards || 1;
    const avgLapses = ds.sumLapses / n;
    const avgDifficulty = ds.sumDifficulty / n;
    const avgStability = ds.sumStability / n;

    const revAgg = deckRevStats[deck.id];
    const errorRate7d = revAgg && revAgg.total7d > 0 ? revAgg.errors7d / revAgg.total7d : 0;

    const riskScore =
      ds.overdue * 1.0 +
      ds.leech * 2.0 +
      avgLapses * 0.8 +
      Math.max(0, avgDifficulty - 5) * 0.6 +
      Math.max(0, 4 - avgStability) * 0.5 +
      errorRate7d * 5.0;

    return {
      deckId: deck.id,
      deckTitle: deck.title,
      concurso: deck.concurso,
      materia: deck.materia,
      tema: deck.tema,
      overdueCards: ds.overdue,
      leechCards: ds.leech,
      avgLapses: Math.round(avgLapses * 10) / 10,
      avgDifficulty: Math.round(avgDifficulty * 10) / 10,
      avgStability: Math.round(avgStability * 10) / 10,
      errorRate7d: Math.round(errorRate7d * 1000) / 10,
      riskScore: Math.round(riskScore * 10) / 10,
    };
  })
  .filter(d => d.riskScore > 0)
  .sort((a, b) => b.riskScore - a.riskScore)
  .slice(0, 5);

  // ── weakTopics ───────────────────────────────────────────────────────────
  // Group by materia and tema (deck-level granularity)
  interface TopicAcc {
    label: string; type: 'materia' | 'tema';
    rev7d: number; err7d: number; rev30d: number; err30d: number;
    sumLapses: number; sumDifficulty: number; sumStability: number; cardCount: number;
  }
  const topicMap: Record<string, TopicAcc> = {};

  decks.forEach(deck => {
    const ds = deckCardStats[deck.id];
    const ra = deckRevStats[deck.id] || { total7d: 0, errors7d: 0, total30d: 0, errors30d: 0 };
    if (!ds || ds.totalCards === 0) return;

    const entries: Array<{ key: string; label: string; type: 'materia' | 'tema' }> = [];
    if (deck.materia) entries.push({ key: `materia:${deck.materia}`, label: deck.materia, type: 'materia' });
    if (deck.tema) entries.push({ key: `tema:${deck.tema}`, label: deck.tema, type: 'tema' });

    entries.forEach(({ key, label, type }) => {
      if (!topicMap[key]) {
        topicMap[key] = { label, type, rev7d: 0, err7d: 0, rev30d: 0, err30d: 0, sumLapses: 0, sumDifficulty: 0, sumStability: 0, cardCount: 0 };
      }
      const t = topicMap[key];
      t.rev7d += ra.total7d;
      t.err7d += ra.errors7d;
      t.rev30d += ra.total30d;
      t.err30d += ra.errors30d;
      t.sumLapses += ds.sumLapses;
      t.sumDifficulty += ds.sumDifficulty;
      t.sumStability += ds.sumStability;
      t.cardCount += ds.totalCards;
    });
  });

  const weakTopics: WeakTopic[] = Object.entries(topicMap)
    .map(([key, t]) => {
      const n = t.cardCount || 1;
      const errorRate7d = t.rev7d > 0 ? (t.err7d / t.rev7d) * 100 : 0;
      const errorRate30d = t.rev30d > 0 ? (t.err30d / t.rev30d) * 100 : 0;
      const avgLapses = t.sumLapses / n;
      const avgDifficulty = t.sumDifficulty / n;
      const avgStability = t.sumStability / n;

      return {
        key,
        label: t.label,
        type: t.type,
        errorRate7d: Math.round(errorRate7d * 10) / 10,
        errorRate30d: Math.round(errorRate30d * 10) / 10,
        totalReviews7d: t.rev7d,
        avgLapses: Math.round(avgLapses * 10) / 10,
        avgDifficulty: Math.round(avgDifficulty * 10) / 10,
        avgStability: Math.round(avgStability * 10) / 10,
        isWeak: errorRate7d > 30 || avgLapses > 3 || avgStability < 2,
      };
    })
    .filter(t => t.totalReviews7d > 0 || t.avgLapses > 0)
    .sort((a, b) => b.errorRate7d - a.errorRate7d)
    .slice(0, 10);

  // ── reinforcement ────────────────────────────────────────────────────────
  let reinforcement: Reinforcement | null = null;
  if (focusDecks.length > 0) {
    const top = focusDecks[0];
    let reason: string;
    let reasonType: Reinforcement['reasonType'];

    if (top.errorRate7d > 30) {
      reasonType = 'high_error';
      reason = `${top.errorRate7d}% de erro nos últimos 7 dias`;
    } else if (top.overdueCards >= 10) {
      reasonType = 'overdue';
      reason = `${top.overdueCards} cards atrasados`;
    } else if (top.leechCards >= 3) {
      reasonType = 'leeches';
      reason = `${top.leechCards} cards problemáticos`;
    } else {
      reasonType = 'low_stability';
      reason = `Estabilidade média de ${top.avgStability} dias`;
    }

    reinforcement = {
      deckId: top.deckId,
      deckTitle: top.deckTitle,
      materia: top.materia,
      tema: top.tema,
      reason,
      reasonType,
      overdueCards: top.overdueCards,
      errorRate7d: top.errorRate7d,
      avgStability: top.avgStability,
    };
  }

  // ── performance (7d, 30d, streak, trend) ─────────────────────────────────
  const reviews7d = reviews.filter(r => r.reviewed_at >= sevenDaysAgo);
  const reviews30d = reviews.filter(r => r.reviewed_at >= thirtyDaysAgo);

  const perf7d = reviews7d.length > 0
    ? reviews7d.filter(r => r.grade >= 2).length / reviews7d.length
    : null;
  const perf30d = reviews30d.length > 0
    ? reviews30d.filter(r => r.grade >= 2).length / reviews30d.length
    : null;

  let trend: 'improving' | 'declining' | 'stable' = 'stable';
  if (perf7d !== null && perf30d !== null) {
    if (perf7d >= perf30d + 0.05) trend = 'improving';
    else if (perf7d <= perf30d - 0.05) trend = 'declining';
  }

  // Streak
  const getDayString = (ms: number) => {
    const d = new Date(ms - tzOffset * 60000);
    return d.toISOString().split('T')[0];
  };

  const buildDayLabel = (dayStartMs: number) => {
    const shifted = new Date(dayStartMs - tzOffset * 60000);
    return weekdayFormatter
      .format(shifted)
      .replace('.', '')
      .slice(0, 3)
      .toUpperCase();
  };

  const reviewDays = Array.from(new Set(reviews.map(r => getDayString(r.reviewed_at))));
  const todayStr = getDayString(now);
  const yesterdayStr = getDayString(now - DAY_MS);

  let studyStreakDays = 0;
  if (reviewDays.includes(todayStr) || reviewDays.includes(yesterdayStr)) {
    const checkDateObj = new Date(now - tzOffset * 60000);
    if (!reviewDays.includes(todayStr)) {
      checkDateObj.setDate(checkDateObj.getDate() - 1);
    }
    while (true) {
      const checkStr = checkDateObj.toISOString().split('T')[0];
      if (reviewDays.includes(checkStr)) {
        studyStreakDays++;
        checkDateObj.setDate(checkDateObj.getDate() - 1);
      } else {
        break;
      }
    }
  }

  interface DayAcc {
    total: number;
    success: number;
  }
  const reviewSeriesMap: Record<string, DayAcc> = {};

  reviews.forEach((review) => {
    const day = getDayString(review.reviewed_at);
    if (!reviewSeriesMap[day]) {
      reviewSeriesMap[day] = { total: 0, success: 0 };
    }

    reviewSeriesMap[day].total += 1;
    if (review.grade >= 2) {
      reviewSeriesMap[day].success += 1;
    }
  });

  const performanceSeries = Array.from({ length: 7 }, (_, index) => {
    const dayStartMs = startOfDay - (6 - index) * DAY_MS;
    const day = getDayString(dayStartMs);
    const aggregate = reviewSeriesMap[day];

    return {
      day,
      label: buildDayLabel(dayStartMs),
      accuracy: aggregate && aggregate.total > 0
        ? Math.round((aggregate.success / aggregate.total) * 1000) / 1000
        : null,
      reviews: aggregate?.total ?? 0,
    };
  });

  // ── simulados ────────────────────────────────────────────────────────────
  let lastScore: number | null = null;
  let recentAverage: number | null = null;
  const validSims = simulados
    .filter(s => s.total_questoes > 0)
    .map(s => (s.acertos || 0) / s.total_questoes);

  if (validSims.length > 0) {
    lastScore = validSims[0];
    recentAverage = validSims.reduce((a, b) => a + b, 0) / validSims.length;
  }

  // ── forecast ─────────────────────────────────────────────────────────────
  const endOfToday = startOfDay + DAY_MS;
  const endOfTomorrow = endOfToday + DAY_MS;
  const endOfNext7d = startOfDay + 7 * DAY_MS;

  let dueToday = 0;
  let dueTomorrow = 0;
  let dueNext7d = 0;

  cards.forEach(card => {
    if (card.next_review_at === null) return;
    if (card.next_review_at <= endOfNext7d) {
      dueNext7d++;
      if (card.next_review_at <= endOfToday) {
        dueToday++;
      } else if (card.next_review_at <= endOfTomorrow) {
        dueTomorrow++;
      }
    }
  });

  // ── Return ───────────────────────────────────────────────────────────────
  return {
    today: { dueCards: totalDueCards, reviewedToday: reviewedTodayCount },
    performance: {
      recentPerformance7d: perf7d !== null ? Math.round(perf7d * 1000) / 1000 : null,
      recentPerformance30d: perf30d !== null ? Math.round(perf30d * 1000) / 1000 : null,
      studyStreakDays,
      trend,
    },
    performanceSeries,
    focusDecks,
    weakTopics,
    reinforcement,
    simulados: { lastScore, recentAverage },
    forecast: { dueToday, dueTomorrow, dueNext7d },
    distribution: { overdueTotal, leechTotal, highLapses, lowStability },
  };
}

// ============================================================================
// ROUTE HANDLER — thin wrapper
// ============================================================================

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const tzOffset = parseInt(url.searchParams.get('tzOffset') || '0', 10);
  const startOfDay = parseInt(url.searchParams.get('startOfDay') || Date.now().toString(), 10);
  const currentMs = Date.now();

  try {
    // 1. Fetch decks first to get deckIds
    const { data: decks } = await supabase
      .from('decks')
      .select('id, title, concurso, materia, tema')
      .eq('user_id', user.id)
      .is('deleted_at', null);

    const deckIds = (decks || []).map(d => d.id);

    // 2. All remaining queries in parallel
    const sixtyDaysAgo = currentMs - 60 * 24 * 60 * 60 * 1000;

    const [cardsResult, reviewsResult, reviewedTodayResult, simuladosResult] = await Promise.all([
      deckIds.length > 0
        ? supabase
            .from('cards')
            .select('id, deck_id, next_review_at, is_leech, lapses, difficulty, stability')
            .in('deck_id', deckIds)
            .is('deleted_at', null)
        : Promise.resolve({ data: [] }),
      supabase
        .from('card_reviews')
        .select('card_id, grade, reviewed_at')
        .eq('user_id', user.id)
        .gte('reviewed_at', sixtyDaysAgo)
        .order('reviewed_at', { ascending: false }),
      supabase
        .from('card_reviews')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('reviewed_at', startOfDay),
      supabase
        .from('simulados')
        .select('status, acertos, total_questoes')
        .eq('user_id', user.id)
        .eq('status', 'concluido')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    const payload = computeDashboardStats(
      (decks || []) as RawDeck[],
      (cardsResult.data || []) as RawCard[],
      (reviewsResult.data || []) as RawReview[],
      (simuladosResult.data || []) as RawSimulado[],
      (reviewedTodayResult as { count: number | null }).count || 0,
      currentMs,
      tzOffset,
      startOfDay,
    );

    return NextResponse.json(payload);
  } catch (error) {
    console.error('Error in stats route:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { authenticateCronRequest } from '@/lib/security/cron-auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  emitDailyGoalMissedNotification,
  emitReviewReminderNotification,
  emitStreakAlertNotification,
} from '@/lib/notifications/emitters';

const APP_TIMEZONE = 'America/Sao_Paulo';
const STREAK_LOOKBACK_DAYS = 60;

type UserPreferenceRow = {
  user_id: string;
  daily_reviews: number;
  reminder_time: string;
  study_days: string;
};

function getLocalParts(timestamp: number) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value])
  );

  const weekdayMap: Record<string, string> = {
    Mon: 'seg',
    Tue: 'ter',
    Wed: 'qua',
    Thu: 'qui',
    Fri: 'sex',
    Sat: 'sab',
    Sun: 'dom',
  };

  const hour = Number(parts.hour ?? '0');
  const minute = Number(parts.minute ?? '0');

  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    minutesOfDay: hour * 60 + minute,
    weekday: weekdayMap[parts.weekday ?? 'Mon'] ?? 'seg',
  };
}

function getDayStartTimestamp(dateKey: string) {
  return new Date(`${dateKey}T00:00:00-03:00`).getTime();
}

function parseReminderMinutes(reminderTime: string) {
  const [hourRaw, minuteRaw] = reminderTime.split(':');
  const hour = Number(hourRaw ?? '20');
  const minute = Number(minuteRaw ?? '0');
  return (Number.isFinite(hour) ? hour : 20) * 60 + (Number.isFinite(minute) ? minute : 0);
}

function isStudyDay(studyDays: string, weekday: string) {
  if (!studyDays || studyDays === 'all') return true;
  return studyDays.split(',').map((value) => value.trim()).includes(weekday);
}

async function getOverdueCountsBatch(userIds: string[], now: number): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();

  const admin = getSupabaseAdmin();

  // Single query: get all active decks for all target users
  const { data: decks } = await admin
    .from('decks')
    .select('id, user_id')
    .in('user_id', userIds)
    .is('deleted_at', null);

  const deckRows = (decks ?? []) as Array<{ id: string; user_id: string }>;
  if (deckRows.length === 0) {
    return new Map(userIds.map((id) => [id, 0]));
  }

  // Map deck_id -> user_id for attribution
  const deckToUser = new Map<string, string>();
  for (const deck of deckRows) {
    deckToUser.set(deck.id, deck.user_id);
  }

  const allDeckIds = deckRows.map((d) => d.id);

  // Single query: count overdue cards across all decks
  const { data: overdueCards } = await admin
    .from('cards')
    .select('deck_id')
    .in('deck_id', allDeckIds)
    .is('deleted_at', null)
    .not('next_review_at', 'is', null)
    .lte('next_review_at', now);

  const counts = new Map<string, number>(userIds.map((id) => [id, 0]));
  for (const card of (overdueCards ?? []) as Array<{ deck_id: string }>) {
    const userId = deckToUser.get(card.deck_id);
    if (userId) {
      counts.set(userId, (counts.get(userId) ?? 0) + 1);
    }
  }

  return counts;
}

async function getReviewMetrics(userId: string, now: number) {
  const admin = getSupabaseAdmin();
  const local = getLocalParts(now);
  const dayStart = getDayStartTimestamp(local.dateKey);
  const lookbackStart = dayStart - (STREAK_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const [{ count: reviewedTodayCount }, { data: recentReviews }] = await Promise.all([
    admin
      .from('card_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('reviewed_at', dayStart),
    admin
      .from('card_reviews')
      .select('reviewed_at')
      .eq('user_id', userId)
      .gte('reviewed_at', lookbackStart)
      .order('reviewed_at', { ascending: false }),
  ]);

  const reviewDays = Array.from(new Set(
    ((recentReviews ?? []) as Array<{ reviewed_at: number }>).map((row) => getLocalParts(Number(row.reviewed_at)).dateKey)
  ));

  const todayKey = local.dateKey;
  const yesterdayKey = getLocalParts(now - 24 * 60 * 60 * 1000).dateKey;

  let streak = 0;
  if (reviewDays.includes(todayKey) || reviewDays.includes(yesterdayKey)) {
    let cursor = reviewDays.includes(todayKey) ? dayStart : dayStart - 24 * 60 * 60 * 1000;
    while (true) {
      const key = getLocalParts(cursor).dateKey;
      if (!reviewDays.includes(key)) break;
      streak += 1;
      cursor -= 24 * 60 * 60 * 1000;
    }
  }

  return {
    reviewedToday: reviewedTodayCount ?? 0,
    streak,
  };
}

async function processUserNotifications(pref: UserPreferenceRow, now: number, overdueCount: number) {
  const local = getLocalParts(now);
  if (!isStudyDay(pref.study_days, local.weekday)) {
    return { reviewReminder: 0, dailyGoal: 0, streak: 0 };
  }

  const reminderMinutes = parseReminderMinutes(pref.reminder_time || '20:00');
  const { reviewedToday, streak } = await getReviewMetrics(pref.user_id, now);

  let reviewReminder = 0;
  let dailyGoal = 0;
  let streakAlert = 0;

  if (overdueCount > 0 && local.minutesOfDay >= reminderMinutes && local.minutesOfDay < reminderMinutes + 30) {
    const notification = await emitReviewReminderNotification({
      userId: pref.user_id,
      type: 'review_reminder',
      title: 'Revisões pendentes esperando você',
      body: `Você tem ${overdueCount} revisão(ões) vencida(s) para fazer hoje.`,
      ctaLabel: 'Revisar agora',
      ctaUrl: '/dashboard',
      metadata: { overdueCount },
      dedupeKey: `review-reminder:${pref.user_id}:${local.dateKey}`,
    });
    if (notification) reviewReminder += 1;
  }

  if (local.minutesOfDay >= reminderMinutes + 120 && reviewedToday < pref.daily_reviews) {
    const remaining = Math.max(pref.daily_reviews - reviewedToday, 0);
    const notification = await emitDailyGoalMissedNotification({
      userId: pref.user_id,
      type: 'daily_goal_missed',
      title: 'Meta diária ainda não batida',
      body: `Faltam ${remaining} revisão(ões) para atingir sua meta diária de ${pref.daily_reviews}.`,
      ctaLabel: 'Voltar a estudar',
      ctaUrl: '/dashboard',
      metadata: { reviewedToday, dailyReviews: pref.daily_reviews, remaining },
      dedupeKey: `daily-goal:${pref.user_id}:${local.dateKey}`,
    });
    if (notification) dailyGoal += 1;
  }

  if (streak >= 2 && reviewedToday === 0 && local.minutesOfDay >= reminderMinutes + 60) {
    const notification = await emitStreakAlertNotification({
      userId: pref.user_id,
      type: 'streak_alert',
      title: 'Sua sequência está em risco',
      body: `Você acumulou ${streak} dia(s) seguidos. Faça ao menos uma revisão hoje para não quebrar a sequência.`,
      importance: 'high',
      ctaLabel: 'Manter streak',
      ctaUrl: '/dashboard',
      metadata: { streak },
      dedupeKey: `streak-alert:${pref.user_id}:${local.dateKey}`,
    });
    if (notification) streakAlert += 1;
  }

  return {
    reviewReminder,
    dailyGoal,
    streak: streakAlert,
  };
}

export async function GET(request: NextRequest) {
  const auth = await authenticateCronRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = getSupabaseAdmin();
  const now = Date.now();

  const { data, error } = await admin
    .from('user_preferences')
    .select('user_id, daily_reviews, reminder_time, study_days');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const prefs = (data ?? []) as UserPreferenceRow[];
  const userIds = prefs.map((p) => p.user_id);

  // Batch: single set of queries for all users' overdue counts
  const overdueCounts = await getOverdueCountsBatch(userIds, now);

  let reviewReminder = 0;
  let dailyGoal = 0;
  let streak = 0;

  // Process users concurrently in chunks to avoid overwhelming the DB
  const CONCURRENCY = 10;
  for (let i = 0; i < prefs.length; i += CONCURRENCY) {
    const chunk = prefs.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map((pref) => processUserNotifications(pref, now, overdueCounts.get(pref.user_id) ?? 0))
    );
    for (const result of results) {
      reviewReminder += result.reviewReminder;
      dailyGoal += result.dailyGoal;
      streak += result.streak;
    }
  }

  return NextResponse.json({
    ok: true,
    processedUsers: (data ?? []).length,
    notifications: {
      reviewReminder,
      dailyGoal,
      streak,
    },
  });
}

import { describe, expect, test } from 'vitest';

import {
  DEFAULT_CONFIG,
  calculateRetrievability,
  processReview,
  type Grade,
  type SRSState,
} from '../index';

const DAY_MS = 24 * 60 * 60 * 1000;
const START_TIME = Date.UTC(2026, 0, 1, 12, 0, 0);
const REVIEW_COUNT = 1000;
const DECK_SIZE = 120;

interface StudentProfile {
  name: string;
  seed: number;
  newCardDistribution: Array<[Grade, number]>;
  relearningAgainChance: number;
  baseFailRate: number;
  failMultiplier: number;
  baseHardRate: number;
  baseEasyRate: number;
  minDelayMultiplier: number;
  maxDelayMultiplier: number;
}

interface SimulatedCard {
  id: number;
  state: Partial<SRSState>;
  availableAt: number | null;
}

interface SimulationResult {
  profile: string;
  reviews: number;
  lapseRate: number;
  relearningRate: number;
  leechCount: number;
  avgDifficulty: number;
  avgStability: number;
  avgRetrievability: number;
  medianIntervalDays: number;
  p90IntervalDays: number;
  maxIntervalDays: number;
  matureIntervalShare: number;
  totalSimulatedDays: number;
  gradeCounts: Record<Grade, number>;
  intervalBuckets: Record<string, number>;
}

const PROFILES: StudentProfile[] = [
  {
    name: 'Consistente',
    seed: 101,
    newCardDistribution: [
      [1, 0.08],
      [2, 0.70],
      [3, 0.22],
    ],
    relearningAgainChance: 0.03,
    baseFailRate: 0.01,
    failMultiplier: 0.60,
    baseHardRate: 0.10,
    baseEasyRate: 0.24,
    minDelayMultiplier: 0.92,
    maxDelayMultiplier: 1.03,
  },
  {
    name: 'Mediano',
    seed: 202,
    newCardDistribution: [
      [0, 0.04],
      [1, 0.18],
      [2, 0.70],
      [3, 0.08],
    ],
    relearningAgainChance: 0.08,
    baseFailRate: 0.03,
    failMultiplier: 1.00,
    baseHardRate: 0.22,
    baseEasyRate: 0.10,
    minDelayMultiplier: 0.97,
    maxDelayMultiplier: 1.22,
  },
  {
    name: 'Dificil',
    seed: 303,
    newCardDistribution: [
      [0, 0.16],
      [1, 0.28],
      [2, 0.52],
      [3, 0.04],
    ],
    relearningAgainChance: 0.18,
    baseFailRate: 0.07,
    failMultiplier: 1.35,
    baseHardRate: 0.32,
    baseEasyRate: 0.04,
    minDelayMultiplier: 1.04,
    maxDelayMultiplier: 1.55,
  },
];

function createRng(seed: number): () => number {
  let current = seed >>> 0;

  return () => {
    current = (1664525 * current + 1013904223) >>> 0;
    return current / 0x100000000;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function chooseWeightedGrade(
  distribution: Array<[Grade, number]>,
  rng: () => number
): Grade {
  const roll = rng();
  let cumulative = 0;

  for (const [grade, weight] of distribution) {
    cumulative += weight;
    if (roll <= cumulative) {
      return grade;
    }
  }

  return distribution[distribution.length - 1][0];
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * q))
  );

  return sorted[index];
}

function intervalBucket(intervalDays: number): string {
  if (intervalDays < 1 / 24) {
    return '<1h';
  }

  if (intervalDays < 1) {
    return '1h-1d';
  }

  if (intervalDays < 7) {
    return '1d-7d';
  }

  if (intervalDays < 30) {
    return '7d-30d';
  }

  return '30d+';
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDays(value: number): string {
  if (value < 1 / 24) {
    return `${Math.round(value * 24 * 60)}m`;
  }

  if (value < 1) {
    return `${(value * 24).toFixed(1)}h`;
  }

  if (value < 30) {
    return `${value.toFixed(1)}d`;
  }

  return `${(value / 30).toFixed(1)}mo`;
}

function selectGrade(
  card: SimulatedCard,
  profile: StudentProfile,
  now: number,
  rng: () => number
): Grade {
  if (card.state.stability === undefined || card.state.stability === 0) {
    return chooseWeightedGrade(profile.newCardDistribution, rng);
  }

  if (card.state.relearning_step !== null && card.state.relearning_step !== undefined) {
    return rng() < profile.relearningAgainChance ? 0 : 2;
  }

  const daysSinceReview =
    card.state.last_review_at === undefined
      ? 0
      : (now - card.state.last_review_at) / DAY_MS;
  const retrievability = calculateRetrievability(
    card.state.stability,
    Math.max(0, daysSinceReview)
  );

  const failRate = clamp(
    (1 - retrievability) * profile.failMultiplier + profile.baseFailRate,
    0.01,
    0.95
  );

  if (rng() < failRate) {
    return 0;
  }

  const hardRate = clamp(
    profile.baseHardRate + Math.max(0, 0.9 - retrievability) * 0.8,
    0.05,
    0.75
  );
  const easyRate = clamp(
    profile.baseEasyRate + Math.max(0, retrievability - 0.92) * 1.5,
    0.02,
    0.55
  );
  const remaining = Math.max(0.05, 1 - hardRate - easyRate);
  const successDistribution: Array<[Grade, number]> = [
    [1, hardRate],
    [2, remaining],
    [3, easyRate],
  ];

  return chooseWeightedGrade(successDistribution, rng);
}

function findNextCard(cards: SimulatedCard[], now: number): SimulatedCard | null {
  let best: SimulatedCard | null = null;
  let bestPriority = Number.POSITIVE_INFINITY;
  let bestTime = Number.POSITIVE_INFINITY;

  for (const card of cards) {
    let priority = 3;
    let time = Number.POSITIVE_INFINITY;

    if (card.availableAt === null) {
      priority = 2;
      time = card.id;
    } else if (card.availableAt <= now) {
      priority = card.state.relearning_step !== null ? 0 : 1;
      time = card.availableAt;
    }

    if (
      priority < bestPriority ||
      (priority === bestPriority && time < bestTime)
    ) {
      best = card;
      bestPriority = priority;
      bestTime = time;
    }
  }

  return bestPriority === 3 ? null : best;
}

function nextAvailableTime(cards: SimulatedCard[]): number {
  return cards.reduce((min, card) => {
    if (card.availableAt === null) {
      return min;
    }

    return Math.min(min, card.availableAt);
  }, Number.POSITIVE_INFINITY);
}

function simulateProfile(profile: StudentProfile): SimulationResult {
  const rng = createRng(profile.seed);
  const cards: SimulatedCard[] = Array.from({ length: DECK_SIZE }, (_, id) => ({
    id,
    state: {},
    availableAt: null,
  }));

  const intervals: number[] = [];
  const retrievabilities: number[] = [];
  const difficulties: number[] = [];
  const stabilities: number[] = [];
  const gradeCounts: Record<Grade, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  const intervalBuckets: Record<string, number> = {
    '<1h': 0,
    '1h-1d': 0,
    '1d-7d': 0,
    '7d-30d': 0,
    '30d+': 0,
  };

  let now = START_TIME;
  let lapseEvents = 0;
  let relearningReviews = 0;

  for (let reviewIndex = 0; reviewIndex < REVIEW_COUNT; reviewIndex += 1) {
    let card = findNextCard(cards, now);

    if (!card) {
      now = nextAvailableTime(cards);
      card = findNextCard(cards, now);
    }

    if (!card) {
      throw new Error('Simulation could not find an available card.');
    }

    const isRelearning =
      card.state.relearning_step !== null && card.state.relearning_step !== undefined;
    if (isRelearning) {
      relearningReviews += 1;
    }

    const daysSinceReview =
      card.state.last_review_at === undefined
        ? 0
        : (now - card.state.last_review_at) / DAY_MS;
    const retrievability =
      card.state.stability && card.state.stability > 0
        ? calculateRetrievability(card.state.stability, Math.max(0, daysSinceReview))
        : 0;

    const grade = selectGrade(card, profile, now, rng);
    gradeCounts[grade] += 1;

    const previousLapses = card.state.lapses ?? 0;
    const result = processReview(card.state, grade, now, DEFAULT_CONFIG, false);

    if ((result.newState.lapses ?? 0) > previousLapses) {
      lapseEvents += (result.newState.lapses ?? 0) - previousLapses;
    }

    intervals.push(result.intervalDays);
    retrievabilities.push(retrievability);
    difficulties.push(result.newState.difficulty);
    stabilities.push(result.newState.stability);
    intervalBuckets[intervalBucket(result.intervalDays)] += 1;

    card.state = result.newState;

    if (result.newState.relearning_step !== null) {
      card.availableAt = result.newState.next_review_at;
    } else {
      const delayMultiplier =
        profile.minDelayMultiplier +
        (profile.maxDelayMultiplier - profile.minDelayMultiplier) * rng();
      card.availableAt =
        result.newState.last_review_at + result.intervalDays * delayMultiplier * DAY_MS;
    }

    now = Math.max(now, card.availableAt ?? now);
  }

  const leechCount = cards.filter((card) => card.state.is_leech).length;
  const matureIntervals = intervals.filter((interval) => interval >= 7);

  return {
    profile: profile.name,
    reviews: REVIEW_COUNT,
    lapseRate: lapseEvents / REVIEW_COUNT,
    relearningRate: relearningReviews / REVIEW_COUNT,
    leechCount,
    avgDifficulty:
      difficulties.reduce((sum, value) => sum + value, 0) / difficulties.length,
    avgStability:
      stabilities.reduce((sum, value) => sum + value, 0) / stabilities.length,
    avgRetrievability:
      retrievabilities.reduce((sum, value) => sum + value, 0) / retrievabilities.length,
    medianIntervalDays: quantile(intervals, 0.5),
    p90IntervalDays: quantile(intervals, 0.9),
    maxIntervalDays: Math.max(...intervals),
    matureIntervalShare: matureIntervals.length / intervals.length,
    totalSimulatedDays: (now - START_TIME) / DAY_MS,
    gradeCounts,
    intervalBuckets,
  };
}

function printComparison(results: SimulationResult[]): void {
  console.log('\nFSRS long simulation: 1000 reviews per profile');
  console.log(
    'Profile'.padEnd(14) +
      'Lapse'.padEnd(10) +
      'Relearn'.padEnd(10) +
      'P50'.padEnd(10) +
      'P90'.padEnd(10) +
      'Max'.padEnd(10) +
      '7d+'.padEnd(10) +
      'Avg D'.padEnd(10) +
      'Avg R'.padEnd(10) +
      'Leeches'.padEnd(10) +
      'Span'
  );

  for (const result of results) {
    console.log(
      result.profile.padEnd(14) +
        formatPercent(result.lapseRate).padEnd(10) +
        formatPercent(result.relearningRate).padEnd(10) +
        formatDays(result.medianIntervalDays).padEnd(10) +
        formatDays(result.p90IntervalDays).padEnd(10) +
        formatDays(result.maxIntervalDays).padEnd(10) +
        formatPercent(result.matureIntervalShare).padEnd(10) +
        result.avgDifficulty.toFixed(2).padEnd(10) +
        formatPercent(result.avgRetrievability).padEnd(10) +
        String(result.leechCount).padEnd(10) +
        formatDays(result.totalSimulatedDays)
    );
  }

  for (const result of results) {
    console.log(
      `${result.profile} buckets: ` +
        Object.entries(result.intervalBuckets)
          .map(([label, count]) => `${label}=${formatPercent(count / result.reviews)}`)
          .join(', ')
    );
  }
}

describe('FSRS long simulation', () => {
  test('1000 reviews compare student profiles with stable ordering', () => {
    const results = PROFILES.map(simulateProfile);
    const [consistent, median, difficult] = results;

    printComparison(results);

    expect(consistent.lapseRate).toBeLessThan(median.lapseRate);
    expect(median.lapseRate).toBeLessThan(difficult.lapseRate);

    expect(consistent.medianIntervalDays).toBeGreaterThan(median.medianIntervalDays);
    expect(median.medianIntervalDays).toBeGreaterThan(difficult.medianIntervalDays);

    expect(consistent.p90IntervalDays).toBeGreaterThan(median.p90IntervalDays);
    expect(median.p90IntervalDays).toBeGreaterThan(difficult.p90IntervalDays);

    expect(consistent.avgDifficulty).toBeLessThan(median.avgDifficulty);
    expect(median.avgDifficulty).toBeLessThan(difficult.avgDifficulty);

    expect(consistent.matureIntervalShare).toBeGreaterThan(median.matureIntervalShare);
    expect(median.matureIntervalShare).toBeGreaterThan(difficult.matureIntervalShare);

    expect(consistent.leechCount).toBeLessThanOrEqual(median.leechCount);
    expect(median.leechCount).toBeLessThanOrEqual(difficult.leechCount);
  });
});

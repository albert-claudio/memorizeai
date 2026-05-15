/**
 * Provider capacity limiter with per-run expiry.
 *
 * Uses Redis sorted sets so each active run carries its own expiration score.
 * This avoids SCARD/SADD races and avoids losing the whole active set because
 * of a single key-level TTL expiring mid-flight.
 */

import type { Redis } from '@upstash/redis';
import { resolveRunProviderModel } from '@/lib/ai/provider-router';
import { getRedis } from '@/lib/redis';

const DEFAULT_RUN_LEASE_MS = 180000;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const RUN_LEASE_MS = parsePositiveInt(process.env.RUN_LEASE_MS, DEFAULT_RUN_LEASE_MS);
const SLOT_TTL_MS = parsePositiveInt(
  process.env.PROVIDER_SLOT_TTL_MS,
  Math.max(RUN_LEASE_MS + 30000, 240000),
);

const GROQ_FLASHCARD_MAX = parsePositiveInt(process.env.GROQ_FLASHCARD_MAX_CONCURRENT, 5);
const GROQ_QUESTOES_MAX = parsePositiveInt(process.env.GROQ_QUESTOES_MAX_CONCURRENT, 3);
const GEMINI_FLASHCARD_MAX = parsePositiveInt(
  process.env.GEMINI_FLASHCARD_MAX_CONCURRENT,
  GROQ_FLASHCARD_MAX,
);
const GEMINI_QUESTOES_MAX = parsePositiveInt(process.env.GEMINI_QUESTOES_MAX_CONCURRENT, 2);
const OPENAI_FLASHCARD_MAX = parsePositiveInt(process.env.OPENAI_FLASHCARD_MAX_CONCURRENT, 8);
const OPENAI_QUESTOES_MAX = parsePositiveInt(process.env.OPENAI_QUESTOES_MAX_CONCURRENT, 2);

export type ProviderSlotKey =
  | 'groq:flashcards'
  | 'groq:questoes'
  | 'gemini:questoes'
  | 'gemini:flashcards'
  | 'openai:flashcards'
  | 'openai:questoes';

interface CapacityConfig {
  maxConcurrent: number;
}

const CAPACITY_MAP: Record<ProviderSlotKey, CapacityConfig> = {
  'groq:flashcards': { maxConcurrent: GROQ_FLASHCARD_MAX },
  'groq:questoes': { maxConcurrent: GROQ_QUESTOES_MAX },
  'gemini:questoes': { maxConcurrent: GEMINI_QUESTOES_MAX },
  'gemini:flashcards': { maxConcurrent: GEMINI_FLASHCARD_MAX },
  'openai:flashcards': { maxConcurrent: OPENAI_FLASHCARD_MAX },
  'openai:questoes': { maxConcurrent: OPENAI_QUESTOES_MAX },
};

type InMemorySlotMap = Map<string, number>;

const inMemorySlots = new Map<ProviderSlotKey, InMemorySlotMap>();

function redisKey(slotKey: ProviderSlotKey): string {
  return `queue:active:${slotKey}`;
}

function getInMemoryMap(slotKey: ProviderSlotKey): InMemorySlotMap {
  if (!inMemorySlots.has(slotKey)) {
    inMemorySlots.set(slotKey, new Map());
  }
  return inMemorySlots.get(slotKey)!;
}

function pruneInMemoryExpired(slotKey: ProviderSlotKey, now = Date.now()): InMemorySlotMap {
  const slots = getInMemoryMap(slotKey);
  for (const [runId, expiresAt] of slots.entries()) {
    if (expiresAt <= now) {
      slots.delete(runId);
    }
  }
  return slots;
}

function getAcquireSlotScript(redis: Redis) {
  return redis.createScript<[number, number]>(`
local key = KEYS[1]
local now = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local max = tonumber(ARGV[3])
local runId = ARGV[4]

redis.call("ZREMRANGEBYSCORE", key, "-inf", now)

if redis.call("ZSCORE", key, runId) then
  redis.call("ZADD", key, now + ttl, runId)
  redis.call("PEXPIRE", key, ttl)
  return {1, redis.call("ZCARD", key)}
end

local active = redis.call("ZCARD", key)
if active >= max then
  return {0, active}
end

redis.call("ZADD", key, now + ttl, runId)
redis.call("PEXPIRE", key, ttl)
return {1, active + 1}
`);
}

function getRenewSlotScript(redis: Redis) {
  return redis.createScript<number>(`
local key = KEYS[1]
local now = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local runId = ARGV[3]

redis.call("ZREMRANGEBYSCORE", key, "-inf", now)

if redis.call("ZSCORE", key, runId) then
  redis.call("ZADD", key, now + ttl, runId)
  redis.call("PEXPIRE", key, ttl)
  return 1
end

return 0
`);
}

function getCountScript(redis: Redis) {
  return redis.createScript<number>(`
local key = KEYS[1]
local now = tonumber(ARGV[1])

redis.call("ZREMRANGEBYSCORE", key, "-inf", now)
return redis.call("ZCARD", key)
`);
}

export function resolveSlotKey(
  objective: string,
  modelPreference: string,
  runId = 'capacity-default',
): ProviderSlotKey {
  const providerPart = resolveRunProviderModel({
    runId,
    objective,
    preference: modelPreference,
  }).provider;
  const objectivePart = objective === 'flashcards' ? 'flashcards' : 'questoes';

  return `${providerPart}:${objectivePart}` as ProviderSlotKey;
}

export function getMaxConcurrent(slotKey: ProviderSlotKey): number {
  return CAPACITY_MAP[slotKey]?.maxConcurrent ?? 5;
}

export async function getActiveCount(slotKey: ProviderSlotKey): Promise<number> {
  const redis = getRedis();
  const now = Date.now();

  if (!redis) {
    return pruneInMemoryExpired(slotKey, now).size;
  }

  const count = await getCountScript(redis).eval([redisKey(slotKey)], [String(now)]);
  return Number(count) || 0;
}

/**
 * Snapshot helper for monitoring/logging only.
 */
export async function hasCapacity(slotKey: ProviderSlotKey): Promise<boolean> {
  const active = await getActiveCount(slotKey);
  return active < getMaxConcurrent(slotKey);
}

export async function acquireSlot(
  slotKey: ProviderSlotKey,
  runId: string,
): Promise<boolean> {
  const redis = getRedis();
  const now = Date.now();
  const maxConcurrent = getMaxConcurrent(slotKey);

  if (!redis) {
    const slots = pruneInMemoryExpired(slotKey, now);
    if (slots.has(runId)) {
      slots.set(runId, now + SLOT_TTL_MS);
      return true;
    }
    if (slots.size >= maxConcurrent) {
      return false;
    }
    slots.set(runId, now + SLOT_TTL_MS);
    return true;
  }

  const [acquired] = await getAcquireSlotScript(redis).eval(
    [redisKey(slotKey)],
    [String(now), String(SLOT_TTL_MS), String(maxConcurrent), runId],
  );

  return Number(acquired) === 1;
}

export async function renewSlot(
  slotKey: ProviderSlotKey,
  runId: string,
): Promise<boolean> {
  const redis = getRedis();
  const now = Date.now();

  if (!redis) {
    const slots = pruneInMemoryExpired(slotKey, now);
    if (!slots.has(runId)) {
      return false;
    }
    slots.set(runId, now + SLOT_TTL_MS);
    return true;
  }

  const renewed = await getRenewSlotScript(redis).eval(
    [redisKey(slotKey)],
    [String(now), String(SLOT_TTL_MS), runId],
  );

  return Number(renewed) === 1;
}

export async function releaseSlot(
  slotKey: ProviderSlotKey,
  runId: string,
): Promise<void> {
  const redis = getRedis();

  if (!redis) {
    pruneInMemoryExpired(slotKey).delete(runId);
    return;
  }

  await redis.zrem(redisKey(slotKey), runId);
}

export async function getCapacitySummary(): Promise<Record<ProviderSlotKey, { active: number; max: number }>> {
  const keys: ProviderSlotKey[] = [
    'groq:flashcards',
    'groq:questoes',
    'gemini:questoes',
    'gemini:flashcards',
    'openai:flashcards',
    'openai:questoes',
  ];
  const summary: Record<string, { active: number; max: number }> = {};

  for (const key of keys) {
    summary[key] = {
      active: await getActiveCount(key),
      max: getMaxConcurrent(key),
    };
  }

  return summary as Record<ProviderSlotKey, { active: number; max: number }>;
}

import crypto from 'crypto';
import { getRedis } from '@/lib/redis';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const WINDOW_SECONDS = 15 * 60;

type LockoutRecord = {
  count: number;
  resetAt: number;
  lockedUntil?: number;
};

const memory = new Map<string, LockoutRecord>();

function keyFor(email: string, ip: string): string {
  const digest = crypto
    .createHash('sha256')
    .update(`${email.trim().toLowerCase()}:${ip}`)
    .digest('hex');
  return `auth:login:${digest}`;
}

export async function getLoginLockout(email: string, ip: string): Promise<{ locked: boolean; lockedUntil: number | null }> {
  const key = keyFor(email, ip);
  const redis = getRedis();
  const now = Date.now();

  if (redis) {
    const value = await redis.get<{ count?: number; lockedUntil?: number }>(key);
    const lockedUntil = typeof value?.lockedUntil === 'number' ? value.lockedUntil : null;
    return { locked: !!lockedUntil && lockedUntil > now, lockedUntil };
  }

  const record = memory.get(key);
  if (!record || record.resetAt <= now) {
    memory.delete(key);
    return { locked: false, lockedUntil: null };
  }

  return {
    locked: !!record.lockedUntil && record.lockedUntil > now,
    lockedUntil: record.lockedUntil ?? null,
  };
}

export async function recordFailedLogin(email: string, ip: string): Promise<{ locked: boolean; lockedUntil: number | null; count: number }> {
  const key = keyFor(email, ip);
  const redis = getRedis();
  const now = Date.now();

  if (redis) {
    const current = await redis.get<{ count?: number; lockedUntil?: number }>(key);
    const count = (current?.count ?? 0) + 1;
    const lockedUntil = count >= MAX_FAILED_ATTEMPTS ? now + LOCKOUT_MS : current?.lockedUntil ?? null;
    await redis.set(key, { count, lockedUntil }, { ex: WINDOW_SECONDS });
    return { locked: !!lockedUntil && lockedUntil > now, lockedUntil, count };
  }

  const current = memory.get(key);
  const record = current && current.resetAt > now
    ? current
    : { count: 0, resetAt: now + LOCKOUT_MS };
  record.count++;
  if (record.count >= MAX_FAILED_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS;
  }
  memory.set(key, record);
  return {
    locked: !!record.lockedUntil && record.lockedUntil > now,
    lockedUntil: record.lockedUntil ?? null,
    count: record.count,
  };
}

export async function clearFailedLogins(email: string, ip: string) {
  const key = keyFor(email, ip);
  const redis = getRedis();
  if (redis) {
    await redis.del(key);
    return;
  }
  memory.delete(key);
}

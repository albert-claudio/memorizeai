import { Redis } from '@upstash/redis';

/**
 * Upstash Redis singleton.
 * Returns null when env vars are absent (local dev without Redis).
 * All callers must handle the null case (fail-open).
 */
let _redis: Redis | null = null;

export function getRedis(): Redis | null {
  if (_redis) return _redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (process.env.NODE_ENV === 'production') {
      console.error(
        '[Redis] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set. ' +
        'Distributed rate limiting is DISABLED. Set these env vars in Vercel.'
      );
    }
    return null;
  }

  _redis = new Redis({ url, token });
  return _redis;
}

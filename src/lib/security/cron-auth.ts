import { Receiver } from '@upstash/qstash';

export type CronAuthMode = 'qstash' | 'legacy';

export type CronAuthResult =
  | { ok: true; mode: CronAuthMode }
  | { ok: false; status: number; error: string };

function hasQStashSigningKeys(): boolean {
  return Boolean(
    process.env.QSTASH_CURRENT_SIGNING_KEY ||
    process.env.QSTASH_NEXT_SIGNING_KEY ||
    process.env.QSTASH_REGION
  );
}

function buildReceiver(): Receiver | null {
  if (!hasQStashSigningKeys()) return null;

  return new Receiver({
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
  });
}

async function verifyQStashSignature(request: Request): Promise<boolean> {
  const signature = request.headers.get('upstash-signature');
  if (!signature) return false;

  const receiver = buildReceiver();
  if (!receiver) {
    throw new Error('QStash signing keys are not configured');
  }

  return receiver.verify({
    signature,
    body: await request.clone().text(),
    url: request.url,
    upstashRegion: request.headers.get('upstash-region') ?? undefined,
  });
}

function isLegacyCronAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;

  return request.headers.get('authorization') === `Bearer ${cronSecret}`;
}

/**
 * Authenticates scheduled-job endpoints.
 *
 * Preferred mode is QStash signature verification. We keep an optional
 * CRON_SECRET fallback so production can cut over from Vercel Cron to QStash
 * without a hard outage window. Remove CRON_SECRET once the migration is done.
 */
export async function authenticateCronRequest(request: Request): Promise<CronAuthResult> {
  if (request.headers.has('upstash-signature')) {
    try {
      const isValid = await verifyQStashSignature(request);
      if (isValid) return { ok: true, mode: 'qstash' };
    } catch (error) {
      console.warn('[Cron Auth] QStash signature verification failed:', error);
      return { ok: false, status: 403, error: 'Invalid QStash signature' };
    }

    return { ok: false, status: 403, error: 'Invalid QStash signature' };
  }

  if (isLegacyCronAuthorized(request)) {
    return { ok: true, mode: 'legacy' };
  }

  if (hasQStashSigningKeys() || process.env.CRON_SECRET?.trim()) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  return { ok: false, status: 500, error: 'Cron auth is misconfigured' };
}

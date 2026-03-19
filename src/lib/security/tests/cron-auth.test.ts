import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockVerify, mockReceiver } = vi.hoisted(() => {
  const verify = vi.fn();
  const receiver = vi.fn();

  return {
    mockVerify: verify,
    mockReceiver: receiver,
  };
});

vi.mock('@upstash/qstash', () => ({
  Receiver: class MockReceiver {
    constructor(config: unknown) {
      mockReceiver(config);
    }

    verify(request: unknown) {
      return mockVerify(request);
    }
  },
}));

import { authenticateCronRequest } from '../cron-auth';

const ORIGINAL_ENV = { ...process.env };

describe('authenticateCronRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.QSTASH_CURRENT_SIGNING_KEY;
    delete process.env.QSTASH_NEXT_SIGNING_KEY;
    delete process.env.QSTASH_REGION;
    delete process.env.CRON_SECRET;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('accepts a valid QStash-signed request', async () => {
    process.env.QSTASH_CURRENT_SIGNING_KEY = 'current-key';
    process.env.QSTASH_NEXT_SIGNING_KEY = 'next-key';
    mockVerify.mockResolvedValue(true);

    const request = new Request('https://vimens.app/api/cron/health-check', {
      method: 'GET',
      headers: {
        'upstash-signature': 'signature-value',
        'upstash-region': 'us-east-1',
      },
    });

    const result = await authenticateCronRequest(request);

    expect(result).toEqual({ ok: true, mode: 'qstash' });
    expect(mockReceiver).toHaveBeenCalledWith({
      currentSigningKey: 'current-key',
      nextSigningKey: 'next-key',
    });
    expect(mockVerify).toHaveBeenCalledWith({
      signature: 'signature-value',
      body: '',
      url: 'https://vimens.app/api/cron/health-check',
      upstashRegion: 'us-east-1',
    });
  });

  it('rejects an invalid QStash signature', async () => {
    process.env.QSTASH_CURRENT_SIGNING_KEY = 'current-key';
    mockVerify.mockRejectedValue(new Error('invalid signature'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const request = new Request('https://vimens.app/api/cron/alerts', {
      method: 'GET',
      headers: {
        'upstash-signature': 'bad-signature',
      },
    });

    const result = await authenticateCronRequest(request);

    expect(result).toEqual({ ok: false, status: 403, error: 'Invalid QStash signature' });
    warnSpy.mockRestore();
  });

  it('accepts the legacy CRON_SECRET fallback during cutover', async () => {
    process.env.CRON_SECRET = 'legacy-secret';

    const request = new Request('https://vimens.app/api/cron/recover-runs', {
      method: 'GET',
      headers: {
        authorization: 'Bearer legacy-secret',
      },
    });

    const result = await authenticateCronRequest(request);

    expect(result).toEqual({ ok: true, mode: 'legacy' });
    expect(mockReceiver).not.toHaveBeenCalled();
  });

  it('fails closed when no auth headers are present but QStash is configured', async () => {
    process.env.QSTASH_CURRENT_SIGNING_KEY = 'current-key';

    const request = new Request('https://vimens.app/api/cron/recover-runs', {
      method: 'GET',
    });

    const result = await authenticateCronRequest(request);

    expect(result).toEqual({ ok: false, status: 401, error: 'Unauthorized' });
  });

  it('reports misconfiguration when no auth mechanism is configured', async () => {
    const request = new Request('https://vimens.app/api/cron/recover-runs', {
      method: 'GET',
    });

    const result = await authenticateCronRequest(request);

    expect(result).toEqual({ ok: false, status: 500, error: 'Cron auth is misconfigured' });
  });
});

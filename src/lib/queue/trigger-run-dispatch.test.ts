import { afterEach, describe, expect, it, vi } from 'vitest';
import { triggerRunDispatch } from './trigger-run-dispatch';

describe('triggerRunDispatch', () => {
  const originalSecret = process.env.RUNS_PROCESS_INTERNAL_SECRET;
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    process.env.RUNS_PROCESS_INTERNAL_SECRET = originalSecret;
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
    vi.unstubAllGlobals();
  });

  it('kicks the queue dispatcher instead of processing the run directly', () => {
    process.env.RUNS_PROCESS_INTERNAL_SECRET = 'internal-secret';
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com/';
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);

    triggerRunDispatch('run_123');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://app.example.com/api/cron/process-queue',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': 'internal-secret',
        },
        body: JSON.stringify({ reason: 'run-created', runId: 'run_123' }),
      }),
    );
  });

  it('does nothing when the internal secret is missing', () => {
    delete process.env.RUNS_PROCESS_INTERNAL_SECRET;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    triggerRunDispatch('run_123');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * Integration tests for fetchWithTimeout.
 *
 * Verifies that slow responses are aborted and that normal responses pass through.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithTimeout, AI_TIMEOUT_MS } from '../timeout';

describe('fetchWithTimeout', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it('returns the response when fetch resolves before timeout', async () => {
    const mockResponse = new Response('ok', { status: 200 });
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const result = await fetchWithTimeout('https://example.com', {}, 5000);
    expect(result.status).toBe(200);
  });

  it('uses the default timeout constant', () => {
    expect(AI_TIMEOUT_MS).toBe(60_000);
  });

  it('throws a readable error when the signal aborts', async () => {
    // Simulate a fetch that never resolves
    globalThis.fetch = vi.fn().mockImplementation((_url: string, opts: RequestInit) => {
      return new Promise((_resolve, reject) => {
        opts.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const promise = fetchWithTimeout('https://example.com', {}, 100);

    // Advance timers past the timeout
    vi.advanceTimersByTime(150);

    await expect(promise).rejects.toThrow('AI call timed out after 0.1s');
  });

  it('passes through non-abort errors untouched', async () => {
    const networkError = new Error('ECONNREFUSED');
    globalThis.fetch = vi.fn().mockRejectedValue(networkError);

    await expect(fetchWithTimeout('https://example.com')).rejects.toThrow('ECONNREFUSED');
  });
});

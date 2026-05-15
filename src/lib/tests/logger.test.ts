/**
 * Tests for the structured logger.
 *
 * Verifies that:
 * - JSON output is emitted in production mode
 * - Base context (runId, userId) is included in every log line
 * - elapsed() tracks time correctly
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to force production mode BEFORE importing the logger
// because the module reads NODE_ENV at import time.

describe('createLogger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  const origEnv = process.env.NODE_ENV;
  const envRef = process.env as NodeJS.ProcessEnv & { NODE_ENV?: string };

  beforeEach(() => {
    envRef.NODE_ENV = 'production';
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    envRef.NODE_ENV = origEnv;
  });

  /**
   * Helper: the logger module caches `isProd` at eval time. We use
   * dynamic import with cache-busting via resetModules to guarantee
   * the module re-evaluates with the current NODE_ENV.
   */
  async function loadLogger() {
    vi.resetModules();
    const mod = await import('../logger');
    return mod.createLogger;
  }

  it('emits JSON in production mode', async () => {
    const createLogger = await loadLogger();
    const logger = createLogger({ runId: 'run-123', userId: 'user-abc' });

    logger.info('test_event', { extra: 42 });

    expect(logSpy).toHaveBeenCalledOnce();
    const raw = logSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(raw);

    expect(parsed.level).toBe('info');
    expect(parsed.event).toBe('test_event');
    expect(parsed.runId).toBe('run-123');
    expect(parsed.userId).toBe('user-abc');
    expect(parsed.extra).toBe(42);
    expect(parsed.ts).toBeDefined();
  });

  it('includes base context in every call', async () => {
    const createLogger = await loadLogger();
    const logger = createLogger({ runId: 'r1' });

    logger.warn('warning_event');
    logger.error('error_event', { detail: 'oops' });

    expect(logSpy).toHaveBeenCalledTimes(2);

    const first = JSON.parse(logSpy.mock.calls[0][0] as string);
    const second = JSON.parse(logSpy.mock.calls[1][0] as string);

    expect(first.runId).toBe('r1');
    expect(first.level).toBe('warn');
    expect(second.runId).toBe('r1');
    expect(second.level).toBe('error');
    expect(second.detail).toBe('oops');
  });

  it('elapsed() returns time since logger creation', async () => {
    const createLogger = await loadLogger();
    const logger = createLogger();

    expect(logger.elapsed()).toBeLessThan(50);
  });

  it('supports all log levels', async () => {
    const createLogger = await loadLogger();
    const logger = createLogger({ runId: 'r1' });

    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(logSpy).toHaveBeenCalledTimes(4);

    const levels = logSpy.mock.calls.map(
      (c: [unknown, ...unknown[]]) => JSON.parse(c[0] as string).level
    );
    expect(levels).toEqual(['debug', 'info', 'warn', 'error']);
  });
});

/**
 * Structured logger for server-side observability.
 *
 * In production: emits JSON lines → Vercel log drains / Datadog / etc.
 * In development: emits colored, human-readable text.
 *
 * Usage:
 *   const logger = createLogger({ runId, userId });
 *   logger.info('ai_call_start', { model: 'groq', chunkCount: 12 });
 *   logger.error('ai_call_failed', { error: err.message, durationMs: 1200 });
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  runId?: string;
  userId?: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(event: string, ctx?: LogContext): void;
  info(event: string, ctx?: LogContext): void;
  warn(event: string, ctx?: LogContext): void;
  error(event: string, ctx?: LogContext): void;
  /** Returns elapsed ms since logger creation — useful for step timings. */
  elapsed(): number;
}

const isProd = process.env.NODE_ENV === 'production';

function emit(level: LogLevel, event: string, base: LogContext, extra?: LogContext): void {
  const ts = new Date().toISOString();
  const payload = { ts, level, event, ...base, ...extra };

  if (isProd) {
    // JSON line — Vercel / log drains index this automatically
    console.log(JSON.stringify(payload));
  } else {
    const prefix = `[${ts}] [${level.toUpperCase()}]`;
    const ctx = extra ? ` ${JSON.stringify(extra)}` : '';
    console.log(`${prefix} [${event}]${ctx}`, base);
  }
}

export function createLogger(base: LogContext = {}): Logger {
  const start = Date.now();

  const make = (level: LogLevel) => (event: string, ctx?: LogContext) =>
    emit(level, event, base, ctx);

  return {
    debug: make('debug'),
    info:  make('info'),
    warn:  make('warn'),
    error: make('error'),
    elapsed: () => Date.now() - start,
  };
}

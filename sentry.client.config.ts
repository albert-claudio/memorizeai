import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Send 100% of errors in production, adjust down if volume grows
  sampleRate: 1.0,

  // Performance monitoring — 10% of transactions
  tracesSampleRate: 0.1,

  // Replay — capture 1% of sessions, 100% on error
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration(),
    Sentry.browserTracingIntegration(),
  ],

  // Filter out noisy/irrelevant errors
  ignoreErrors: [
    "ResizeObserver loop",
    "AbortError",
    "TypeError: Failed to fetch",
    "TypeError: NetworkError",
    "TypeError: Load failed",
  ],

  environment: process.env.NODE_ENV,
});

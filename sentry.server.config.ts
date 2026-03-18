import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Send 100% of errors
  sampleRate: 1.0,

  // Performance monitoring — 10% of server transactions
  tracesSampleRate: 0.1,

  environment: process.env.NODE_ENV,
});

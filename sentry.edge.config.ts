import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  sampleRate: 1.0,
  tracesSampleRate: 0.1,

  environment: process.env.NODE_ENV,
});

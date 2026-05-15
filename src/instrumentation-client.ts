// This file configures the initialization of Sentry on the client.
// The config lives in sentry.client.config.ts — we only re-export
// the router transition hook here as required by Next.js instrumentation.
//
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

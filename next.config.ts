import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { buildContentSecurityPolicy } from "./src/lib/security/csp";

const isDev = process.env.NODE_ENV !== 'production';

const nextConfig: NextConfig = {
  // Aumentar limite de body para uploads grandes (50MB)
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },

  // HTTP Security Headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Content-Security-Policy',
            value: buildContentSecurityPolicy(isDev),
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry build options
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Upload source maps for better stack traces
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },

  // Suppress Sentry CLI logs during build
  silent: !process.env.CI,

  // Disable Sentry telemetry
  telemetry: false,
});

import { timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';

type BillingE2EFlag = 'BILLING_E2E_ENABLED' | 'BILLING_CHECKOUT_E2E_ENABLED';

function isNonProductionBillingE2EEnvironment(): boolean {
  const appEnv = (process.env.APP_ENV || '').toLowerCase();
  const vercelEnv = (process.env.VERCEL_ENV || '').toLowerCase();
  const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();

  if (appEnv === 'staging' || appEnv === 'test') {
    return true;
  }

  if (vercelEnv) {
    return vercelEnv !== 'production';
  }

  return nodeEnv !== 'production';
}

export function isBillingIntegrationRouteEnabled(flagName: BillingE2EFlag): boolean {
  return (
    process.env[flagName] === 'true' &&
    Boolean(process.env.BILLING_E2E_SECRET) &&
    isNonProductionBillingE2EEnvironment()
  );
}

export function hasValidBillingE2EKey(request: NextRequest): boolean {
  const expectedKey = process.env.BILLING_E2E_SECRET;
  const providedKey = request.headers.get('x-billing-e2e-key');
  if (!expectedKey || !providedKey) {
    return false;
  }

  const expectedBuffer = Buffer.from(expectedKey, 'utf8');
  const providedBuffer = Buffer.from(providedKey, 'utf8');
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

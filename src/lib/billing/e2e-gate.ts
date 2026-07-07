import { timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';

type BillingE2EFlag = 'BILLING_E2E_ENABLED' | 'BILLING_CHECKOUT_E2E_ENABLED';

function getDeploymentEnvironment(): string {
  return (
    process.env.VERCEL_ENV ||
    process.env.APP_ENV ||
    process.env.NODE_ENV ||
    ''
  ).toLowerCase();
}

export function isBillingIntegrationRouteEnabled(flagName: BillingE2EFlag): boolean {
  const deploymentEnvironment = getDeploymentEnvironment();

  return (
    process.env[flagName] === 'true' &&
    Boolean(process.env.BILLING_E2E_SECRET) &&
    deploymentEnvironment !== 'production'
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

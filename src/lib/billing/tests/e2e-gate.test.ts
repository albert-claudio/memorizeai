import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  hasValidBillingE2EKey,
  isBillingIntegrationRouteEnabled,
} from '@/lib/billing/e2e-gate';

describe('billing E2E deployment gate', () => {
  beforeEach(() => {
    delete process.env.APP_ENV;
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = 'test';
    process.env.BILLING_E2E_SECRET = 'secret-token';
    process.env.BILLING_E2E_ENABLED = 'true';
    process.env.BILLING_CHECKOUT_E2E_ENABLED = 'true';
  });

  it('allows staging/preview deployments even when NODE_ENV is production', () => {
    process.env.NODE_ENV = 'production';
    process.env.VERCEL_ENV = 'preview';

    expect(isBillingIntegrationRouteEnabled('BILLING_E2E_ENABLED')).toBe(true);
    expect(isBillingIntegrationRouteEnabled('BILLING_CHECKOUT_E2E_ENABLED')).toBe(true);
  });

  it('allows explicit APP_ENV=staging for non-Vercel staging deployments', () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_ENV = 'staging';

    expect(isBillingIntegrationRouteEnabled('BILLING_E2E_ENABLED')).toBe(true);
  });

  it('allows explicit APP_ENV=staging for custom-domain staging on Vercel', () => {
    process.env.NODE_ENV = 'production';
    process.env.VERCEL_ENV = 'production';
    process.env.APP_ENV = 'staging';

    expect(isBillingIntegrationRouteEnabled('BILLING_E2E_ENABLED')).toBe(true);
  });

  it('stays disabled on production deployments without explicit staging marker', () => {
    process.env.NODE_ENV = 'production';
    process.env.VERCEL_ENV = 'production';

    expect(isBillingIntegrationRouteEnabled('BILLING_E2E_ENABLED')).toBe(false);
  });

  it('requires the route flag and secret', () => {
    delete process.env.BILLING_E2E_SECRET;

    expect(isBillingIntegrationRouteEnabled('BILLING_E2E_ENABLED')).toBe(false);

    process.env.BILLING_E2E_SECRET = 'secret-token';
    process.env.BILLING_E2E_ENABLED = 'false';

    expect(isBillingIntegrationRouteEnabled('BILLING_E2E_ENABLED')).toBe(false);
  });

  it('checks the integration key with exact length and value matching', () => {
    const validRequest = new NextRequest('https://staging.vimens.app/api/stripe/integration/bootstrap', {
      headers: { 'x-billing-e2e-key': 'secret-token' },
    });
    const wrongRequest = new NextRequest('https://staging.vimens.app/api/stripe/integration/bootstrap', {
      headers: { 'x-billing-e2e-key': 'secret-token-extra' },
    });

    expect(hasValidBillingE2EKey(validRequest)).toBe(true);
    expect(hasValidBillingE2EKey(wrongRequest)).toBe(false);
  });
});

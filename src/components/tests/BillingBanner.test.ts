import { describe, expect, it } from 'vitest';
import { getBillingBannerConfig } from '@/components/BillingBanner';

describe('BillingBanner config', () => {
  it('shows an upgrade action for active free trials', () => {
    const config = getBillingBannerConfig({
      isPro: true,
      status: 'trialing',
      tier: 'pro',
      periodEnd: 1_800_000_000_000,
      cancelAtPeriodEnd: false,
      isActive: true,
      isTrial: true,
    });

    expect(config).toEqual(
      expect.objectContaining({
        color: 'blue',
        action: { label: 'Assinar Pro', href: '/upgrade' },
      }),
    );
    expect(config?.message).toContain('Seu teste gratis esta ativo');
  });

  it('does not render for expired trial state normalized to free', () => {
    expect(getBillingBannerConfig({
      isPro: false,
      status: 'free',
      tier: 'free',
      periodEnd: null,
      cancelAtPeriodEnd: false,
      isActive: false,
      isTrial: false,
    })).toBeNull();
  });
});

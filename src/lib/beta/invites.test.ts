import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  generateInviteCode,
  hashInviteCode,
  isBetaSubscription,
  normalizeInviteName,
  normalizeInviteCode,
  normalizeInviteEmail,
  trialEndsAt,
} from './invites';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('beta invites', () => {
  it('normalizes invite email and code', () => {
    expect(normalizeInviteName('  Maria   Silva  ')).toBe('Maria Silva');
    expect(normalizeInviteEmail(' User@Example.COM ')).toBe('user@example.com');
    expect(normalizeInviteCode(' 12-34 56 ')).toBe('123456');
  });

  it('generates six digit codes', () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it('hashes code with email binding', () => {
    vi.stubEnv('BETA_INVITE_CODE_SECRET', 'x'.repeat(32));

    const first = hashInviteCode('a@example.com', '123456');
    const second = hashInviteCode('b@example.com', '123456');
    const equivalent = hashInviteCode(' A@Example.com ', '123-456');

    expect(first).not.toBe(second);
    expect(first).toBe(equivalent);
  });

  it('uses configured trial days', () => {
    vi.stubEnv('BETA_TRIAL_DAYS', '10');
    expect(trialEndsAt(1_000)).toBe(1_000 + 10 * 24 * 60 * 60 * 1000);
  });

  it('detects internal beta subscription rows', () => {
    expect(isBetaSubscription({ price_id: 'beta_access' })).toBe(true);
    expect(isBetaSubscription({ stripe_subscription_id: 'beta_trial_invite-id' })).toBe(true);
    expect(isBetaSubscription({ price_id: 'price_pro' })).toBe(false);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

describe('url helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('uses the browser origin when the configured public app URL is localhost', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
    vi.stubGlobal('window', {
      location: {
        origin: 'https://vimens.app',
      },
    });

    const { getAppUrl } = await import('@/lib/url');

    expect(getAppUrl('/auth/callback?type=signup')).toBe('https://vimens.app/auth/callback?type=signup');
  });

  it('uses a non-local configured public app URL over the browser origin', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.vimens.com/');
    vi.stubGlobal('window', {
      location: {
        origin: 'https://preview.vimens.com',
      },
    });

    const { getAppUrl } = await import('@/lib/url');

    expect(getAppUrl('/auth/callback')).toBe('https://app.vimens.com/auth/callback');
  });
});

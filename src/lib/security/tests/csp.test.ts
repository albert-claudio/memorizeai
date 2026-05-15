import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy } from '@/lib/security/csp';

describe('content security policy', () => {
  it('locks down production against inline event handlers and framing', () => {
    const csp = buildContentSecurityPolicy(false);

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src-attr 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain('upgrade-insecure-requests');
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it('keeps development eval allowance isolated to dev mode', () => {
    const csp = buildContentSecurityPolicy(true);

    expect(csp).toContain("'unsafe-eval'");
    expect(csp).not.toContain('upgrade-insecure-requests');
  });
});

import { describe, expect, it } from 'vitest';
import { hasRequiredRole, isAdminRole, normalizeAppRole } from '@/lib/auth/rbac';

describe('rbac helpers', () => {
  it('normalizes unknown values to user', () => {
    expect(normalizeAppRole(undefined)).toBe('user');
    expect(normalizeAppRole('owner')).toBe('user');
  });

  it('detects admin role correctly', () => {
    expect(isAdminRole('admin')).toBe(true);
    expect(isAdminRole('user')).toBe(false);
  });

  it('supports role hierarchy checks', () => {
    expect(hasRequiredRole('admin', 'user')).toBe(true);
    expect(hasRequiredRole('admin', 'admin')).toBe(true);
    expect(hasRequiredRole('user', 'admin')).toBe(false);
  });
});

export const APP_ROLES = ['user', 'admin'] as const;

export type AppRole = (typeof APP_ROLES)[number];

const ROLE_RANK: Record<AppRole, number> = {
  user: 0,
  admin: 1,
};

export function normalizeAppRole(value: unknown): AppRole {
  return value === 'admin' ? 'admin' : 'user';
}

export function hasRequiredRole(
  currentRole: unknown,
  requiredRole: AppRole
): boolean {
  return ROLE_RANK[normalizeAppRole(currentRole)] >= ROLE_RANK[requiredRole];
}

export function isAdminRole(role: unknown): boolean {
  return hasRequiredRole(role, 'admin');
}

import crypto from 'crypto';

export const LOGIN_CSRF_COOKIE = 'vimens_login_csrf';

export function createCsrfToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function isValidCsrfToken(token: string | null | undefined, cookieValue: string | null | undefined): boolean {
  if (!token || !cookieValue || token.length !== cookieValue.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(cookieValue));
}

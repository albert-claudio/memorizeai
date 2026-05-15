import { NextResponse } from 'next/server';
import { createCsrfToken, LOGIN_CSRF_COOKIE } from '@/lib/security/csrf-token';

export async function GET() {
  const token = createCsrfToken();
  const response = NextResponse.json({ token });
  response.cookies.set(LOGIN_CSRF_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 10 * 60,
  });
  return response;
}

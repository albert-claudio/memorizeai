import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getClientIP } from '@/lib/security/rate-limiter';
import { LOGIN_CSRF_COOKIE, isValidCsrfToken } from '@/lib/security/csrf-token';
import { clearFailedLogins, getLoginLockout, recordFailedLogin } from '@/lib/security/auth-lockout';

function normalizeEmail(email: unknown): string {
  return String(email ?? '').trim().toLowerCase();
}

function getRetryAfterSeconds(lockedUntil: number | null): number {
  if (!lockedUntil) return 60;
  return Math.max(1, Math.ceil((lockedUntil - Date.now()) / 1000));
}

function matchesConfiguredAdminCredentials(email: string, password: string): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();
  const adminEmails = process.env.ADMIN_EMAILS?.split(/[,\s;]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean) ?? [];

  return Boolean(adminPassword && password === adminPassword && adminEmails.includes(email));
}

async function notifyLoginLockout(email: string, ip: string) {
  const apiKey = process.env.NEXT_RESEND_API_KEY?.trim();
  const to = process.env.SECURITY_ALERT_EMAIL?.trim();
  if (!apiKey || !to) return;

  const from = process.env.NOTIFICATIONS_FROM_EMAIL?.trim() || 'Vimens <noreply@vimens.com.br>';
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'Lockout de login na Vimens',
      html: `<p>Login bloqueado apos tentativas falhas.</p><p><strong>Email:</strong> ${email}</p><p><strong>IP:</strong> ${ip}</p>`,
    }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => undefined);
}

export async function POST(request: NextRequest) {
  const csrfHeader = request.headers.get('x-csrf-token');
  const csrfCookie = request.cookies.get(LOGIN_CSRF_COOKIE)?.value;

  if (!isValidCsrfToken(csrfHeader, csrfCookie)) {
    return NextResponse.json(
      { error: 'Sessao de login expirada. Recarregue a pagina e tente novamente.' },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const password = String(body.password ?? '');

  if (!email || !password) {
    return NextResponse.json(
      { error: 'Email e senha sao obrigatorios.' },
      { status: 400 }
    );
  }

  const ip = getClientIP(request);
  const lockout = await getLoginLockout(email, ip);
  if (lockout.locked) {
    const retryAfter = getRetryAfterSeconds(lockout.lockedUntil);
    return NextResponse.json(
      { error: `Muitas tentativas falhas. Tente novamente em ${retryAfter} segundos.`, retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const failed = await recordFailedLogin(email, ip);
    if (failed.locked) {
      await notifyLoginLockout(email, ip);
      const retryAfter = getRetryAfterSeconds(failed.lockedUntil);
      return NextResponse.json(
        { error: `Muitas tentativas falhas. Tente novamente em ${retryAfter} segundos.`, retryAfter },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    if (error.message.includes('Email not confirmed')) {
      return NextResponse.json(
        { error: 'Email not confirmed', code: 'EMAIL_NOT_CONFIRMED' },
        { status: 401 }
      );
    }

    if (matchesConfiguredAdminCredentials(email, password)) {
      return NextResponse.json(
        {
          error: 'Credenciais de admin do .env detectadas, mas a conta ainda nao esta pronta no Supabase Auth. Rode npm run admin:bootstrap e tente novamente.',
          code: 'ADMIN_BOOTSTRAP_REQUIRED',
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Email ou senha incorretos.' },
      { status: 401 }
    );
  }

  await clearFailedLogins(email, ip);
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(LOGIN_CSRF_COOKIE);
  return response;
}

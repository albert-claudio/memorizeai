import type { NextRequest } from 'next/server';
import { getBaseUrl } from '@/lib/url';

export function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function getRequestOrigin(request: NextRequest): string | null {
  return normalizeOrigin(request.headers.get('origin') || request.headers.get('referer'));
}

function getConfiguredExtraOrigins(): string[] {
  return (process.env.ALLOWED_APP_ORIGINS ?? '')
    .split(/[,\s]+/)
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function getAllowedRequestOrigins(request: NextRequest): Set<string> {
  const origins = [
    getBaseUrl(),
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.BILLING_E2E_APP_URL,
    'https://www.vimens.com.br',
    'https://vimens.com.br',
    'https://vimens.app',
    'https://www.vimens.app',
    ...getConfiguredExtraOrigins(),
  ];

  if (process.env.NODE_ENV !== 'production') {
    origins.push(request.nextUrl.origin, 'http://localhost:3000');
  }

  return new Set(
    origins
      .map((origin) => normalizeOrigin(origin))
      .filter((origin): origin is string => Boolean(origin)),
  );
}

export function isAllowedRequestOrigin(request: NextRequest): boolean {
  const requestOrigin = getRequestOrigin(request);
  return Boolean(requestOrigin && getAllowedRequestOrigins(request).has(requestOrigin));
}

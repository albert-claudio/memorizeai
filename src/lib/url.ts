export function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return trimTrailingSlash(process.env.NEXT_PUBLIC_APP_URL);
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return 'http://localhost:3000';
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function isLocalhostUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
  } catch {
    return false;
  }
}

export function getPublicAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (typeof window !== 'undefined') {
    const browserOrigin = window.location.origin;
    if (configured && (!isLocalhostUrl(configured) || isLocalhostUrl(browserOrigin))) {
      return trimTrailingSlash(configured);
    }

    return trimTrailingSlash(browserOrigin);
  }

  return getBaseUrl();
}

export function getAppUrl(path = '/'): string {
  return new URL(path, `${getPublicAppUrl()}/`).toString();
}

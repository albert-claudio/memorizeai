export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizePlainText(value: string, maxLength: number = 2000): string {
  const normalized = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

export function sanitizeAppNavigationPath(
  value: unknown,
  appOrigin?: string | null,
): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    if (appOrigin) {
      const base = new URL(appOrigin);
      const parsed = new URL(trimmed, base);

      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return null;
      }

      if (parsed.origin !== base.origin) {
        return null;
      }

      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    return null;
  }

  if (trimmed.startsWith('//')) return null;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmed)) return null;
  if (trimmed.startsWith('/')) return trimmed;

  if (/^[A-Za-z0-9._~!$&'()*+,;=:@/?#%-]+$/.test(trimmed)) {
    return `/${trimmed.replace(/^\/+/, '')}`;
  }

  return null;
}

import type { CSSProperties } from 'react';

export const tokens = {
  pageBg: '#0f1117',
  cardBg: '#1a1d27',
  cardBorder: '1px solid rgba(255,255,255,0.06)',
  accent: '#7c3aed',
  accentMuted: 'rgba(124,58,237,0.2)',
  textPrimary: '#ffffff',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
} as const;

export const cardStyle: CSSProperties = {
  background: tokens.cardBg,
  border: tokens.cardBorder,
  borderRadius: 12,
  padding: 20,
};

export const labelStyle: CSSProperties = {
  color: tokens.textSecondary,
  fontSize: 11,
  fontWeight: 700,
  marginBottom: 8,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

export const sectionTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: tokens.textPrimary,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  margin: 0,
};

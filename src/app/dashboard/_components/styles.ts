import React from 'react';

// ============================================================================
// SHARED STYLES - Premium Design System
// ============================================================================

export const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 52,
  padding: '0 18px',
  fontSize: 15,
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  color: '#f4f4f5',
  outline: 'none',
  transition: 'all 0.2s ease',
};

export const primaryButtonStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '16px 28px',
  background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
  border: 'none',
  borderRadius: 12,
  color: 'white',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: '0 0 24px rgba(99, 102, 241, 0.3)',
  transition: 'all 0.2s ease',
};

export const secondaryButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '16px 28px',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  color: '#a1a1aa',
  fontSize: 15,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 0.2s ease',
};

// Color options for deck display (not stored in DB)
export const DECK_COLORS = [
  '#6366F1', '#8B5CF6', '#EC4899', '#EF4444',
  '#F59E0B', '#22C55E', '#06B6D4', '#3B82F6',
];

export function getDeckColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return DECK_COLORS[Math.abs(hash) % DECK_COLORS.length];
}

// CSS Keyframes (to be included in the page)
export const globalStyles = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @keyframes pulse-glow {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; }
  }
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
`;

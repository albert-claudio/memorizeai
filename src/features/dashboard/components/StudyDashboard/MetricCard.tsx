'use client';

import type { ReactNode } from 'react';
import { SectionCard } from './SectionCard';
import { labelStyle, tokens } from './tokens';

interface MetricCardProps {
  label: string;
  value: string;
  subtext: string;
  icon: ReactNode;
}

export function MetricCard({ label, value, subtext, icon }: MetricCardProps) {
  return (
    <SectionCard className="study-section-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={labelStyle}>{label}</p>
          <h4
            className="study-metric-value"
            style={{
              color: tokens.textPrimary,
              fontSize: 26,
              fontWeight: 700,
              margin: '0 0 6px',
              letterSpacing: '-0.02em',
            }}
          >
            {value}
          </h4>
          <p style={{ fontSize: 13, fontWeight: 500, color: tokens.textSecondary, margin: 0, lineHeight: 1.4 }}>
            {subtext}
          </p>
        </div>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: tokens.accentMuted,
            border: `1px solid rgba(124,58,237,0.25)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: tokens.accent,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      </div>
    </SectionCard>
  );
}

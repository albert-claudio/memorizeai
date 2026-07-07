'use client';

import type { CSSProperties, ReactNode } from 'react';
import { cardStyle } from './tokens';

interface SectionCardProps {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}

export function SectionCard({ children, style, className }: SectionCardProps) {
  return (
    <div className={className} style={{ ...cardStyle, boxSizing: 'border-box', ...style }}>
      {children}
    </div>
  );
}

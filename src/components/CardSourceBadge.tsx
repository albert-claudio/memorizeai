'use client';

import { useState, type MouseEvent, type TouchEvent } from 'react';
import type { CardSourceReference } from '@/lib/types';

interface CardSourceBadgeProps {
  reference?: CardSourceReference | null;
  tone?: 'default' | 'dark';
}

function BookIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function stopCardInteraction(event: MouseEvent | TouchEvent) {
  event.stopPropagation();
}

export function CardSourceBadge({ reference, tone = 'default' }: CardSourceBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!reference) return null;

  const isDark = tone === 'dark';
  const pageLabel = reference.pageNumber ? `Pag. ${reference.pageNumber}` : null;

  return (
    <div
      onMouseDown={stopCardInteraction}
      onTouchStart={stopCardInteraction}
      onClick={stopCardInteraction}
      style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}
    >
      <button
        type="button"
        aria-label="Ver fonte do card"
        title="Ver fonte"
        onClick={() => setIsOpen((open) => !open)}
        style={{
          width: 26,
          height: 26,
          borderRadius: 7,
          border: isDark ? '1px solid rgba(255,255,255,0.14)' : '1px solid var(--border)',
          background: isOpen
            ? 'rgba(99, 102, 241, 0.18)'
            : isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
          color: isOpen ? 'var(--accent)' : isDark ? 'rgba(255,255,255,0.55)' : 'var(--text-muted)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        <BookIcon />
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Fonte do card"
          style={{
            position: 'absolute',
            top: 34,
            right: 0,
            width: 280,
            maxWidth: 'calc(100vw - 40px)',
            zIndex: 80,
            padding: 12,
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--bg-overlay)',
            boxShadow: '0 18px 48px rgba(0,0,0,0.35)',
            color: 'var(--text-primary)',
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ color: 'var(--accent)', display: 'inline-flex' }}>
              <BookIcon />
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Fonte
            </span>
          </div>

          <p style={{ fontSize: 13, lineHeight: 1.35, fontWeight: 600, marginBottom: pageLabel ? 4 : 10 }}>
            {reference.sourceName}
          </p>
          {pageLabel && (
            <p style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 10 }}>
              {pageLabel}
            </p>
          )}
          {reference.excerpt && (
            <p style={{
              fontSize: 12,
              lineHeight: 1.45,
              color: 'var(--text-secondary)',
              borderLeft: '2px solid var(--accent)',
              paddingLeft: 10,
              maxHeight: 96,
              overflowY: 'auto',
            }}>
              {reference.excerpt}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

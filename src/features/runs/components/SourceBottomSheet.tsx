'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import type { Source } from '@/lib/types';
import { Icons } from './Icons';

interface SourceBottomSheetProps {
  open: boolean;
  onClose: () => void;
  sources: Source[];
  selectedSource: Source | null;
  onSelectSource: (source: Source) => void;
  loadingSources: boolean;
}

export function SourceBottomSheet({
  open,
  onClose,
  sources,
  selectedSource,
  onSelectSource,
  loadingSources,
}: SourceBottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleSelect = (source: Source) => {
    onSelectSource(source);
    onClose();
  };

  return (
    <>
      <style>{`
        .source-sheet-overlay {
          position: fixed;
          inset: 0;
          z-index: 100;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.3s ease;
        }

        .source-sheet-overlay.open {
          opacity: 1;
          pointer-events: auto;
        }

        .source-sheet-panel {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 101;
          background: #1c1c1e;
          border-radius: 20px 20px 0 0;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          transform: translateY(100%);
          transition: transform 0.35s cubic-bezier(0.32, 0.72, 0, 1);
          padding-bottom: env(safe-area-inset-bottom);
        }

        .source-sheet-panel.open {
          transform: translateY(0);
        }

        .source-sheet-handle {
          width: 36px;
          height: 4px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 999px;
          margin: 10px auto 0;
          flex-shrink: 0;
        }

        .source-sheet-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          flex-shrink: 0;
        }

        .source-sheet-list {
          flex: 1;
          overflow-y: auto;
          overscroll-behavior: contain;
          padding: 12px 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          -webkit-overflow-scrolling: touch;
        }

        .source-sheet-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 14px;
          cursor: pointer;
          text-align: left;
          width: 100%;
          transition: all 0.15s ease;
          -webkit-tap-highlight-color: transparent;
        }

        .source-sheet-item:active {
          transform: scale(0.98);
          background: rgba(99, 102, 241, 0.08);
        }

        .source-sheet-item.selected {
          background: rgba(99, 102, 241, 0.12);
          border-color: var(--accent, #6366F1);
          border-width: 2px;
        }

        .source-sheet-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
          text-align: center;
        }
      `}</style>

      {/* Overlay */}
      <div
        className={`source-sheet-overlay${open ? ' open' : ''}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={sheetRef}
        className={`source-sheet-panel${open ? ' open' : ''}`}
      >
        {/* Drag handle */}
        <div className="source-sheet-handle" />

        {/* Header */}
        <div className="source-sheet-header">
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#f4f4f5' }}>
              Escolha o arquivo
            </h3>
            <p style={{ fontSize: 12, color: '#71717a', marginTop: 2 }}>
              {sources.length} arquivo{sources.length !== 1 ? 's' : ''} disponíve{sources.length !== 1 ? 'is' : 'l'}
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              border: 'none',
              background: 'rgba(255, 255, 255, 0.08)',
              color: '#a1a1aa',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              fontWeight: 500,
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        {loadingSources ? (
          <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
            <Icons.Loader />
          </div>
        ) : sources.length === 0 ? (
          <div className="source-sheet-empty">
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'rgba(34, 197, 94, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 14,
                color: '#22C55E',
              }}
            >
              <Icons.File />
            </div>
            <p style={{ color: '#a1a1aa', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
              Nenhum PDF processado
            </p>
            <p style={{ color: '#71717a', fontSize: 12, marginBottom: 18, maxWidth: 260 }}>
              Faça upload de um PDF para começar a gerar conteúdo.
            </p>
            <Link
              href="/dashboard/upload"
              onClick={onClose}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 20px',
                background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
                borderRadius: 12,
                color: 'white',
                textDecoration: 'none',
                fontSize: 13,
                fontWeight: 700,
                boxShadow: '0 2px 12px rgba(34, 197, 94, 0.3)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Fazer upload
            </Link>
          </div>
        ) : (
          <div className="source-sheet-list">
            {sources.map((source) => {
              const isSelected = selectedSource?.id === source.id;

              return (
                <button
                  key={source.id}
                  className={`source-sheet-item${isSelected ? ' selected' : ''}`}
                  onClick={() => handleSelect(source)}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: isSelected ? 'var(--accent, #6366F1)' : 'rgba(255,255,255,0.06)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isSelected ? 'white' : '#71717a',
                      flexShrink: 0,
                    }}
                  >
                    <Icons.File />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: '#f4f4f5',
                        marginBottom: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {source.filename}
                    </p>
                    <p style={{ fontSize: 11, color: '#71717a' }}>
                      {source.total_pages ? `${source.total_pages} páginas` : 'Processado'}
                    </p>
                  </div>

                  {isSelected && (
                    <div style={{ color: 'var(--accent, #6366F1)', flexShrink: 0 }}>
                      <Icons.Check />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

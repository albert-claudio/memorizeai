'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Source } from '@/lib/types';
import { Icons } from './Icons';
import { SourceBottomSheet } from './SourceBottomSheet';

interface SourceStepProps {
  loadingSources: boolean;
  sources: Source[];
  selectedSource: Source | null;
  onSelectSource: (source: Source) => void;
  compact?: boolean;
}

export function SourceStep({
  loadingSources,
  sources,
  selectedSource,
  onSelectSource,
  compact = false,
}: SourceStepProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const sectionTitleSize = compact ? 16 : 18;
  const cardPadding = compact ? 16 : 20;

  return (
    <>
      <style>{`
        .source-step-root {
          margin-bottom: ${compact ? 0 : 32}px;
          height: ${compact ? '100%' : 'auto'};
          display: flex;
          flex-direction: column;
          min-height: 0;
          overflow: hidden;
        }

        /* Desktop: show file list, hide mobile trigger */
        .source-desktop-list {
          display: flex;
          flex-direction: column;
          flex: ${compact ? '1 1 0' : 'none'};
          min-height: ${compact ? '0' : 'auto'};
        }

        .source-mobile-trigger {
          display: none;
        }

        @media (max-width: 980px) {
          .source-step-root {
            height: auto !important;
            overflow: visible;
          }

          /* Mobile: hide file list, show trigger */
          .source-desktop-list {
            display: none !important;
          }

          .source-mobile-trigger {
            display: block;
          }
        }
      `}</style>

      <div className="source-step-root">
        {/* ── Header row (shared) ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h2 style={{ fontSize: sectionTitleSize, fontWeight: 700, marginBottom: 4 }}>
              1. Envie ou escolha seu material
            </h2>
            {compact && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                O simulado e as revisoes serao baseados nessa fonte.
              </p>
            )}
          </div>

          <Link
            href="/dashboard/upload"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: compact ? '9px 14px' : '10px 18px',
              background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
              borderRadius: 10,
              color: 'white',
              textDecoration: 'none',
              fontSize: compact ? 12 : 13,
              fontWeight: 700,
              boxShadow: '0 2px 12px rgba(34, 197, 94, 0.3)',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Novo PDF
          </Link>
        </div>

        {/* ── MOBILE: Trigger card + Bottom Sheet ── */}
        <div className="source-mobile-trigger">
          <button
            onClick={() => setSheetOpen(true)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '16px 18px',
              background: selectedSource ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-raised)',
              border: selectedSource
                ? '2px solid var(--accent, #6366F1)'
                : '1px solid var(--border)',
              borderRadius: 16,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.2s ease',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {/* Icon */}
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: selectedSource
                  ? 'var(--accent, #6366F1)'
                  : 'var(--bg-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: selectedSource ? 'white' : 'var(--text-muted)',
                flexShrink: 0,
              }}
            >
              <Icons.File />
            </div>

            {/* Text */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {loadingSources ? (
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)' }}>
                  Carregando...
                </p>
              ) : selectedSource ? (
                <>
                  <p
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      marginBottom: 2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {selectedSource.filename}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {selectedSource.total_pages
                      ? `${selectedSource.total_pages} paginas`
                      : 'Processado'}{' '}
                    · Toque para trocar
                  </p>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Nenhum arquivo selecionado
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    Toque para escolher um PDF
                  </p>
                </>
              )}
            </div>

            {/* Chevron */}
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0 }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {/* Bottom Sheet */}
          <SourceBottomSheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            sources={sources}
            selectedSource={selectedSource}
            onSelectSource={onSelectSource}
            loadingSources={loadingSources}
          />
        </div>

        {/* ── DESKTOP: Full file list (unchanged) ── */}
        <div className="source-desktop-list">
          {loadingSources ? (
            <div
              style={{
                flex: compact ? 1 : undefined,
                minHeight: compact ? 0 : undefined,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg-raised)',
                border: '1px solid var(--border)',
                borderRadius: 18,
                padding: 40,
              }}
            >
              <Icons.Loader />
            </div>
          ) : sources.length === 0 ? (
            <div
              style={{
                flex: compact ? 1 : undefined,
                minHeight: compact ? 0 : undefined,
                background: 'var(--bg-raised)',
                border: '1px solid var(--border)',
                borderRadius: 18,
                padding: compact ? 28 : 40,
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  background: 'rgba(34, 197, 94, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 16,
                  color: '#22C55E',
                }}
              >
                <Icons.File />
              </div>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 8, fontSize: 15, fontWeight: 600 }}>
                Nenhum PDF processado ainda
              </p>
              <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: 13, maxWidth: 320 }}>
                Faca upload de um PDF para transformar seu material em treino de prova.
              </p>
              <Link
                href="/dashboard/upload"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '14px 24px',
                  background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
                  borderRadius: 12,
                  color: 'white',
                  textDecoration: 'none',
                  fontSize: 14,
                  fontWeight: 700,
                  boxShadow: '0 4px 16px rgba(34, 197, 94, 0.3)',
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Fazer upload de PDF
              </Link>
            </div>
          ) : (
            <div
              style={{
                flex: compact ? '1 1 0' : undefined,
                minHeight: compact ? 0 : undefined,
                background: 'var(--bg-raised)',
                border: '1px solid var(--border)',
                borderRadius: 20,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  padding: '14px 18px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  Arquivos prontos
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {sources.length} arquivo{sources.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div
                style={{
                  flex: '1 1 0',
                  padding: 16,
                  display: 'grid',
                  gap: 12,
                  overflowY: compact ? 'auto' : 'visible',
                  minHeight: 0,
                  alignContent: 'start',
                  scrollbarGutter: 'stable',
                  scrollPaddingTop: 16,
                  overscrollBehavior: 'contain',
                }}
              >
                {sources.map((source) => {
                  const isSelected = selectedSource?.id === source.id;

                  return (
                    <button
                      key={source.id}
                      onClick={() => onSelectSource(source)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: cardPadding,
                        background: isSelected ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255,255,255,0.02)',
                        border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                        borderRadius: 16,
                        cursor: 'pointer',
                        textAlign: 'left',
                        width: '100%',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div
                        style={{
                          width: compact ? 42 : 48,
                          height: compact ? 42 : 48,
                          borderRadius: 12,
                          background: isSelected ? 'var(--accent)' : 'var(--bg-muted)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: isSelected ? 'white' : 'var(--text-muted)',
                          flexShrink: 0,
                        }}
                      >
                        <Icons.File />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          style={{
                            fontSize: compact ? 14 : 15,
                            fontWeight: 700,
                            marginBottom: 4,
                            color: 'var(--text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {source.filename}
                        </p>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {source.total_pages ? `${source.total_pages} paginas` : 'Processado'}
                        </p>
                      </div>

                      {isSelected && (
                        <div style={{ color: 'var(--accent)', flexShrink: 0 }}>
                          <Icons.Check />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

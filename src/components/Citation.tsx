'use client';

import { useState } from 'react';

interface CitationProps {
  sourceName: string;
  pageNumber: number | null;
  excerpt: string;
  onViewPdf?: () => void;
}

// Icon components
const Icons = {
  Book: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>
  ),
  FileText: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14,2 14,8 20,8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  X: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  ExternalLink: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15,3 21,3 21,9"/>
      <line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  ),
};

/**
 * Citation button that shows a tooltip with source information
 */
export function CitationButton({ sourceName, pageNumber, excerpt, onViewPdf }: CitationProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* Citation Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="Ver fonte"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          borderRadius: 6,
          background: isOpen ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
          border: '1px solid var(--border)',
          color: isOpen ? 'var(--accent)' : 'var(--text-muted)',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
      >
        <Icons.Book />
      </button>
      
      {/* Citation Tooltip */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: 8,
            width: 300,
            maxWidth: '90vw',
            background: 'var(--bg-overlay)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
            zIndex: 100,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            background: 'rgba(99, 102, 241, 0.1)',
            borderBottom: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icons.FileText />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Fonte</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: 4,
              }}
            >
              <Icons.X />
            </button>
          </div>
          
          {/* Content */}
          <div style={{ padding: 16 }}>
            {/* Source Info */}
            <div style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                Documento
              </p>
              <p style={{ fontSize: 14, fontWeight: 500 }}>
                {sourceName}
              </p>
              {pageNumber && (
                <p style={{ fontSize: 13, color: 'var(--accent)', marginTop: 4 }}>
                  Página {pageNumber}
                </p>
              )}
            </div>
            
            {/* Excerpt */}
            <div style={{
              background: 'var(--bg-muted)',
              borderLeft: '3px solid var(--accent)',
              padding: '12px 16px',
              borderRadius: '0 8px 8px 0',
              marginBottom: 12,
            }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                "{excerpt}"
              </p>
            </div>
            
            {/* View PDF Button */}
            {onViewPdf && (
              <button
                onClick={onViewPdf}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '10px 16px',
                  background: 'var(--bg-muted)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <Icons.ExternalLink />
                Ir para o PDF
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Citation modal/sheet for mobile
 */
export function CitationSheet({ 
  isOpen, 
  onClose, 
  sourceName, 
  pageNumber, 
  excerpt, 
  onViewPdf 
}: CitationProps & { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;
  
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          zIndex: 998,
        }}
      />
      
      {/* Sheet */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'var(--bg-raised)',
          borderRadius: '20px 20px 0 0',
          zIndex: 999,
          maxHeight: '70vh',
          overflow: 'auto',
        }}
      >
        {/* Handle */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '12px 0 8px',
        }}>
          <div style={{
            width: 40,
            height: 4,
            borderRadius: 2,
            background: 'var(--border)',
          }} />
        </div>
        
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px 16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'rgba(99, 102, 241, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent)',
            }}>
              <Icons.FileText />
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>Fonte</h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Prova de origem</p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'var(--bg-muted)',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icons.X />
          </button>
        </div>
        
        {/* Content */}
        <div style={{ padding: '0 20px 32px' }}>
          {/* Document Info */}
          <div style={{
            background: 'var(--bg-muted)',
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
          }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
              Documento
            </p>
            <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
              {sourceName}
            </p>
            {pageNumber && (
              <span style={{
                display: 'inline-block',
                padding: '4px 10px',
                background: 'rgba(99, 102, 241, 0.15)',
                borderRadius: 6,
                color: 'var(--accent)',
                fontSize: 13,
                fontWeight: 500,
              }}>
                Página {pageNumber}
              </span>
            )}
          </div>
          
          {/* Excerpt */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
              Trecho original
            </p>
            <div style={{
              background: 'var(--bg-muted)',
              borderLeft: '3px solid var(--accent)',
              padding: 16,
              borderRadius: '0 12px 12px 0',
            }}>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, fontStyle: 'italic' }}>
                "{excerpt}"
              </p>
            </div>
          </div>
          
          {/* View PDF Button */}
          {onViewPdf && (
            <button
              onClick={onViewPdf}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                width: '100%',
                padding: '16px 24px',
                background: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
                border: 'none',
                borderRadius: 12,
                color: 'white',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 20px rgba(99, 102, 241, 0.3)',
              }}
            >
              <Icons.ExternalLink />
              Abrir PDF na Página {pageNumber || 1}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

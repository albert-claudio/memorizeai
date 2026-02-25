'use client';

import { Icons } from './Icons';

// ============================================================================
// MODAL COMPONENT - Glassmorphism Style
// ============================================================================

interface ModalProps {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}

export function Modal({ title, children, onClose }: ModalProps) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.85)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      zIndex: 100,
    }}>
      <div style={{
        background: '#141414',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 24,
        width: '100%',
        maxWidth: 460,
        overflow: 'hidden',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '22px 28px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <h2 style={{ 
            fontSize: 20, 
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: '#f4f4f5',
          }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              padding: 8,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#71717a',
              cursor: 'pointer',
              borderRadius: 10,
              transition: 'all 0.2s ease',
            }}
          >
            <Icons.X />
          </button>
        </div>
        
        {/* Content */}
        <div style={{ padding: 28 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

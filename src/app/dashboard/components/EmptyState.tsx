'use client';

import { Icons } from './Icons';

// ============================================================================
// EMPTY STATE COMPONENT
// ============================================================================

interface EmptyStateProps {
  onCreateDeck: () => void;
}

export function EmptyState({ onCreateDeck }: EmptyStateProps) {
  return (
    <div style={{
      background: '#111111',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 24,
      padding: 72,
      textAlign: 'center',
    }}>
      <div style={{
        width: 88,
        height: 88,
        borderRadius: 24,
        background: 'rgba(99, 102, 241, 0.1)',
        border: '1px solid rgba(99, 102, 241, 0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 28px',
        color: '#6366F1',
      }}>
        <Icons.Cards />
      </div>
      <h2 style={{ 
        fontSize: 22, 
        fontWeight: 600, 
        marginBottom: 10,
        letterSpacing: '-0.02em',
        color: '#f4f4f5',
      }}>
        Nenhum deck ainda
      </h2>
      <p style={{ 
        color: '#71717a', 
        marginBottom: 28, 
        maxWidth: 380, 
        margin: '0 auto 28px',
        fontSize: 15,
        lineHeight: 1.6,
      }}>
        Crie seu primeiro deck de flashcards para começar a estudar.
      </p>
      <button
        onClick={onCreateDeck}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          padding: '16px 32px',
          background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #EC4899 100%)',
          border: 'none',
          borderRadius: 14,
          color: 'white',
          fontSize: 16,
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 0 32px rgba(139, 92, 246, 0.4), 0 4px 16px rgba(99, 102, 241, 0.3)',
        }}
      >
        <Icons.Plus />
        Criar Primeiro Deck
      </button>
    </div>
  );
}

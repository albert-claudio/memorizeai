
import Link from 'next/link';
import { Icons } from './Icons';
import type { Deck } from '@/lib/types';

interface DeckHeaderProps {
  deck: Deck;
  hasCards: boolean;
  onStudy: () => void;
}

export function DeckHeader({ deck, hasCards, onStudy }: DeckHeaderProps) {
  return (
    <header style={{
      padding: '16px 24px',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: 'var(--bg-raised)',
      position: 'sticky',
      top: 0,
      zIndex: 50,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Link
          href="/dashboard"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            borderRadius: 10,
            background: 'var(--bg-muted)',
            color: 'var(--text-secondary)',
            textDecoration: 'none',
          }}
        >
          <Icons.ArrowLeft />
        </Link>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>{deck.title}</h1>
          {deck.description && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
              {deck.description}
            </p>
          )}
        </div>
      </div>
      
      {hasCards && (
        <button
          onClick={onStudy}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 20px',
            background: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
            border: 'none',
            borderRadius: 10,
            color: 'white',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(99, 102, 241, 0.3)',
          }}
        >
          <Icons.Play />
          Estudar
        </button>
      )}
    </header>
  );
}

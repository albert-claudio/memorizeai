
import Link from 'next/link';
import { Icons } from './Icons';
import type { Deck } from '@/lib/types';

interface DeckHeaderProps {
  deck: Deck;
  hasCards: boolean;
  onStudy: () => void;
  onConfigureExamTarget: () => void;
  examTargetLabel?: string | null;
}

export function DeckHeader({ deck, hasCards, onStudy, onConfigureExamTarget, examTargetLabel }: DeckHeaderProps) {
  return (
    <header style={{
      padding: '16px 24px',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      flexWrap: 'wrap',
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
          {examTargetLabel && (
            <div style={{
              marginTop: 8,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 10px',
              borderRadius: 999,
              background: 'rgba(99, 102, 241, 0.12)',
              color: '#c7d2fe',
              fontSize: 12,
              fontWeight: 700,
              lineHeight: 1,
            }}>
              <Icons.Flag />
              {examTargetLabel}
            </div>
          )}
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: hasCards ? 'repeat(auto-fit, minmax(160px, 1fr))' : 'minmax(180px, 1fr)',
        gap: 12,
        width: '100%',
        maxWidth: hasCards ? 420 : 220,
        marginLeft: 'auto',
      }}>
        <button
          onClick={onConfigureExamTarget}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            minHeight: 46,
            padding: '12px 18px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            color: 'var(--text-primary)',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Icons.Calendar />
          Meta de prova
        </button>

        {hasCards && (
          <button
            onClick={onStudy}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              minHeight: 46,
              padding: '12px 20px',
              background: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
              border: 'none',
              borderRadius: 12,
              color: 'white',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(99, 102, 241, 0.3)',
            }}
          >
            <Icons.Play />
            Estudar
          </button>
        )}
      </div>
    </header>
  );
}

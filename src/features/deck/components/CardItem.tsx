
import { useState } from 'react';
import type { Card } from '@/lib/types';
import { Icons } from './Icons';
import { CardSourceBadge } from '@/components/CardSourceBadge';

interface CardItemProps {
  card: Card;
  onEdit: (card: Card) => void;
  onDelete: (card: Card) => void;
}

export function CardItem({ card, onEdit, onDelete }: CardItemProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div
      style={{
        perspective: '1000px',
        height: 200,
      }}
    >
      <div
        onClick={() => setIsFlipped(!isFlipped)}
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          cursor: 'pointer',
          transformStyle: 'preserve-3d',
          transition: 'transform 0.5s ease',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* Front */}
        <div style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          backfaceVisibility: 'hidden',
          background: 'var(--bg-raised)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', letterSpacing: '0.05em' }}>FRENTE</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <CardSourceBadge reference={card.sourceReference} />
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(card); }}
                style={{ padding: 6, background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', borderRadius: 6 }}
              >
                <Icons.Edit />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(card); }}
                style={{ padding: 6, background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', borderRadius: 6 }}
              >
                <Icons.Trash />
              </button>
            </div>
          </div>
          <p style={{ flex: 1, fontSize: 15, lineHeight: 1.5, overflow: 'hidden' }}>{card.front}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>
            <Icons.Rotate />
            <span>Toque para virar</span>
          </div>
        </div>
        
        {/* Back */}
        <div style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          backfaceVisibility: 'hidden',
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(124, 58, 237, 0.1) 100%)',
          border: '1px solid var(--accent)',
          borderRadius: 16,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          transform: 'rotateY(180deg)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', letterSpacing: '0.05em' }}>VERSO</span>
            <CardSourceBadge reference={card.sourceReference} />
          </div>
          <p style={{ flex: 1, fontSize: 15, lineHeight: 1.5, overflow: 'hidden' }}>{card.back}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>
            <Icons.Rotate />
            <span>Toque para virar</span>
          </div>
        </div>
      </div>
    </div>
  );
}

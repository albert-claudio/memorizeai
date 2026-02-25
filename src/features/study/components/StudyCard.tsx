
import { forwardRef } from 'react';
import type { Card } from '@/lib/types';
import { Icons } from '@/features/deck/components/Icons';

interface StudyCardProps {
  card: Card;
  isFlipped: boolean;
  dragOffset: { x: number; y: number };
  swipeDirection: 'left' | 'right' | null;
  isDragging: boolean;
  onFlip: () => void;
  onDragStart: (x: number, y: number) => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: () => void;
}

export const StudyCard = forwardRef<HTMLDivElement, StudyCardProps>(({
  card,
  isFlipped,
  dragOffset,
  swipeDirection,
  isDragging,
  onFlip,
  onDragStart,
  onDragMove,
  onDragEnd
}, ref) => {
  
  const getCardStyle = () => {
    const rotation = dragOffset.x * 0.05;
    let transform = `translateX(${dragOffset.x}px) translateY(${dragOffset.y}px) rotate(${rotation}deg)`;
    
    if (swipeDirection === 'left') {
      transform = 'translateX(-150%) rotate(-30deg)';
    } else if (swipeDirection === 'right') {
      transform = 'translateX(150%) rotate(30deg)';
    }
    
    return {
      transform,
      transition: isDragging ? 'none' : 'transform 0.3s ease-out',
      perspective: '1000px',
      cursor: 'grab',
    };
  };

  return (
    <div
      ref={ref}
      style={{
        width: '100%',
        maxWidth: 600,
        height: 480,
        position: 'relative',
        zIndex: 10,
        ...getCardStyle(),
      }}
      onMouseDown={e => onDragStart(e.clientX, e.clientY)}
      onMouseMove={e => onDragMove(e.clientX, e.clientY)}
      onMouseUp={onDragEnd}
      onMouseLeave={onDragEnd}
      onTouchStart={e => onDragStart(e.touches[0].clientX, e.touches[0].clientY)}
      onTouchMove={e => onDragMove(e.touches[0].clientX, e.touches[0].clientY)}
      onTouchEnd={onDragEnd}
      onClick={onFlip}
    >
      <div style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        transformStyle: 'preserve-3d',
        transition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
        transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
      }}>
        {/* Front */}
        <div style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          backfaceVisibility: 'hidden',
          background: 'var(--bg-raised)',
          border: '1px solid var(--border)',
          borderRadius: 24,
          padding: 32,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 12px 40px -12px rgba(0,0,0,0.3)',
        }}>
          <span style={{ 
            fontSize: 12, 
            fontWeight: 700, 
            color: 'var(--accent)', 
            letterSpacing: '0.1em', 
            textTransform: 'uppercase',
            marginBottom: 24 
          }}>
            Pergunta
          </span>
          <div style={{ 
            flex: 1, 
            fontSize: 22, 
            lineHeight: 1.6, 
            fontWeight: 500,
            overflowY: 'auto',
          }}>
            {card.front}
          </div>
          <div style={{ 
            marginTop: 24, 
            paddingTop: 16, 
            borderTop: '1px solid var(--border)',
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            gap: 8, 
            color: 'var(--text-muted)', 
            fontSize: 13 
          }}>
            <Icons.Rotate />
            <span>Toque para ver a resposta</span>
          </div>
        </div>

        {/* Back */}
        <div style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          backfaceVisibility: 'hidden',
          background: '#09090b', // Darker background from screenshot
          border: '1px solid #6366f1', // Purple/Indigo border from screenshot
          borderRadius: 24,
          padding: 32,
          display: 'flex',
          flexDirection: 'column',
          transform: 'rotateY(180deg)',
          boxShadow: '0 0 0 1px rgba(99, 102, 241, 0.2), 0 20px 50px -10px rgba(0,0,0,0.5)',
        }}>
          <span style={{ 
            fontSize: 12, 
            fontWeight: 700, 
            color: '#22c55e', // Green text for "RESPOSTA" from screenshot
            letterSpacing: '0.1em', 
            textTransform: 'uppercase',
            marginBottom: 24 
          }}>
            RESPOSTA
          </span>
          <div style={{ 
            flex: 1, 
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            fontSize: 24, 
            lineHeight: 1.5, 
            fontWeight: 600,
            color: '#f4f4f5',
            overflowY: 'auto',
          }}>
            {card.back}
          </div>
          
          <div style={{
            marginTop: 'auto',
            textAlign: 'center',
            fontSize: 12,
            color: 'rgba(255,255,255,0.3)',
            fontWeight: 500,
            letterSpacing: '0.05em',
          }}>
            ← Errei &nbsp; | &nbsp; Acertei →
          </div>
        </div>
      </div>
    </div>
  );
});

StudyCard.displayName = 'StudyCard';

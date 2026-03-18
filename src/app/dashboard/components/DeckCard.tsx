'use client';

import { useRouter } from 'next/navigation';
import type { Deck } from '@/lib/types';
import { Icons } from './Icons';
import { getDeckColor } from './styles';

// ============================================================================
// DECK CARD COMPONENT - Mobile-First Premium Design
// ============================================================================

interface DeckCardProps {
  deck: Deck;
  cardCount: number;
  isMenuOpen: boolean;
  onMenuToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

// Helper to clean up deck titles (remove file extensions)
function cleanTitle(title: string): string {
  return title.replace(/\.(pdf|docx|pptx|txt)$/i, '');
}

export function DeckCard({ 
  deck, 
  cardCount, 
  isMenuOpen, 
  onMenuToggle, 
  onEdit, 
  onDelete 
}: DeckCardProps) {
  const router = useRouter();
  
  return (
    <div
      style={{
        background: '#111111',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 16,
        overflow: 'hidden',
        transition: 'all 0.25s ease',
      }}
    >
      {/* Color Accent Bar */}
      <div style={{ 
        height: 3, 
        background: `linear-gradient(90deg, ${getDeckColor(deck.id)}, ${getDeckColor(deck.id)}88)`,
      }} />
      
      {/* Content - More padding for mobile */}
      <div style={{ padding: '20px 18px' }}>
        {/* Header row */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'flex-start', 
          marginBottom: 12,
          gap: 12,
        }}>
          <h3 
            style={{ 
              fontSize: 16, 
              fontWeight: 600, 
              flex: 1, 
              cursor: 'pointer',
              color: '#f4f4f5',
              letterSpacing: '-0.01em',
              lineHeight: 1.35,
              // Limit to 2 lines
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
            onClick={() => router.push(`/deck/${deck.id}`)}
          >
            {cleanTitle(deck.title)}
          </h3>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMenuToggle();
              }}
              style={{
                padding: 10,
                background: 'transparent',
                border: 'none',
                color: '#52525b',
                cursor: 'pointer',
                borderRadius: 8,
                transition: 'all 0.2s ease',
              }}
            >
              <Icons.MoreVertical />
            </button>
            
            {/* Dropdown Menu */}
            {isMenuOpen && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                background: '#1a1a1a',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                padding: 6,
                minWidth: 140,
                boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
                zIndex: 50,
              }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '12px 12px',
                    background: 'transparent',
                    border: 'none',
                    color: '#e4e4e7',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                    borderRadius: 8,
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Icons.Edit />
                  Editar
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '12px 12px',
                    background: 'transparent',
                    border: 'none',
                    color: '#f87171',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                    borderRadius: 8,
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Icons.Trash />
                  Excluir
                </button>
              </div>
            )}
          </div>
        </div>
        
        {/* Track Badges */}
        {(deck.concurso || deck.materia || deck.tema) && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            marginBottom: deck.description ? 12 : 16,
          }}>
            {[deck.concurso, deck.materia, deck.tema].filter(Boolean).map((t, idx) => (
              <span key={idx} style={{
                padding: '4px 8px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 6,
                color: '#a1a1aa',
                fontSize: 12,
                fontWeight: 500,
              }}>
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Subtitle - AI generated badge */}
        {deck.description && (
          <p style={{ 
            fontSize: 13, 
            color: '#52525b', 
            marginBottom: 16, 
            lineHeight: 1.5,
          }}>
            {deck.description}
          </p>
        )}
        
        {/* Footer row - Card count and Study button */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          paddingTop: 14,
          borderTop: '1px solid rgba(255,255,255,0.05)',
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 6, 
            color: '#52525b', 
            fontSize: 13,
            fontWeight: 500,
          }}>
            <Icons.Cards />
            <span>{cardCount} cards</span>
          </div>
          
          <button
            onClick={() => router.push(`/deck/${deck.id}`)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 16px',
              background: 'rgba(99, 102, 241, 0.12)',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              borderRadius: 10,
              color: '#818cf8',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <Icons.Play />
            Estudar
          </button>
        </div>
      </div>
    </div>
  );
}


'use client';

import { useRouter } from 'next/navigation';
import { Icons } from '@/app/dashboard/components';
import { getDeckColor } from '@/app/dashboard/components/styles';
import type { DashboardStats } from '@/features/dashboard/hooks/useDashboardStats';
import { retentionLevel } from '@/features/dashboard/utils/dashboardPresentation';
import type { Deck } from '@/lib/types';
import { SectionCard } from './SectionCard';
import { sectionTitleStyle, tokens } from './tokens';

interface ActiveDecksGridProps {
  decks: Deck[];
  cardCounts: Record<string, number>;
  focusDecks: DashboardStats['focusDecks'];
}

function cleanTitle(title: string): string {
  return title.replace(/\.(pdf|docx|pptx|txt)$/i, '');
}

export function ActiveDecksGrid({ decks, cardCounts, focusDecks }: ActiveDecksGridProps) {
  const router = useRouter();
  const activeDecks = decks.slice(0, 6);

  return (
    <SectionCard className="study-section-card">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: tokens.accent }}><Icons.Layers /></span>
          <h2 style={sectionTitleStyle}>Decks ativos</h2>
        </div>
        <button
          type="button"
          onClick={() => router.push('/dashboard/decks')}
          style={{
            background: 'none',
            border: 'none',
            color: tokens.textSecondary,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          Ver todos <Icons.ArrowRight />
        </button>
      </div>

      {activeDecks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 16px' }}>
          <p style={{ color: tokens.textSecondary, marginBottom: 16 }}>Você ainda não tem nenhum deck.</p>
          <button
            type="button"
            onClick={() => router.push('/dashboard/decks')}
            style={{
              background: tokens.accent,
              color: '#fff',
              padding: '10px 20px',
              borderRadius: 8,
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Criar deck
          </button>
        </div>
      ) : (
        <div className="study-decks-grid">
          {activeDecks.map((deck) => {
            const count = cardCounts[deck.id] ?? 0;
            const retention = retentionLevel(deck.id, focusDecks);

            return (
              <div
                key={deck.id}
                className="study-deck-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: 14,
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.04)',
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: `${getDeckColor(deck.id)}22`,
                    border: `1px solid ${getDeckColor(deck.id)}44`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: getDeckColor(deck.id),
                    flexShrink: 0,
                  }}
                >
                  <Icons.Cards />
                </div>
                <div className="study-deck-card-body" style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      margin: '0 0 4px',
                      fontWeight: 600,
                      fontSize: 14,
                      color: tokens.textPrimary,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {cleanTitle(deck.title)}
                  </p>
                  <p style={{ margin: '0 0 6px', fontSize: 12, color: tokens.textSecondary }}>
                    {count} cards
                  </p>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      color: retention.color,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: retention.color,
                      }}
                    />
                    {retention.label}
                  </span>
                </div>
                <button
                  type="button"
                  className="study-deck-card-btn"
                  onClick={() => router.push(`/estudar/${deck.id}`)}
                  style={{
                    padding: '8px 14px',
                    background: tokens.accent,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  Estudar
                </button>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

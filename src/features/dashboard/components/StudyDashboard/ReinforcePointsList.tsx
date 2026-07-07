'use client';

import { useRouter } from 'next/navigation';
import { Icons } from '@/app/dashboard/components';
import type { DashboardStats } from '@/features/dashboard/hooks/useDashboardStats';
import { stabilityLabel } from '@/features/dashboard/utils/dashboardPresentation';
import { SectionCard } from './SectionCard';
import { sectionTitleStyle, tokens } from './tokens';

interface ReinforcePointsListProps {
  stats: DashboardStats;
}

interface ReinforceItem {
  key: string;
  label: string;
  errorBadge: string | null;
  stabilityText: string;
  href: string;
}

export function ReinforcePointsList({ stats }: ReinforcePointsListProps) {
  const router = useRouter();

  const items: ReinforceItem[] = [];

  stats.weakTopics
    .filter((t) => t.isWeak)
    .slice(0, 3)
    .forEach((wt) => {
      items.push({
        key: `weak-${wt.key}`,
        label: wt.label,
        errorBadge: wt.errorRate7d > 0 ? `${Math.round(wt.errorRate7d)}% erro recente` : null,
        stabilityText: stabilityLabel(wt.avgStability),
        href: '/dashboard/performance',
      });
    });

  stats.focusDecks.slice(0, 5 - items.length).forEach((fd) => {
    if (items.some((i) => i.label === fd.deckTitle)) return;
    items.push({
      key: `deck-${fd.deckId}`,
      label: fd.deckTitle,
      errorBadge:
        fd.errorRate7d > 15 ? `${Math.round(fd.errorRate7d)}% erro recente` : fd.overdueCards > 0 ? `${fd.overdueCards} atrasados` : null,
      stabilityText: stabilityLabel(fd.avgStability),
      href: `/deck/${fd.deckId}`,
    });
  });

  return (
    <SectionCard className="study-section-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <span style={{ color: tokens.accent }}><Icons.Target /></span>
        <h2 style={sectionTitleStyle}>Pontos para reforçar</h2>
      </div>

      {items.length === 0 ? (
        <p style={{ color: tokens.success, fontSize: 14, fontWeight: 500, margin: 0 }}>
          Sem pontos críticos detectados. Continue assim!
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((item) => (
            <div
              key={item.key}
              className="study-reinforce-item"
              style={{
                padding: '12px 14px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: tokens.accentMuted,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: tokens.accent,
                  flexShrink: 0,
                }}
              >
                <Icons.Cards />
              </div>
              <div className="study-reinforce-item-body">
                <p className="study-reinforce-item-label" style={{ margin: 0, fontWeight: 600, fontSize: 14, color: tokens.textPrimary }}>{item.label}</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
                  {item.errorBadge && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: tokens.error,
                        background: 'rgba(239,68,68,0.12)',
                        padding: '2px 8px',
                        borderRadius: 6,
                      }}
                    >
                      {item.errorBadge}
                    </span>
                  )}
                  <span style={{ fontSize: 12, color: tokens.textMuted }}>{item.stabilityText}</span>
                </div>
              </div>
              <button
                type="button"
                className="study-reinforce-btn"
                onClick={() => router.push(item.href)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: tokens.accent,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  flexShrink: 0,
                }}
              >
                Revisar <Icons.ArrowRight />
              </button>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

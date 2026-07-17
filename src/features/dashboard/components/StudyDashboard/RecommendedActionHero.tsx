'use client';

import { useRouter } from 'next/navigation';
import { Icons, ProgressRing } from '@/app/dashboard/components';
import type { HeroAction } from '@/features/dashboard/utils/dashboardPresentation';
import { priorityColor, priorityLabel } from '@/features/dashboard/utils/dashboardPresentation';
import { SectionCard } from './SectionCard';
import { labelStyle, tokens } from './tokens';

interface RecommendedActionHeroProps {
  hero: HeroAction;
  lastSimuladoPercent: number | null;
}

export function RecommendedActionHero({ hero, lastSimuladoPercent }: RecommendedActionHeroProps) {
  const router = useRouter();
  const ringPercent = lastSimuladoPercent ?? 0;

  return (
    <SectionCard className="study-hero-card study-section-card">
      <div className="study-hero-body">
        <p
          style={{
            ...labelStyle,
            color: tokens.accent,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 10,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ color: tokens.accent, flexShrink: 0 }}><Icons.Star /></span>
          Próxima ação recomendada
        </p>
        <h1
          className="study-hero-title"
          style={{
            fontSize: 28,
            fontWeight: 800,
            color: tokens.textPrimary,
            letterSpacing: '-0.02em',
            margin: '0 0 10px',
            lineHeight: 1.25,
          }}
        >
          {hero.title}
        </h1>
        <p className="study-hero-meta" style={{ fontSize: 14, color: tokens.textSecondary, margin: 0, lineHeight: 1.5 }}>
          {hero.dueCards > 0 && <>{hero.dueCards} cards pendentes • </>}
          {hero.estimatedMinutes} min estimados •{' '}
          <span style={{ color: priorityColor(hero.priority), fontWeight: 600 }}>
            {priorityLabel(hero.priority)}
          </span>
        </p>
      </div>

      <div className="study-hero-middle">
        <div className="study-hero-ring" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <ProgressRing percentage={ringPercent} size={80} strokeWidth={6} color={tokens.accent} />
          <span style={{ fontSize: 10, fontWeight: 700, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>
            Último simulado
          </span>
        </div>

        <div className="study-hero-actions">
          <button
            type="button"
            className="study-hero-btn"
            onClick={() => router.push(hero.reviewPath)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '14px 20px',
              background: tokens.accent,
              color: '#fff',
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              border: 'none',
            }}
          >
            <Icons.Play />
            Começar revisão
          </button>
          <button
            type="button"
            className="study-hero-btn"
            onClick={() => router.push(hero.simuladoPath)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '14px 20px',
              background: 'transparent',
              color: tokens.textPrimary,
              borderRadius: 10,
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            <Icons.Target />
            Fazer simulado
          </button>
        </div>
      </div>
    </SectionCard>
  );
}

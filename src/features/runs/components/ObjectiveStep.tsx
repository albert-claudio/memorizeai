
import type { RunObjective } from '@/lib/types';
import { Icons } from './Icons';
import { OBJECTIVES } from '../constants';

interface ObjectiveStepProps {
  isPro: boolean | null;
  selectedObjective: RunObjective | null;
  onSelectObjective: (objective: RunObjective) => void;
  onRequireUpgrade: () => void;
}

export function ObjectiveStep({
  isPro,
  selectedObjective,
  onSelectObjective,
  onRequireUpgrade,
}: ObjectiveStepProps) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
        2. Tipo de conteúdo
      </h2>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 16,
      }}>
        {OBJECTIVES.map(obj => {
          const isLocked = !isPro && obj.id !== 'flashcards';
          return (
            <button
              key={obj.id}
              onClick={() => {
                if (isLocked) {
                  onRequireUpgrade();
                } else {
                  onSelectObjective(obj.id);
                }
              }}
              style={{
                position: 'relative',
                padding: 24,
                background: isLocked
                  ? 'var(--bg-raised)'
                  : selectedObjective === obj.id
                    ? `${obj.color}15`
                    : 'var(--bg-raised)',
                border: selectedObjective === obj.id && !isLocked
                  ? `2px solid ${obj.color}`
                  : '1px solid var(--border)',
                borderRadius: 16,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
                opacity: isLocked ? 0.5 : 1,
              }}
            >
              {isLocked && (
                <div style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 10px',
                  background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#000',
                }}>
                  🔒 Pro
                </div>
              )}
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: selectedObjective === obj.id && !isLocked
                  ? obj.color
                  : 'var(--bg-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: selectedObjective === obj.id && !isLocked
                  ? 'white'
                  : 'var(--text-muted)',
                marginBottom: 16,
              }}>
                {obj.icon}
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                {obj.title}
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
                {obj.description}
              </p>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: 'var(--text-muted)',
              }}>
                <Icons.Clock />
                {obj.model}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

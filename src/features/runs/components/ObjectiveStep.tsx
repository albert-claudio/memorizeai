import type { RunObjective } from '@/lib/types';
import { Icons } from './Icons';
import type { ObjectiveOption } from '../constants';

interface ObjectiveStepProps {
  isPro: boolean | null;
  selectedObjective: RunObjective | null;
  onSelectObjective: (objective: RunObjective) => void;
  onRequireUpgrade: () => void;
  objectives: ObjectiveOption[];
  compact?: boolean;
}

export function ObjectiveStep({
  isPro,
  selectedObjective,
  onSelectObjective,
  onRequireUpgrade,
  objectives,
  compact = false,
}: ObjectiveStepProps) {
  return (
    <>
      <style>{`
        .objective-grid {
          display: grid;
          grid-template-columns: ${compact ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))'};
          gap: ${compact ? 12 : 16}px;
        }

        @media (max-width: 480px) {
          .objective-grid {
            gap: 10px !important;
          }

          .objective-card {
            min-height: 90px !important;
            padding: 12px 14px !important;
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            gap: 12px !important;
          }

          .objective-card-icon {
            margin-bottom: 0 !important;
          }
        }
      `}</style>

    <div style={{ marginBottom: compact ? 18 : 32 }}>
      <h2 style={{ fontSize: compact ? 16 : 18, fontWeight: 700, marginBottom: compact ? 10 : 14 }}>
        2. O que voce quer treinar?
      </h2>

      <div className="objective-grid">
        {objectives.map((obj) => {
          const isLocked = !isPro && obj.id !== 'flashcards';
          const isSelected = selectedObjective === obj.id && !isLocked;

          return (
            <button
              key={obj.id}
              className="objective-card"
              onClick={() => {
                if (isLocked) {
                  onRequireUpgrade();
                } else {
                  onSelectObjective(obj.id);
                }
              }}
              style={{
                position: 'relative',
                padding: compact ? '12px 14px' : 24,
                background: isLocked ? 'var(--bg-raised)' : isSelected ? `${obj.color}18` : 'var(--bg-raised)',
                border: isSelected ? `2px solid ${obj.color}` : '1px solid var(--border)',
                borderRadius: 16,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
                opacity: isLocked ? 0.56 : 1,
                minHeight: compact ? 112 : 192,
              }}
            >
              {isLocked && (
                <div
                  style={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    padding: '4px 8px',
                    background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 800,
                    color: '#000',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  Pro
                </div>
              )}

              <div
                className="objective-card-icon"
                style={{
                  width: compact ? 34 : 48,
                  height: compact ? 34 : 48,
                  borderRadius: 12,
                  background: isSelected ? obj.color : 'var(--bg-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isSelected ? 'white' : 'var(--text-muted)',
                  marginBottom: compact ? 8 : 16,
                  flexShrink: 0,
                }}
              >
                {obj.icon}
              </div>

              <div>
                <h3 style={{ fontSize: compact ? 13 : 16, fontWeight: 700, marginBottom: compact ? 4 : 8 }}>
                  {obj.title}
                </h3>

                <p
                  style={{
                    fontSize: compact ? 11 : 13,
                    color: 'var(--text-secondary)',
                    marginBottom: compact ? 6 : 12,
                    lineHeight: 1.45,
                  }}
                >
                  {obj.description}
                </p>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: compact ? 10 : 11,
                    color: 'var(--text-muted)',
                  }}
                >
                  <Icons.Clock />
                  {obj.model}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
    </>
  );
}

interface QuantityStepProps {
  isPro: boolean | null;
  targetCount: number;
  onSetTargetCount: (count: number) => void;
  onRequireUpgrade: () => void;
  compact?: boolean;
}

export function QuantityStep({
  isPro,
  targetCount,
  onSetTargetCount,
  onRequireUpgrade,
  compact = false,
}: QuantityStepProps) {
  return (
    <div style={{ marginBottom: compact ? 24 : 32 }}>
      <h2 style={{ fontSize: compact ? 16 : 18, fontWeight: 700, marginBottom: 14 }}>
        3. Quantidade
      </h2>

      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        {[5, 10, 20, 30].map((count) => {
          const isLocked = !isPro && count > 10;
          const isSelected = targetCount === count;

          return (
            <button
              key={count}
              onClick={() => {
                if (isLocked) {
                  onRequireUpgrade();
                } else {
                  onSetTargetCount(count);
                }
              }}
              style={{
                position: 'relative',
                padding: compact ? '11px 18px' : '12px 24px',
                background: isSelected ? 'var(--accent)' : 'var(--bg-raised)',
                border: isSelected ? 'none' : '1px solid var(--border)',
                borderRadius: 999,
                color: isSelected ? 'white' : 'var(--text-primary)',
                fontSize: compact ? 14 : 15,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                opacity: isLocked ? 0.6 : 1,
              }}
            >
              {count} itens
              {isLocked && (
                <div
                  style={{
                    position: 'absolute',
                    top: -8,
                    right: -6,
                    padding: '2px 6px',
                    background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 800,
                    color: '#000',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.12)',
                  }}
                >
                  Pro
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

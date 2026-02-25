
interface QuantityStepProps {
  isPro: boolean | null;
  targetCount: number;
  onSetTargetCount: (count: number) => void;
  onRequireUpgrade: () => void;
}

export function QuantityStep({
  isPro,
  targetCount,
  onSetTargetCount,
  onRequireUpgrade,
}: QuantityStepProps) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
        3. Quantidade
      </h2>

      <div style={{
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        {[5, 10, 20, 30].map(count => {
          const isLocked = !isPro && count > 10;
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
                padding: '12px 24px',
                background: targetCount === count
                  ? 'var(--accent)'
                  : 'var(--bg-raised)',
                border: targetCount === count
                  ? 'none'
                  : '1px solid var(--border)',
                borderRadius: 10,
                color: targetCount === count
                  ? 'white'
                  : 'var(--text-primary)',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                opacity: isLocked ? 0.6 : 1,
              }}
            >
              {count} itens
              {isLocked && (
                <div style={{
                  position: 'absolute',
                  top: -8,
                  right: -8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 6px',
                  background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
                  borderRadius: 20,
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#000',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}>
                  🔒
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

import type { Dificuldade } from '@/lib/types';

interface DifficultyOption {
  id: Dificuldade;
  label: string;
  description: string;
  color: string;
}

const DIFFICULTIES: DifficultyOption[] = [
  {
    id: 'facil',
    label: 'Facil',
    description: 'Nucleo conceitual basico.',
    color: '#22C55E',
  },
  {
    id: 'medio',
    label: 'Medio',
    description: 'Conceito + aplicacao pratica.',
    color: '#F59E0B',
  },
  {
    id: 'dificil',
    label: 'Dificil',
    description: 'Excecoes e requisitos cumulativos.',
    color: '#EF4444',
  },
  {
    id: 'muito_dificil',
    label: 'Muito dificil',
    description: 'Nuances sutis e distratores fortes.',
    color: '#9333EA',
  },
];

interface DifficultyStepProps {
  selectedDifficulty: Dificuldade | null;
  onSelectDifficulty: (d: Dificuldade) => void;
  compact?: boolean;
}

export function DifficultyStep({ selectedDifficulty, onSelectDifficulty, compact = false }: DifficultyStepProps) {
  return (
    <div style={{ marginBottom: compact ? 24 : 32 }}>
      <h2 style={{ fontSize: compact ? 16 : 18, fontWeight: 700, marginBottom: 14 }}>
        Dificuldade
      </h2>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: compact ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: compact ? 10 : 12,
        }}
      >
        {DIFFICULTIES.map((diff) => {
          const isSelected = selectedDifficulty === diff.id;

          return (
            <button
              key={diff.id}
              onClick={() => onSelectDifficulty(diff.id)}
              style={{
                padding: compact ? '14px 12px' : '16px 14px',
                background: isSelected ? `${diff.color}18` : 'var(--bg-raised, #0a0a0a)',
                border: isSelected ? `2px solid ${diff.color}` : '1px solid var(--border, rgba(255,255,255,0.08))',
                borderRadius: 12,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: diff.color,
                  marginBottom: 10,
                }}
              />
              <h3 style={{ fontSize: compact ? 13 : 14, fontWeight: 700, marginBottom: 4, color: '#f4f4f5' }}>
                {diff.label}
              </h3>
              <p style={{ fontSize: compact ? 10 : 11, color: 'var(--text-muted, #71717a)', lineHeight: 1.4 }}>
                {diff.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

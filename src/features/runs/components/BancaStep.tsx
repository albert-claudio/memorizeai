import type { Banca } from '@/lib/types';
import { Icons } from './Icons';

interface BancaOption {
  id: Banca;
  title: string;
  description: string;
  emoji: string;
}

const BANCAS: BancaOption[] = [
  {
    id: 'FCC',
    title: 'FCC',
    description: 'Literalidade, excecao, requisito fino.',
    emoji: '📋',
  },
  {
    id: 'FGV',
    title: 'FGV',
    description: 'Interpretacao, conflito aparente, consequencia pratica.',
    emoji: '🎯',
  },
  {
    id: 'CESPE',
    title: 'CESPE/CEBRASPE',
    description: 'Assertivas densas, palavra nuclear e alcance.',
    emoji: '⚖️',
  },
];

interface BancaStepProps {
  selectedBanca: Banca | null;
  onSelectBanca: (banca: Banca) => void;
  compact?: boolean;
}

export function BancaStep({ selectedBanca, onSelectBanca, compact = false }: BancaStepProps) {
  return (
    <>
      <style>{`
        .banca-grid {
          display: grid;
          grid-template-columns: ${compact ? 'repeat(3, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(180px, 1fr))'};
          gap: ${compact ? 10 : 12}px;
        }

        @media (max-width: 480px) {
          .banca-grid {
            grid-template-columns: 1fr !important;
            gap: 8px !important;
          }

          .banca-card {
            min-height: 80px !important;
            padding: 12px !important;
            display: flex !important;
            align-items: center !important;
            gap: 12px !important;
          }

          .banca-card .banca-emoji {
            margin-bottom: 0 !important;
          }
        }
      `}</style>

    <div style={{ marginBottom: compact ? 24 : 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Icons.BookOpen />
        <h2 style={{ fontSize: compact ? 16 : 18, fontWeight: 700 }}>
          Estilo de banca
        </h2>
      </div>

      <div className="banca-grid">
        {BANCAS.map((banca) => {
          const isSelected = selectedBanca === banca.id;

          return (
            <button
              key={banca.id}
              onClick={() => onSelectBanca(banca.id)}
              className="banca-card"
              style={{
                padding: compact ? 14 : 20,
                background: isSelected ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-raised, #0a0a0a)',
                border: isSelected ? '2px solid var(--accent, #6366F1)' : '1px solid var(--border, rgba(255,255,255,0.08))',
                borderRadius: 14,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
                minHeight: compact ? 128 : 156,
              }}
            >
              <div className="banca-emoji" style={{ fontSize: compact ? 22 : 28, marginBottom: 10 }}>{banca.emoji}</div>
              <div>
                <h3 style={{ fontSize: compact ? 13 : 16, fontWeight: 700, marginBottom: 6, color: '#f4f4f5' }}>
                  {banca.title}
                </h3>
                <p style={{ fontSize: compact ? 11 : 12, color: 'var(--text-muted, #71717a)', lineHeight: 1.45 }}>
                  {banca.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
    </>
  );
}

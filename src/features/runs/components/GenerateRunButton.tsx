import type { RunObjective, Source } from '@/lib/types';
import { Icons } from './Icons';

interface GenerateRunButtonProps {
  selectedSource: Source | null;
  selectedObjective: RunObjective | null;
  creating: boolean;
  targetCount: number;
  onCreateRun: () => void;
  bancaBlocking?: boolean;
  compact?: boolean;
}

export function GenerateRunButton({
  selectedSource,
  selectedObjective,
  creating,
  targetCount,
  onCreateRun,
  bancaBlocking = false,
  compact = false,
}: GenerateRunButtonProps) {
  const canGenerate = !!selectedSource && !!selectedObjective && !creating && !bancaBlocking;

  const statusMessage = (() => {
    if (!selectedSource || !selectedObjective) {
      return 'Selecione o objetivo, o material e o treino para liberar a geracao.';
    }

    if (bancaBlocking) {
      return 'Selecione a banca para gerar um simulado com cara de prova.';
    }

    if (selectedObjective === 'flashcards') {
      return 'Use os cards para revisar os pontos que vao cair no treino.';
    }

    return null;
  })();

  const actionLabel = selectedObjective === 'flashcards'
    ? 'flashcards de revisao'
    : selectedObjective === 'questoes_banca'
      ? 'questoes de simulado'
      : 'exercicios aplicados';

  return (
    <>
      <button
        onClick={onCreateRun}
        disabled={!canGenerate}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: compact ? '16px 22px' : '20px 32px',
          background: canGenerate ? 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)' : 'var(--bg-muted)',
          border: 'none',
          borderRadius: 16,
          color: selectedSource && selectedObjective ? 'white' : 'var(--text-muted)',
          fontSize: compact ? 16 : 18,
          fontWeight: 700,
          cursor: canGenerate ? 'pointer' : 'not-allowed',
          boxShadow: canGenerate ? '0 4px 20px rgba(99, 102, 241, 0.3)' : 'none',
          transition: 'all 0.2s ease',
        }}
      >
        {creating ? (
          <>
            <Icons.Loader />
            Iniciando...
          </>
        ) : (
          <>
            <Icons.Sparkles />
            {selectedObjective === 'questoes_banca' ? 'Gerar simulado' : 'Gerar'} {targetCount} {actionLabel}
          </>
        )}
      </button>

      {statusMessage && (
        <p
          style={{
            textAlign: compact ? 'left' : 'center',
            marginTop: 14,
            fontSize: compact ? 12 : 13,
            lineHeight: 1.45,
            color: 'var(--text-muted)',
          }}
        >
          {statusMessage}
        </p>
      )}
    </>
  );
}

import type { ReactNode } from 'react';
import { Icons } from './Icons';
import type { RunWithExtras } from '../hooks/useRunCreation';

interface ActiveRunProgressProps {
  activeRun: RunWithExtras;
  onRetry: () => void;
}

function getStatusTitle(activeRun: RunWithExtras): string {
  switch (activeRun.status) {
    case 'queued':
      return 'Na fila...';
    case 'retry_wait':
      return 'Aguardando nova tentativa...';
    case 'pendente':
      return 'Preparando...';
    case 'processando':
      return 'Gerando com IA...';
    case 'concluido':
      return 'Pronto!';
    case 'erro':
      return 'Erro';
    case 'base_insuficiente':
      return 'Base insuficiente';
    default:
      return 'Processando...';
  }
}

function getStatusMessage(activeRun: RunWithExtras, startedAtLabel: string | null): ReactNode {
  switch (activeRun.status) {
    case 'queued':
      return 'Sua geracao entrou na fila e sera processada assim que houver capacidade.';
    case 'retry_wait':
      return 'O provedor respondeu lento ou limitado. O sistema vai tentar novamente automaticamente.';
    case 'pendente':
      return 'Iniciando processamento...';
    case 'processando':
      return (
        <>
          Modelo: <strong>{activeRun.model_used || 'Selecionando...'}</strong>
          {startedAtLabel && <> - iniciado as {startedAtLabel}</>}
        </>
      );
    case 'concluido':
      return (
        <>
          <strong>{activeRun.items_generated}</strong> itens gerados. Redirecionando...
        </>
      );
    case 'erro':
      return activeRun.error_message || 'Falha na geracao';
    case 'base_insuficiente':
      return (
        <>
          O documento nao tem conteudo tecnico suficiente para gerar questoes de alta fidelidade.
          {activeRun.error_message && (
            <>
              <br />
              <em style={{ fontSize: 12, color: 'var(--text-muted)' }}>{activeRun.error_message}</em>
            </>
          )}
        </>
      );
    default:
      return 'Processando...';
  }
}

function getProgressWidth(activeRun: RunWithExtras): string {
  switch (activeRun.status) {
    case 'processando':
      return activeRun.model_used ? '70%' : '40%';
    case 'retry_wait':
      return '25%';
    case 'queued':
      return '20%';
    default:
      return '15%';
  }
}

export function ActiveRunProgress({ activeRun, onRetry }: ActiveRunProgressProps) {
  const startedAtLabel = activeRun.started_at
    ? new Date(activeRun.started_at).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const isTerminal =
    activeRun.status === 'concluido' ||
    activeRun.status === 'erro' ||
    activeRun.status === 'base_insuficiente';

  const showProgress =
    activeRun.status === 'queued' ||
    activeRun.status === 'retry_wait' ||
    activeRun.status === 'pendente' ||
    activeRun.status === 'processando';

  return (
    <div
      style={{
        background: 'var(--bg-raised)',
        border: '1px solid var(--border-accent)',
        borderRadius: 20,
        padding: 32,
        marginBottom: 32,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          background:
            activeRun.status === 'concluido'
              ? 'rgba(34, 197, 94, 0.1)'
              : activeRun.status === 'erro'
                ? 'rgba(239, 68, 68, 0.1)'
                : activeRun.status === 'base_insuficiente'
                  ? 'rgba(245, 158, 11, 0.1)'
                  : 'rgba(99, 102, 241, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px',
          color:
            activeRun.status === 'concluido'
              ? 'var(--success)'
              : activeRun.status === 'erro'
                ? 'var(--error)'
                : activeRun.status === 'base_insuficiente'
                  ? '#F59E0B'
                  : 'var(--accent)',
        }}
      >
        {activeRun.status === 'concluido' ? (
          <Icons.Check />
        ) : activeRun.status === 'erro' ? (
          <span style={{ fontSize: 32 }}>!</span>
        ) : activeRun.status === 'base_insuficiente' ? (
          <span style={{ fontSize: 32 }}>?</span>
        ) : (
          <Icons.Sparkles />
        )}
      </div>

      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        {getStatusTitle(activeRun)}
      </h2>

      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        {getStatusMessage(activeRun, startedAtLabel)}
      </p>

      {showProgress && (
        <div
          style={{
            width: '100%',
            height: 6,
            background: 'var(--bg-muted)',
            borderRadius: 3,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: getProgressWidth(activeRun),
              height: '100%',
              background: 'linear-gradient(90deg, var(--accent), #7C3AED)',
              borderRadius: 3,
              transition: 'width 0.8s ease',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
        </div>
      )}

      {isTerminal && activeRun.status !== 'concluido' && (
        <button
          onClick={onRetry}
          style={{
            marginTop: 16,
            padding: '12px 24px',
            background: 'var(--bg-muted)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            color: 'var(--text-primary)',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
}

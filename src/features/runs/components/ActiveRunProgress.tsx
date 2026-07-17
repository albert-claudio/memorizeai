import { useEffect, useState, type ReactNode } from 'react';
import { Icons } from './Icons';
import type { RunWithExtras } from '../hooks/useRunCreation';

interface ActiveRunProgressProps {
  activeRun: RunWithExtras;
  onRetry: () => void;
  onCancel?: () => void;
  canceling?: boolean;
}

const RETRY_OVERDUE_GRACE_MS = 20_000;

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) {
    return `${seconds}s`;
  }

  return `${minutes}min ${seconds.toString().padStart(2, '0')}s`;
}

function getRetryState(activeRun: RunWithExtras, now: number) {
  if (activeRun.status !== 'retry_wait' || typeof activeRun.next_attempt_at !== 'number') {
    return null;
  }

  const remainingMs = activeRun.next_attempt_at - now;
  const overdueMs = now - activeRun.next_attempt_at;

  return {
    remainingMs,
    overdueMs,
    isDue: remainingMs <= 0,
    isOverdue: overdueMs > RETRY_OVERDUE_GRACE_MS,
    nextAttemptLabel: new Date(activeRun.next_attempt_at).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
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

function getStatusMessage(activeRun: RunWithExtras, startedAtLabel: string | null, now: number): ReactNode {
  const retryState = getRetryState(activeRun, now);

  switch (activeRun.status) {
    case 'queued':
      return 'Sua geracao entrou na fila e sera processada assim que houver capacidade.';
    case 'retry_wait':
      if (!retryState) {
        return 'O provedor respondeu lento ou limitado. O sistema vai tentar novamente automaticamente.';
      }
      if (retryState.isOverdue) {
        return (
          <>
            A proxima tentativa ja deveria ter iniciado. A fila pode estar atrasada; voce pode aguardar ou cancelar e gerar novamente.
          </>
        );
      }
      if (retryState.isDue) {
        return 'A tentativa esta liberada e deve entrar na fila de processamento em instantes.';
      }
      return (
        <>
          O provedor respondeu lento ou limitado. Nova tentativa em{' '}
          <strong>{formatDuration(retryState.remainingMs)}</strong> ({retryState.nextAttemptLabel}).
        </>
      );
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

export function ActiveRunProgress({ activeRun, onRetry, onCancel, canceling = false }: ActiveRunProgressProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const startedAtLabel = activeRun.started_at
    ? new Date(activeRun.started_at).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;
  const retryState = getRetryState(activeRun, now);

  const isTerminal =
    activeRun.status === 'concluido' ||
    activeRun.status === 'erro' ||
    activeRun.status === 'base_insuficiente';

  const showProgress =
    activeRun.status === 'queued' ||
    activeRun.status === 'retry_wait' ||
    activeRun.status === 'pendente' ||
    activeRun.status === 'processando';
  const canCancel =
    activeRun.status === 'pendente' ||
    activeRun.status === 'queued' ||
    activeRun.status === 'retry_wait';
  const attemptLabel = Math.max(activeRun.attempt_count ?? 0, activeRun.status === 'retry_wait' ? 1 : 0);

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
        {getStatusMessage(activeRun, startedAtLabel, now)}
      </p>

      {!isTerminal && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 8,
            marginBottom: 16,
          }}
        >
          {attemptLabel > 0 && (
            <span
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--text-muted)',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              Tentativa {attemptLabel}
            </span>
          )}
          {activeRun.last_error_provider && (
            <span
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                background: 'rgba(99, 102, 241, 0.12)',
                color: '#c4b5fd',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              Provider: {activeRun.last_error_provider}
            </span>
          )}
          {retryState?.isOverdue && (
            <span
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                background: 'rgba(245, 158, 11, 0.12)',
                color: '#fbbf24',
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              Fila atrasada
            </span>
          )}
        </div>
      )}

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

      {canCancel && (
        <button
          onClick={onCancel}
          disabled={canceling || !onCancel}
          style={{
            marginTop: 16,
            padding: '12px 18px',
            background: retryState?.isOverdue ? 'rgba(245, 158, 11, 0.12)' : 'transparent',
            border: retryState?.isOverdue ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid var(--border)',
            borderRadius: 10,
            color: retryState?.isOverdue ? '#fbbf24' : 'var(--text-secondary)',
            fontSize: 14,
            fontWeight: 700,
            cursor: canceling ? 'not-allowed' : 'pointer',
            opacity: canceling ? 0.7 : 1,
          }}
        >
          {canceling ? 'Cancelando...' : 'Cancelar e configurar de novo'}
        </button>
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

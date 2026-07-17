'use client';

import { useState } from 'react';
import { Icons } from '@/features/deck/components/Icons';

type ReportReason =
  | 'gabarito_errado'
  | 'enunciado_confuso'
  | 'alternativa_problematica'
  | 'fora_da_fonte'
  | 'estilo_estranho'
  | 'outro';

type ReportContext = 'during_simulado' | 'result_review';

interface QuestionReportButtonProps {
  simuladoId: string;
  questaoId: string;
  selectedAnswer?: string | null;
  context: ReportContext;
  compact?: boolean;
}

const REASONS: Array<{ value: ReportReason; label: string }> = [
  { value: 'gabarito_errado', label: 'Gabarito errado' },
  { value: 'enunciado_confuso', label: 'Enunciado confuso' },
  { value: 'alternativa_problematica', label: 'Alternativa problematica' },
  { value: 'fora_da_fonte', label: 'Fora da fonte' },
  { value: 'estilo_estranho', label: 'Estilo estranho' },
  { value: 'outro', label: 'Outro' },
];

export function QuestionReportButton({
  simuladoId,
  questaoId,
  selectedAnswer,
  context,
  compact = false,
}: QuestionReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('estilo_estranho');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('Nao foi possivel enviar agora.');

  const submitReport = async () => {
    if (status === 'sending') return;
    setStatus('sending');
    setErrorMessage('Nao foi possivel enviar agora.');

    try {
      const response = await fetch('/api/simulado/question-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          simuladoId,
          questaoId,
          reason,
          note,
          selectedAnswer,
          context,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string; retryAfter?: number } | null;
        const retryText = payload?.retryAfter ? ` Tente novamente em ${payload.retryAfter}s.` : '';
        throw new Error(`${payload?.error || 'Nao foi possivel enviar agora.'}${retryText}`);
      }

      setStatus('sent');
      setOpen(false);
      setNote('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Nao foi possivel enviar agora.');
      setStatus('error');
    }
  };

  return (
    <div style={{ position: 'relative', marginTop: compact ? 0 : 14 }}>
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          if (status === 'error') setStatus('idle');
        }}
        disabled={status === 'sending'}
        aria-expanded={open}
        title="Reportar questao errada ou estranha"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: compact ? '8px 10px' : '9px 12px',
          borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.10)',
          background: status === 'sent' ? 'rgba(34,197,94,0.10)' : 'rgba(255,255,255,0.04)',
          color: status === 'sent' ? '#4ade80' : '#a1a1aa',
          fontSize: 12,
          fontWeight: 700,
          cursor: status === 'sending' ? 'wait' : 'pointer',
        }}
      >
        <Icons.Flag />
        {status === 'sent' ? 'Reportado' : status === 'sending' ? 'Enviando...' : 'Reportar questao'}
      </button>

      {open && (
        <div
          style={{
            marginTop: 10,
            padding: 14,
            borderRadius: 14,
            background: '#18181b',
            border: '1px solid rgba(255,255,255,0.10)',
            boxShadow: '0 18px 50px rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {REASONS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setReason(item.value)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 999,
                  border: reason === item.value ? '1px solid #818cf8' : '1px solid rgba(255,255,255,0.10)',
                  background: reason === item.value ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.03)',
                  color: reason === item.value ? '#c7d2fe' : '#d4d4d8',
                  fontSize: 12,
                  fontWeight: 650,
                  cursor: 'pointer',
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, 600))}
            placeholder="Observacao opcional"
            rows={3}
            maxLength={600}
            style={{
              width: '100%',
              marginTop: 12,
              padding: 12,
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.10)',
              background: '#0f0f10',
              color: '#f4f4f5',
              resize: 'vertical',
              fontSize: 13,
              lineHeight: 1.4,
              outline: 'none',
            }}
          />

          {status === 'error' && (
            <p role="alert" style={{ margin: '8px 0 0', color: '#f87171', fontSize: 12 }}>
              {errorMessage}
            </p>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                padding: '9px 12px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.10)',
                background: 'transparent',
                color: '#a1a1aa',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={submitReport}
              disabled={status === 'sending'}
              style={{
                padding: '9px 12px',
                borderRadius: 10,
                border: 'none',
                background: '#6366f1',
                color: '#fff',
                fontSize: 12,
                fontWeight: 800,
                cursor: status === 'sending' ? 'wait' : 'pointer',
              }}
            >
              Enviar reporte
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

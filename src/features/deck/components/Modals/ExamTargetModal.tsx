import { useEffect, useMemo, useState } from 'react';
import type { ExamTarget } from '@/lib/types';
import { Modal } from './Modal';
import { Icons } from '../Icons';

interface ExamTargetModalProps {
  isOpen: boolean;
  examTarget: ExamTarget | null;
  onClose: () => void;
  onSubmit: (payload: { title: string; target_date: number; target_retention: number }) => Promise<void>;
}

function toDateInputValue(timestamp: number | null): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfDayTimestamp(dateValue: string): number {
  const [year, month, day] = dateValue.split('-').map(Number);
  return new Date(year, month - 1, day, 9, 0, 0, 0).getTime();
}

function getTodayInputValue(): string {
  return toDateInputValue(Date.now());
}

export function ExamTargetModal({
  isOpen,
  examTarget,
  onClose,
  onSubmit,
}: ExamTargetModalProps) {
  const [title, setTitle] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [targetRetention, setTargetRetention] = useState('0.95');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    setTitle(examTarget?.title ?? '');
    setTargetDate(toDateInputValue(examTarget?.target_date ?? null));
    setTargetRetention((examTarget?.target_retention ?? 0.95).toFixed(2));
    setSaving(false);
    setError('');
  }, [examTarget, isOpen]);

  const minDate = useMemo(() => getTodayInputValue(), []);

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!title.trim()) {
      setError('Informe um título para identificar a prova.');
      return;
    }

    if (!targetDate) {
      setError('Escolha a data da prova.');
      return;
    }

    if (targetDate < minDate) {
      setError('A data da prova não pode ser anterior a hoje.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await onSubmit({
        title: title.trim(),
        target_date: startOfDayTimestamp(targetDate),
        target_retention: Number(targetRetention),
      });
      onClose();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Erro ao salvar meta de prova';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const fieldContainerStyle = { marginBottom: 18 };
  const labelStyle = { display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 };
  const inputStyle = {
    width: '100%',
    minHeight: 48,
    padding: '12px 14px',
    background: 'var(--bg-muted)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    color: 'var(--text-primary)',
    fontSize: 15,
    fontFamily: 'inherit',
  };

  return (
    <Modal title={examTarget ? 'Editar Meta de Prova' : 'Criar Meta de Prova'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <p style={{ margin: '0 0 18px', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
          Esta meta vale para o deck atual. Quando a preferência global de priorização por prova estiver ativada, a fila de revisão deste deck sobe cards mais frágeis conforme a data se aproxima.
        </p>

        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 12,
            padding: 12,
            color: '#fca5a5',
            fontSize: 14,
            lineHeight: 1.5,
            marginBottom: 18,
          }}>
            {error}
          </div>
        )}

        <div style={fieldContainerStyle}>
          <label htmlFor="exam-target-title" style={labelStyle}>
            Nome da prova
          </label>
          <input
            id="exam-target-title"
            type="text"
            placeholder="Ex: TRT Analista - Constitucional"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            style={inputStyle}
            maxLength={120}
            autoFocus
          />
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 14,
          marginBottom: 18,
        }}>
          <div>
            <label htmlFor="exam-target-date" style={labelStyle}>
              Data da prova
            </label>
            <input
              id="exam-target-date"
              type="date"
              value={targetDate}
              min={minDate}
              onChange={(event) => setTargetDate(event.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label htmlFor="exam-target-retention" style={labelStyle}>
              Retenção alvo
            </label>
            <select
              id="exam-target-retention"
              value={targetRetention}
              onChange={(event) => setTargetRetention(event.target.value)}
              style={inputStyle}
            >
              <option value="0.9">90%</option>
              <option value="0.93">93%</option>
              <option value="0.95">95%</option>
              <option value="0.97">97%</option>
              <option value="0.99">99%</option>
            </select>
          </div>
        </div>

        <div style={{
          borderRadius: 14,
          padding: '14px 14px 12px',
          marginBottom: 20,
          background: 'rgba(99, 102, 241, 0.08)',
          border: '1px solid rgba(99, 102, 241, 0.16)',
          color: 'var(--text-secondary)',
          fontSize: 13,
          lineHeight: 1.6,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, color: '#c7d2fe', fontWeight: 700 }}>
            <Icons.Flag />
            Como isso afeta a revisão
          </div>
          Quanto menor o prazo e maior a retenção alvo, maior a pressão do planner sobre cards atrasados, instáveis e com histórico de erro neste deck.
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              minHeight: 48,
              borderRadius: 12,
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            style={{
              minHeight: 48,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
              border: 'none',
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {saving ? <Icons.Loader /> : (examTarget ? 'Salvar meta' : 'Criar meta')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

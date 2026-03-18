
import { useState } from 'react';
import { Modal } from './Modal';
import { Icons } from '../Icons';

interface CreateCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (front: string, back: string) => Promise<unknown>;
  tierLimitReached: boolean;
  maxCards: number;
}

export function CreateCardModal({ isOpen, onClose, onSubmit, tierLimitReached, maxCards }: CreateCardModalProps) {
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!front.trim() || !back.trim()) return;

    if (tierLimitReached) {
      setError(`Limite de ${maxCards} cards por deck atingido. Faça upgrade para Pro para até 10.000 cards por deck.`);
      return;
    }

    setSaving(true);
    setError('');

    try {
      await onSubmit(front, back);
      setFront('');
      setBack('');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao criar card';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const textareaStyle = {
    width: '100%',
    padding: '12px 16px',
    background: 'var(--bg-muted)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    color: 'var(--text-primary)',
    fontSize: 15,
    fontFamily: 'inherit',
    minHeight: 100,
    resize: 'vertical' as const,
  };

  const primaryButtonStyle = {
    flex: 1,
    padding: '12px',
    background: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
    border: 'none',
    borderRadius: 12,
    color: 'white',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  };

  const secondaryButtonStyle = {
    flex: 1,
    padding: '12px',
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 12,
    color: 'var(--text-secondary)',
    fontSize: 15,
    fontWeight: 500,
    cursor: 'pointer',
  };

  return (
    <Modal title="Novo Card" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 10,
            padding: 12,
            color: '#F87171',
            fontSize: 14,
            marginBottom: 16,
          }}>
            {error}
          </div>
        )}
        
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
            Frente (Pergunta) *
          </label>
          <textarea
            placeholder="Ex: O que é a Constituição Federal?"
            value={front}
            onChange={(e) => setFront(e.target.value)}
            style={textareaStyle}
            required
            autoFocus
          />
        </div>
        
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
            Verso (Resposta) *
          </label>
          <textarea
            placeholder="Ex: É a lei fundamental e suprema do Brasil..."
            value={back}
            onChange={(e) => setBack(e.target.value)}
            style={textareaStyle}
            required
          />
        </div>
        
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={onClose}
            style={secondaryButtonStyle}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !front.trim() || !back.trim()}
            style={{
              ...primaryButtonStyle,
              opacity: saving || !front.trim() || !back.trim() ? 0.6 : 1,
            }}
          >
            {saving ? <Icons.Loader /> : 'Criar Card'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

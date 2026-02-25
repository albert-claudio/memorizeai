
import { useState } from 'react';
import { Modal } from './Modal';
import { Icons } from '../Icons';
import type { Card } from '@/lib/types';

interface DeleteCardModalProps {
  card: Card | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (cardId: string) => Promise<void>;
}

export function DeleteCardModal({ card, isOpen, onClose, onConfirm }: DeleteCardModalProps) {
  const [saving, setSaving] = useState(false);

  if (!isOpen || !card) return null;

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await onConfirm(card.id);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const primaryButtonStyle = {
    flex: 1,
    padding: '12px',
    background: '#EF4444',
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
    boxShadow: '0 4px 20px rgba(239, 68, 68, 0.3)',
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
    <Modal title="Excluir Card" onClose={onClose}>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        Tem certeza que deseja excluir este card? Esta ação não pode ser desfeita.
      </p>
      
      <div style={{
        background: 'var(--bg-muted)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 24,
      }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>Frente:</p>
        <p style={{ fontSize: 14 }}>{card.front}</p>
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
          onClick={handleConfirm}
          disabled={saving}
          style={{
            ...primaryButtonStyle,
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? <Icons.Loader /> : 'Excluir'}
        </button>
      </div>
    </Modal>
  );
}

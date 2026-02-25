
import { Icons } from '@/features/deck/components/Icons';
import { Modal } from '@/features/deck/components/Modals/Modal';
import type { Card } from '@/lib/types';

interface AtomicCard {
  front: string;
  back: string;
}

interface LeechModalProps {
  card: Card | null;
  loading: boolean;
  suggestion: string;
  atomicCards: AtomicCard[];
  applying: boolean;
  onClose: () => void;
  onApply: () => void;
}

export function LeechModal({ 
  card, 
  loading, 
  suggestion, 
  atomicCards, 
  applying, 
  onClose, 
  onApply 
}: LeechModalProps) {
  if (!card) return null;

  return (
    <Modal title="Detectamos um Card Difícil (Leech) 🦠" onClose={onClose}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
          Você errou este card 8 vezes. O algoritmo sugere quebrá-lo em partes menores para facilitar a memorização.
        </p>
        
        {loading ? (
          <div style={{ padding: 40 }}>
            <Icons.Loader />
            <p style={{ marginTop: 16, fontSize: 14, color: 'var(--text-muted)' }}>
              A IA está analisando seu card...
            </p>
          </div>
        ) : (
          <div style={{ textAlign: 'left' }}>
            <div style={{ 
              background: 'rgba(99, 102, 241, 0.1)', 
              borderRadius: 12, 
              padding: 16,
              marginBottom: 16 
            }}>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>
                SUGESTÃO DA IA
              </h4>
              <p style={{ fontSize: 14, lineHeight: 1.6 }}>{suggestion}</p>
            </div>

            <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Novos Cards Propostos:</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
              {atomicCards.map((ac, i) => (
                <div key={i} style={{ 
                  background: 'var(--bg-muted)', 
                  border: '1px solid var(--border)', 
                  borderRadius: 12, 
                  padding: 12 
                }}>
                  <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Q: {ac.front}</p>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>A: {ac.back}</p>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  color: 'var(--text-secondary)',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Manter Original
              </button>
              <button
                onClick={onApply}
                disabled={applying}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
                  border: 'none',
                  borderRadius: 12,
                  color: 'white',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {applying ? <Icons.Loader /> : 'Aplicar Mudanças'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

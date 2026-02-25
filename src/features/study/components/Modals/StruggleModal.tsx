
import { Icons } from '@/features/deck/components/Icons';
import { Modal } from '@/features/deck/components/Modals/Modal';
import type { Card } from '@/lib/types';

interface SimplifiedCard {
  front: string;
  back: string;
  type: 'simplified' | 'example' | 'context';
}

interface StruggleModalProps {
  card: Card | null;
  loading: boolean;
  analysis: string;
  memoryTip: string;
  simplifiedCards: SimplifiedCard[];
  applying: boolean;
  onClose: () => void;
  onApply: () => void;
}

export function StruggleModal({ 
  card, 
  loading, 
  analysis, 
  memoryTip, 
  simplifiedCards, 
  applying, 
  onClose, 
  onApply 
}: StruggleModalProps) {
  if (!card) return null;

  return (
    <Modal title="Você parece estar com dificuldades 🤔" onClose={onClose}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
          Errou 3 vezes seguidas. A IA analisou o card e tem sugestões para ajudar.
        </p>
        
        {loading ? (
          <div style={{ padding: 40 }}>
            <Icons.Loader />
            <p style={{ marginTop: 16, fontSize: 14, color: 'var(--text-muted)' }}>
              Gerando dicas de memorização...
            </p>
          </div>
        ) : (
          <div style={{ textAlign: 'left' }}>
            <div style={{ 
              background: 'rgba(245, 158, 11, 0.1)', 
              borderRadius: 12, 
              padding: 16,
              marginBottom: 16 
            }}>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: '#F59E0B', marginBottom: 8 }}>
                ANÁLISE
              </h4>
              <p style={{ fontSize: 14, lineHeight: 1.6 }}>{analysis}</p>
            </div>

            {memoryTip && (
              <div style={{ 
                background: 'rgba(34, 197, 94, 0.1)', 
                borderRadius: 12, 
                padding: 16,
                marginBottom: 20 
              }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: '#22C55E', marginBottom: 8 }}>
                  DICA DE MEMÓRIA 💡
                </h4>
                <p style={{ fontSize: 14, lineHeight: 1.6 }}>{memoryTip}</p>
              </div>
            )}

            {simplifiedCards.length > 0 && (
              <>
                 <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Sugestão de Simplificação:</h4>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                  {simplifiedCards.map((sc, i) => (
                    <div key={i} style={{ 
                      background: 'var(--bg-muted)', 
                      border: '1px solid var(--border)', 
                      borderRadius: 12, 
                      padding: 12 
                    }}>
                      <div style={{ 
                        fontSize: 10, 
                        fontWeight: 700, 
                        textTransform: 'uppercase', 
                        color: 'var(--text-muted)',
                        marginBottom: 4 
                      }}>
                        {sc.type === 'simplified' ? 'Versão Simplificada' : sc.type === 'example' ? 'Exemplo Prático' : 'Contexto'}
                      </div>
                      <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Q: {sc.front}</p>
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>A: {sc.back}</p>
                    </div>
                  ))}
                </div>
              </>
            )}

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
                Tentar Assim Mesmo
              </button>
              {simplifiedCards.length > 0 && (
                <button
                  onClick={onApply}
                  disabled={applying}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
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
                  {applying ? <Icons.Loader /> : 'Usar Simplificação'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

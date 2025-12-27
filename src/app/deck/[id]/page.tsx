'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { Deck, Card } from '@/lib/types';

// Generate unique ID
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// ICONS
// ============================================================================
const Icons = {
  Brain: () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.54"/>
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.54"/>
    </svg>
  ),
  ArrowLeft: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12,19 5,12 12,5"/>
    </svg>
  ),
  Plus: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  ),
  Edit: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
  Trash: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3,6 5,6 21,6"/>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </svg>
  ),
  X: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  Loader: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  ),
  Play: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21"/>
    </svg>
  ),
  Rotate: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2v6h-6"/>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
      <path d="M3 22v-6h6"/>
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
    </svg>
  ),
};

export default function DeckDetailPage() {
  const router = useRouter();
  const params = useParams();
  const deckId = params.id as string;
  
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [loadingCards, setLoadingCards] = useState(true);
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  
  // Form states
  const [cardFront, setCardFront] = useState('');
  const [cardBack, setCardBack] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  // Preview state
  const [flippedCards, setFlippedCards] = useState<Set<string>>(new Set());

  useEffect(() => {
    const checkUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/login');
        return;
      }
      
      setUser(user);
      setLoading(false);
      fetchDeck();
      fetchCards();
    };

    checkUser();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, deckId]);

  const fetchDeck = async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('decks')
      .select('*')
      .eq('id', deckId)
      .is('deleted_at', null)
      .single();
    
    if (!error && data) {
      setDeck(data);
    } else {
      router.push('/dashboard');
    }
  };

  const fetchCards = async () => {
    setLoadingCards(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('cards')
      .select('*')
      .eq('deck_id', deckId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setCards(data);
    }
    setLoadingCards(false);
  };

  const handleCreateCard = async () => {
    if (!cardFront.trim() || !cardBack.trim()) return;
    setSaving(true);
    setError('');

    const supabase = createClient();
    const now = Date.now();
    
    const { data, error: insertError } = await supabase
      .from('cards')
      .insert({
        id: generateId(),
        deck_id: deckId,
        front: cardFront.trim(),
        back: cardBack.trim(),
        step: 0,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
    } else if (data) {
      setCards([data, ...cards]);
      setShowCreateModal(false);
      resetForm();
    }
    setSaving(false);
  };

  const handleEditCard = async () => {
    if (!cardFront.trim() || !cardBack.trim() || !selectedCard) return;
    setSaving(true);
    setError('');

    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from('cards')
      .update({
        front: cardFront.trim(),
        back: cardBack.trim(),
        updated_at: Date.now(),
      })
      .eq('id', selectedCard.id)
      .select()
      .single();

    if (updateError) {
      setError(updateError.message);
    } else if (data) {
      setCards(cards.map(c => c.id === data.id ? data : c));
      setShowEditModal(false);
      resetForm();
    }
    setSaving(false);
  };

  const handleDeleteCard = async () => {
    if (!selectedCard) return;
    setSaving(true);

    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from('cards')
      .update({
        deleted_at: Date.now(),
        updated_at: Date.now(),
      })
      .eq('id', selectedCard.id);

    if (!deleteError) {
      setCards(cards.filter(c => c.id !== selectedCard.id));
      setShowDeleteModal(false);
      setSelectedCard(null);
    }
    setSaving(false);
  };

  const openEditModal = (card: Card) => {
    setSelectedCard(card);
    setCardFront(card.front);
    setCardBack(card.back);
    setShowEditModal(true);
  };

  const openDeleteModal = (card: Card) => {
    setSelectedCard(card);
    setShowDeleteModal(true);
  };

  const resetForm = () => {
    setCardFront('');
    setCardBack('');
    setSelectedCard(null);
    setError('');
  };

  const toggleFlip = (cardId: string) => {
    setFlippedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(cardId)) {
        newSet.delete(cardId);
      } else {
        newSet.add(cardId);
      }
      return newSet;
    });
  };

  if (loading || !deck) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-base)',
      }}>
        <div style={{
          width: 48,
          height: 48,
          border: '3px solid var(--border)',
          borderTopColor: 'var(--accent)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
        <style jsx global>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Header */}
      <header style={{
        padding: '16px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-raised)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link
            href="/dashboard"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 40,
              height: 40,
              borderRadius: 10,
              background: 'var(--bg-muted)',
              color: 'var(--text-secondary)',
              textDecoration: 'none',
            }}
          >
            <Icons.ArrowLeft />
          </Link>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>{deck.title}</h1>
            {deck.description && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                {deck.description}
              </p>
            )}
          </div>
        </div>
        
        {cards.length > 0 && (
          <button
            onClick={() => router.push(`/estudar/${deckId}`)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 20px',
              background: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
              border: 'none',
              borderRadius: 10,
              color: 'white',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(99, 102, 241, 0.3)',
            }}
          >
            <Icons.Play />
            Estudar
          </button>
        )}
      </header>

      {/* Main Content */}
      <main style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
        {/* Stats Bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 16,
        }}>
          <p style={{ color: 'var(--text-secondary)' }}>
            {cards.length === 0 ? 'Nenhum card ainda' : `${cards.length} card${cards.length !== 1 ? 's' : ''}`}
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 20px',
              background: 'var(--bg-muted)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              color: 'var(--text-primary)',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Icons.Plus />
            Adicionar Card
          </button>
        </div>

        {/* Loading State */}
        {loadingCards ? (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <Icons.Loader />
          </div>
        ) : cards.length === 0 ? (
          /* Empty State */
          <div style={{
            background: 'var(--bg-raised)',
            border: '1px solid var(--border)',
            borderRadius: 20,
            padding: 64,
            textAlign: 'center',
          }}>
            <div style={{
              width: 80,
              height: 80,
              borderRadius: 20,
              background: 'rgba(99, 102, 241, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              color: 'var(--accent)',
            }}>
              <Icons.Brain />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
              Nenhum card ainda
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 24, maxWidth: 400, margin: '0 auto 24px' }}>
              Adicione seu primeiro flashcard para começar a estudar.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '16px 32px',
                background: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
                border: 'none',
                borderRadius: 12,
                color: 'white',
                fontSize: 16,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 20px rgba(99, 102, 241, 0.3)',
              }}
            >
              <Icons.Plus />
              Criar Primeiro Card
            </button>
          </div>
        ) : (
          /* Card List */
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 16,
          }}>
            {cards.map(card => {
              const isFlipped = flippedCards.has(card.id);
              
              return (
                <div
                  key={card.id}
                  style={{
                    perspective: '1000px',
                    height: 200,
                  }}
                >
                  <div
                    onClick={() => toggleFlip(card.id)}
                    style={{
                      position: 'relative',
                      width: '100%',
                      height: '100%',
                      cursor: 'pointer',
                      transformStyle: 'preserve-3d',
                      transition: 'transform 0.5s ease',
                      transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                    }}
                  >
                    {/* Front */}
                    <div style={{
                      position: 'absolute',
                      width: '100%',
                      height: '100%',
                      backfaceVisibility: 'hidden',
                      background: 'var(--bg-raised)',
                      border: '1px solid var(--border)',
                      borderRadius: 16,
                      padding: 20,
                      display: 'flex',
                      flexDirection: 'column',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', letterSpacing: '0.05em' }}>FRENTE</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditModal(card); }}
                            style={{ padding: 6, background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', borderRadius: 6 }}
                          >
                            <Icons.Edit />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); openDeleteModal(card); }}
                            style={{ padding: 6, background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', borderRadius: 6 }}
                          >
                            <Icons.Trash />
                          </button>
                        </div>
                      </div>
                      <p style={{ flex: 1, fontSize: 15, lineHeight: 1.5, overflow: 'hidden' }}>{card.front}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>
                        <Icons.Rotate />
                        <span>Toque para virar</span>
                      </div>
                    </div>
                    
                    {/* Back */}
                    <div style={{
                      position: 'absolute',
                      width: '100%',
                      height: '100%',
                      backfaceVisibility: 'hidden',
                      background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(124, 58, 237, 0.1) 100%)',
                      border: '1px solid var(--accent)',
                      borderRadius: 16,
                      padding: 20,
                      display: 'flex',
                      flexDirection: 'column',
                      transform: 'rotateY(180deg)',
                    }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', letterSpacing: '0.05em', marginBottom: 12 }}>VERSO</span>
                      <p style={{ flex: 1, fontSize: 15, lineHeight: 1.5, overflow: 'hidden' }}>{card.back}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>
                        <Icons.Rotate />
                        <span>Toque para virar</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Create Modal */}
      {showCreateModal && (
        <Modal
          title="Novo Card"
          onClose={() => { setShowCreateModal(false); resetForm(); }}
        >
          <form onSubmit={(e) => { e.preventDefault(); handleCreateCard(); }}>
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
                value={cardFront}
                onChange={(e) => setCardFront(e.target.value)}
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
                value={cardBack}
                onChange={(e) => setCardBack(e.target.value)}
                style={textareaStyle}
                required
              />
            </div>
            
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                onClick={() => { setShowCreateModal(false); resetForm(); }}
                style={secondaryButtonStyle}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || !cardFront.trim() || !cardBack.trim()}
                style={{
                  ...primaryButtonStyle,
                  opacity: saving || !cardFront.trim() || !cardBack.trim() ? 0.6 : 1,
                }}
              >
                {saving ? <Icons.Loader /> : 'Criar Card'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedCard && (
        <Modal
          title="Editar Card"
          onClose={() => { setShowEditModal(false); resetForm(); }}
        >
          <form onSubmit={(e) => { e.preventDefault(); handleEditCard(); }}>
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
                value={cardFront}
                onChange={(e) => setCardFront(e.target.value)}
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
                value={cardBack}
                onChange={(e) => setCardBack(e.target.value)}
                style={textareaStyle}
                required
              />
            </div>
            
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                onClick={() => { setShowEditModal(false); resetForm(); }}
                style={secondaryButtonStyle}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || !cardFront.trim() || !cardBack.trim()}
                style={{
                  ...primaryButtonStyle,
                  opacity: saving || !cardFront.trim() || !cardBack.trim() ? 0.6 : 1,
                }}
              >
                {saving ? <Icons.Loader /> : 'Salvar'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Modal */}
      {showDeleteModal && selectedCard && (
        <Modal
          title="Excluir Card"
          onClose={() => { setShowDeleteModal(false); setSelectedCard(null); }}
        >
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
            <p style={{ fontSize: 14 }}>{selectedCard.front}</p>
          </div>
          
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type="button"
              onClick={() => { setShowDeleteModal(false); setSelectedCard(null); }}
              style={secondaryButtonStyle}
            >
              Cancelar
            </button>
            <button
              onClick={handleDeleteCard}
              disabled={saving}
              style={{
                ...primaryButtonStyle,
                background: '#EF4444',
                boxShadow: '0 4px 20px rgba(239, 68, 68, 0.3)',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? <Icons.Loader /> : 'Excluir'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============================================================================
// MODAL COMPONENT
// ============================================================================
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      zIndex: 100,
    }}>
      <div style={{
        background: 'var(--bg-raised)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        width: '100%',
        maxWidth: 480,
        maxHeight: '90vh',
        overflow: 'auto',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderBottom: '1px solid var(--border)',
          position: 'sticky',
          top: 0,
          background: 'var(--bg-raised)',
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              padding: 8,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              borderRadius: 8,
            }}
          >
            <Icons.X />
          </button>
        </div>
        <div style={{ padding: 24 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// STYLES
// ============================================================================
const textareaStyle: React.CSSProperties = {
  width: '100%',
  height: 100,
  padding: 16,
  fontSize: 15,
  background: 'var(--bg-muted)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  color: 'var(--text-primary)',
  outline: 'none',
  resize: 'none',
  lineHeight: 1.5,
};

const primaryButtonStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '14px 24px',
  background: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
  border: 'none',
  borderRadius: 10,
  color: 'white',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: '0 4px 20px rgba(99, 102, 241, 0.3)',
};

const secondaryButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '14px 24px',
  background: 'var(--bg-muted)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  color: 'var(--text-secondary)',
  fontSize: 15,
  fontWeight: 500,
  cursor: 'pointer',
};

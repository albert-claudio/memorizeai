
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { Deck } from '@/lib/types';
import { useDecks } from '@/features/dashboard/hooks/useDecks';
import { useSimulados } from '@/features/dashboard/hooks/useSimulados';
import { useTierLimits } from '@/features/dashboard/hooks/useTierLimits';
import {
  Icons,
  Modal,
  DeckCard,
  SimuladoCard,
  DashboardHeader,
  EmptyState,
  inputStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  globalStyles,
} from './components';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // Custom Hooks
  const { 
    decks, 
    cardCounts, 
    loading: loadingDecks, 
    addDeck, 
    updateDeck, 
    removeDeck 
  } = useDecks(user?.id);
  
  const { 
    simulados, 
    loading: loadingSimulados 
  } = useSimulados(user?.id);
  
  const { 
    tierLimits, 
    incrementDeckCount 
  } = useTierLimits();
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedDeck, setSelectedDeck] = useState<Deck | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  
  // Form states
  const [deckTitle, setDeckTitle] = useState('');
  const [deckDescription, setDeckDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const checkUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        window.location.href = '/login';
        return;
      }
      
      setUser(user);
      setLoadingUser(false);
    };

    checkUser();
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  };

  const handleCreateDeck = async () => {
    if (!deckTitle.trim() || !user) return;
    
    // Check tier limits for free users
    if (tierLimits && !tierLimits.isPro && decks.length >= tierLimits.maxDecks) {
      setError(`Limite de ${tierLimits.maxDecks} decks atingido. Faça upgrade para Pro para decks ilimitados.`);
      return;
    }
    
    setSaving(true);
    setError('');

    try {
      await addDeck(deckTitle, deckDescription);
      setShowCreateModal(false);
      resetForm();
      incrementDeckCount();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar deck');
    } finally {
      setSaving(false);
    }
  };

  const handleEditDeck = async () => {
    if (!deckTitle.trim() || !selectedDeck) return;
    setSaving(true);
    setError('');

    try {
      await updateDeck(selectedDeck.id, deckTitle, deckDescription);
      setShowEditModal(false);
      resetForm();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar deck');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDeck = async () => {
    if (!selectedDeck || !user) return;
    setSaving(true);

    try {
      await removeDeck(selectedDeck.id);
      setShowDeleteModal(false);
      setSelectedDeck(null);
    } catch (err: unknown) {
      console.error(err);
      // Optional: set error state if needed
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (deck: Deck) => {
    setSelectedDeck(deck);
    setDeckTitle(deck.title);
    setDeckDescription(deck.description || '');
    setShowEditModal(true);
    setActiveMenu(null);
  };

  const openDeleteModal = (deck: Deck) => {
    setSelectedDeck(deck);
    setShowDeleteModal(true);
    setActiveMenu(null);
  };

  const resetForm = () => {
    setDeckTitle('');
    setDeckDescription('');
    setSelectedDeck(null);
    setError('');
  };

  // Loading state
  if (loadingUser) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
      }}>
        <div style={{
          width: 48,
          height: 48,
          border: '3px solid rgba(255,255,255,0.1)',
          borderTopColor: '#6366F1',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
        <style jsx global>{globalStyles}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a' }}>
      <style jsx global>{globalStyles}</style>

      {/* Header */}
      <DashboardHeader user={user} onLogout={handleLogout} />
      {/* Responsive CSS for main content */}
      <style jsx global>{`
        .dashboard-main {
          padding: 32px 24px;
        }
        .dashboard-page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 40px;
          flex-wrap: wrap;
          gap: 20px;
        }
        .dashboard-page-title {
          font-size: 32px;
        }
        .dashboard-page-subtitle {
          font-size: 15px;
        }
        .dashboard-actions {
          display: flex;
          flex-direction: row;
          gap: 12px;
        }
        .dashboard-grid {
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 20px;
        }
        
        @media (max-width: 640px) {
          .dashboard-main {
            padding: 24px 16px;
          }
          .dashboard-page-header {
            flex-direction: column;
            align-items: stretch;
            margin-bottom: 24px;
            gap: 16px;
          }
          .dashboard-page-title {
            font-size: 26px;
          }
          .dashboard-page-subtitle {
            font-size: 14px;
          }
          .dashboard-actions {
            flex-direction: column;
            gap: 10px;
          }
          .dashboard-actions button {
            width: 100%;
            justify-content: center;
          }
          .dashboard-grid {
            grid-template-columns: 1fr;
            gap: 14px;
          }
        }
      `}</style>

      {/* Main Content */}
      <main className="dashboard-main" style={{ 
        maxWidth: 1200, 
        margin: '0 auto',
      }}>
        {/* Page Header */}
        <div className="dashboard-page-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <h1 className="dashboard-page-title" style={{ 
                fontWeight: 700, 
                letterSpacing: '-0.03em',
                color: '#f4f4f5',
              }}>
                Seus Decks
              </h1>
              {tierLimits && (
                <span style={{
                  padding: '4px 10px',
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 600,
                  background: tierLimits.isPro 
                    ? 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)' 
                    : 'rgba(255,255,255,0.08)',
                  color: tierLimits.isPro ? '#000' : '#a1a1aa',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  {tierLimits.isPro ? '👑 Pro' : 'Free'}
                </span>
              )}
            </div>
            <p className="dashboard-page-subtitle" style={{ 
              color: '#71717a',
              fontWeight: 500, 
            }}>
              {decks.length === 0 
                ? 'Crie seu primeiro deck para começar' 
                : tierLimits && !tierLimits.isPro 
                  ? `${decks.length}/${tierLimits.maxDecks} decks de flashcards`
                  : `${decks.length} deck${decks.length !== 1 ? 's' : ''} de flashcards`}
            </p>
          </div>
          <div className="dashboard-actions">
              <button
                onClick={() => router.push('/dashboard/runs')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '14px 22px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 12,
                  color: '#e4e4e7',
                  fontSize: 15,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <Icons.Sparkles />
                Gerar com IA
              </button>
            <button
              onClick={() => {
                if (tierLimits && !tierLimits.isPro && decks.length >= tierLimits.maxDecks) {
                  alert(`Limite de ${tierLimits.maxDecks} decks atingido. Faça upgrade para Pro.`);
                  router.push('/upgrade');
                } else {
                  setShowCreateModal(true);
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '14px 28px',
                background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #EC4899 100%)',
                border: 'none',
                borderRadius: 12,
                color: 'white',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 0 32px rgba(139, 92, 246, 0.4), 0 4px 16px rgba(99, 102, 241, 0.3)',
                transition: 'all 0.2s ease',
                letterSpacing: '-0.01em',
              }}
            >
              <Icons.Plus />
              Novo Deck
            </button>
          </div>
        </div>

        {/* Decks Section */}
        {loadingDecks ? (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <Icons.Loader />
          </div>
        ) : decks.length === 0 ? (
          <EmptyState onCreateDeck={() => setShowCreateModal(true)} />
        ) : (
          <div className="dashboard-grid" style={{
            display: 'grid',
          }}>
            {decks.map(deck => (
              <DeckCard
                key={deck.id}
                deck={deck}
                cardCount={cardCounts[deck.id] || 0}
                isMenuOpen={activeMenu === deck.id}
                onMenuToggle={() => setActiveMenu(activeMenu === deck.id ? null : deck.id)}
                onEdit={() => openEditModal(deck)}
                onDelete={() => openDeleteModal(deck)}
              />
            ))}
          </div>
        )}

        {/* Simulados Section */}
        {simulados.length > 0 && (
          <div style={{ marginTop: 56 }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: 28 
            }}>
              <div>
                <h2 style={{ 
                  fontSize: 26, 
                  fontWeight: 700, 
                  marginBottom: 6,
                  letterSpacing: '-0.03em',
                  color: '#f4f4f5',
                }}>
                  Simulados
                </h2>
                <p style={{ 
                  fontSize: 14, 
                  color: '#71717a',
                  fontWeight: 500,
                }}>
                  {simulados.length} simulado{simulados.length !== 1 ? 's' : ''} gerado{simulados.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {loadingSimulados ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Icons.Loader />
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: 20,
              }}>
                {simulados.map(simulado => (
                  <SimuladoCard key={simulado.id} simulado={simulado} />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Create Modal */}
      {showCreateModal && (
        <Modal
          title="Criar Novo Deck"
          onClose={() => { setShowCreateModal(false); resetForm(); }}
        >
          <form onSubmit={(e) => { e.preventDefault(); handleCreateDeck(); }}>
            {error && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: 12,
                padding: 14,
                color: '#f87171',
                fontSize: 14,
                marginBottom: 20,
              }}>
                {error}
              </div>
            )}
            
            <div style={{ marginBottom: 20 }}>
              <label style={{ 
                display: 'block', 
                fontSize: 14, 
                fontWeight: 600, 
                marginBottom: 10,
                color: '#e4e4e7',
              }}>
                Título do Deck *
              </label>
              <input
                type="text"
                placeholder="Ex: Direito Civil - OAB"
                value={deckTitle}
                onChange={(e) => setDeckTitle(e.target.value)}
                style={inputStyle}
                required
                autoFocus
              />
            </div>
            
            <div style={{ marginBottom: 28 }}>
              <label style={{ 
                display: 'block', 
                fontSize: 14, 
                fontWeight: 600, 
                marginBottom: 10,
                color: '#e4e4e7',
              }}>
                Descrição (opcional)
              </label>
              <textarea
                placeholder="Uma breve descrição do conteúdo..."
                value={deckDescription}
                onChange={(e) => setDeckDescription(e.target.value)}
                style={{ ...inputStyle, height: 88, resize: 'none', paddingTop: 14 } as React.CSSProperties}
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
                disabled={saving || !deckTitle.trim()}
                style={{
                  ...primaryButtonStyle,
                  opacity: saving || !deckTitle.trim() ? 0.6 : 1,
                }}
              >
                {saving ? <Icons.Loader /> : 'Criar Deck'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedDeck && (
        <Modal
          title="Editar Deck"
          onClose={() => { setShowEditModal(false); resetForm(); }}
        >
          <form onSubmit={(e) => { e.preventDefault(); handleEditDeck(); }}>
            {error && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: 12,
                padding: 14,
                color: '#f87171',
                fontSize: 14,
                marginBottom: 20,
              }}>
                {error}
              </div>
            )}
            
            <div style={{ marginBottom: 20 }}>
              <label style={{ 
                display: 'block', 
                fontSize: 14, 
                fontWeight: 600, 
                marginBottom: 10,
                color: '#e4e4e7',
              }}>
                Título do Deck *
              </label>
              <input
                type="text"
                value={deckTitle}
                onChange={(e) => setDeckTitle(e.target.value)}
                style={inputStyle}
                required
                autoFocus
              />
            </div>
            
            <div style={{ marginBottom: 28 }}>
              <label style={{ 
                display: 'block', 
                fontSize: 14, 
                fontWeight: 600, 
                marginBottom: 10,
                color: '#e4e4e7',
              }}>
                Descrição (opcional)
              </label>
              <textarea
                value={deckDescription}
                onChange={(e) => setDeckDescription(e.target.value)}
                style={{ ...inputStyle, height: 88, resize: 'none', paddingTop: 14 } as React.CSSProperties}
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
                disabled={saving || !deckTitle.trim()}
                style={{
                  ...primaryButtonStyle,
                  opacity: saving || !deckTitle.trim() ? 0.6 : 1,
                }}
              >
                {saving ? <Icons.Loader /> : 'Salvar'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Modal */}
      {showDeleteModal && selectedDeck && (
        <Modal
          title="Excluir Deck"
          onClose={() => { setShowDeleteModal(false); setSelectedDeck(null); }}
        >
          <p style={{ color: '#a1a1aa', marginBottom: 28, lineHeight: 1.7, fontSize: 15 }}>
            Tem certeza que deseja excluir o deck <strong style={{ color: '#f4f4f5' }}>&ldquo;{selectedDeck.title}&rdquo;</strong>? 
            Esta ação não pode ser desfeita e todos os cards serão perdidos.
          </p>
          
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type="button"
              onClick={() => { setShowDeleteModal(false); setSelectedDeck(null); }}
              style={secondaryButtonStyle}
            >
              Cancelar
            </button>
            <button
              onClick={handleDeleteDeck}
              disabled={saving}
              style={{
                ...primaryButtonStyle,
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                boxShadow: '0 0 24px rgba(239, 68, 68, 0.3)',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? <Icons.Loader /> : 'Excluir'}
            </button>
          </div>
        </Modal>
      )}

      {/* Close menus on outside click */}
      {activeMenu && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 5 }}
          onClick={() => setActiveMenu(null)}
        />
      )}
    </div>
  );
}

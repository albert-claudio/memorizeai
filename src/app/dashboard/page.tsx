'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { Deck } from '@/lib/types';

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
  Logout: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16,17 21,12 16,7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
  Plus: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  ),
  MoreVertical: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="1"/>
      <circle cx="12" cy="12" r="1"/>
      <circle cx="12" cy="19" r="1"/>
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
  Cards: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <path d="M12 8v8"/>
      <path d="M8 12h8"/>
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
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21"/>
    </svg>
  ),
  Sparkles: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    </svg>
  ),
};

// Color options for deck display (not stored in DB)
const DECK_COLORS = [
  '#6366F1', '#8B5CF6', '#EC4899', '#EF4444',
  '#F59E0B', '#22C55E', '#06B6D4', '#3B82F6',
];

function getDeckColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return DECK_COLORS[Math.abs(hash) % DECK_COLORS.length];
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loadingDecks, setLoadingDecks] = useState(true);
  const [cardCounts, setCardCounts] = useState<Record<string, number>>({});
  
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
        router.push('/login');
        return;
      }
      
      setUser(user);
      setLoading(false);
      fetchDecks(user.id);
    };

    checkUser();
  }, [router]);

  const fetchDecks = async (userId: string) => {
    setLoadingDecks(true);
    const supabase = createClient();
    
    // Fetch decks where deleted_at is null
    const { data, error } = await supabase
      .from('decks')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setDecks(data);
      
      // Fetch card counts for each deck
      const counts: Record<string, number> = {};
      for (const deck of data) {
        const { count } = await supabase
          .from('cards')
          .select('*', { count: 'exact', head: true })
          .eq('deck_id', deck.id)
          .is('deleted_at', null);
        counts[deck.id] = count || 0;
      }
      setCardCounts(counts);
    }
    setLoadingDecks(false);
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  };

  const handleCreateDeck = async () => {
    if (!deckTitle.trim() || !user) return;
    setSaving(true);
    setError('');

    const supabase = createClient();
    const now = Date.now();
    
    const { data, error: insertError } = await supabase
      .from('decks')
      .insert({
        id: generateId(),
        user_id: user.id,
        title: deckTitle.trim(),
        description: deckDescription.trim() || null,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
    } else if (data) {
      setDecks([data, ...decks]);
      setCardCounts({ ...cardCounts, [data.id]: 0 });
      setShowCreateModal(false);
      resetForm();
    }
    setSaving(false);
  };

  const handleEditDeck = async () => {
    if (!deckTitle.trim() || !selectedDeck) return;
    setSaving(true);
    setError('');

    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from('decks')
      .update({
        title: deckTitle.trim(),
        description: deckDescription.trim() || null,
        updated_at: Date.now(),
      })
      .eq('id', selectedDeck.id)
      .select()
      .single();

    if (updateError) {
      setError(updateError.message);
    } else if (data) {
      setDecks(decks.map(d => d.id === data.id ? data : d));
      setShowEditModal(false);
      resetForm();
    }
    setSaving(false);
  };

  const handleDeleteDeck = async () => {
    if (!selectedDeck) return;
    setSaving(true);

    const supabase = createClient();
    // Soft delete
    const { error: deleteError } = await supabase
      .from('decks')
      .update({
        deleted_at: Date.now(),
        updated_at: Date.now(),
      })
      .eq('id', selectedDeck.id);

    if (!deleteError) {
      setDecks(decks.filter(d => d.id !== selectedDeck.id));
      setShowDeleteModal(false);
      setSelectedDeck(null);
    }
    setSaving(false);
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

  if (loading) {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Icons.Brain />
          </div>
          <span style={{ fontSize: 20, fontWeight: 700 }}>
            Memorize<span className="text-gradient">AI</span>
          </span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            {user?.user_metadata?.full_name || user?.email}
          </span>
          <button
            onClick={handleLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 16px',
              background: 'var(--bg-muted)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              color: 'var(--text-secondary)',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            <Icons.Logout />
            Sair
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
              Seus Decks
            </h1>
            <p style={{ color: 'var(--text-secondary)' }}>
              {decks.length === 0 ? 'Crie seu primeiro deck para começar' : `${decks.length} deck${decks.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => router.push('/dashboard/upload')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '14px 20px',
                background: 'var(--bg-muted)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                color: 'var(--text-primary)',
                fontSize: 15,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <Icons.Sparkles />
              Gerar com IA
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '14px 24px',
                background: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
                border: 'none',
                borderRadius: 12,
                color: 'white',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 20px rgba(99, 102, 241, 0.3)',
              }}
            >
              <Icons.Plus />
              Novo Deck
            </button>
          </div>
        </div>

        {/* Loading State */}
        {loadingDecks ? (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <Icons.Loader />
          </div>
        ) : decks.length === 0 ? (
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
              <Icons.Cards />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
              Nenhum deck ainda
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 24, maxWidth: 400, margin: '0 auto 24px' }}>
              Crie seu primeiro deck de flashcards para começar a estudar.
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
              Criar Primeiro Deck
            </button>
          </div>
        ) : (
          /* Deck Grid */
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 20,
          }}>
            {decks.map(deck => (
              <div
                key={deck.id}
                style={{
                  background: 'var(--bg-raised)',
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  overflow: 'hidden',
                  transition: 'all 0.2s ease',
                }}
              >
                {/* Color Bar */}
                <div style={{ height: 6, background: getDeckColor(deck.id) }} />
                
                {/* Content */}
                <div style={{ padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <h3 
                      style={{ fontSize: 18, fontWeight: 600, flex: 1, cursor: 'pointer' }}
                      onClick={() => router.push(`/deck/${deck.id}`)}
                    >
                      {deck.title}
                    </h3>
                    <div style={{ position: 'relative' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenu(activeMenu === deck.id ? null : deck.id);
                        }}
                        style={{
                          padding: 8,
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          borderRadius: 8,
                        }}
                      >
                        <Icons.MoreVertical />
                      </button>
                      
                      {/* Dropdown Menu */}
                      {activeMenu === deck.id && (
                        <div style={{
                          position: 'absolute',
                          top: '100%',
                          right: 0,
                          background: 'var(--bg-overlay)',
                          border: '1px solid var(--border)',
                          borderRadius: 12,
                          padding: 8,
                          minWidth: 140,
                          boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
                          zIndex: 10,
                        }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(deck);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              width: '100%',
                              padding: '10px 12px',
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-primary)',
                              fontSize: 14,
                              cursor: 'pointer',
                              borderRadius: 8,
                              textAlign: 'left',
                            }}
                          >
                            <Icons.Edit />
                            Editar
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openDeleteModal(deck);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              width: '100%',
                              padding: '10px 12px',
                              background: 'transparent',
                              border: 'none',
                              color: '#EF4444',
                              fontSize: 14,
                              cursor: 'pointer',
                              borderRadius: 8,
                              textAlign: 'left',
                            }}
                          >
                            <Icons.Trash />
                            Excluir
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {deck.description && (
                    <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
                      {deck.description}
                    </p>
                  )}
                  
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
                      <Icons.Cards />
                      <span>{cardCounts[deck.id] || 0} cards</span>
                    </div>
                    
                    <button
                      onClick={() => router.push(`/deck/${deck.id}`)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '8px 16px',
                        background: 'rgba(99, 102, 241, 0.1)',
                        border: 'none',
                        borderRadius: 8,
                        color: 'var(--accent)',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <Icons.Play />
                      Estudar
                    </button>
                  </div>
                </div>
              </div>
            ))}
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
            
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
                Descrição (opcional)
              </label>
              <textarea
                placeholder="Uma breve descrição do conteúdo..."
                value={deckDescription}
                onChange={(e) => setDeckDescription(e.target.value)}
                style={{ ...inputStyle, height: 80, resize: 'none', paddingTop: 12 }}
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
            
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
                Descrição (opcional)
              </label>
              <textarea
                value={deckDescription}
                onChange={(e) => setDeckDescription(e.target.value)}
                style={{ ...inputStyle, height: 80, resize: 'none', paddingTop: 12 }}
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
          <p style={{ color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
            Tem certeza que deseja excluir o deck <strong>&ldquo;{selectedDeck.title}&rdquo;</strong>? 
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
        maxWidth: 440,
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderBottom: '1px solid var(--border)',
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
        
        {/* Content */}
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
const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 48,
  padding: '0 16px',
  fontSize: 15,
  background: 'var(--bg-muted)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  color: 'var(--text-primary)',
  outline: 'none',
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

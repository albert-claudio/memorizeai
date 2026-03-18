'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { Deck } from '@/lib/types';
import { useDecks } from '@/features/dashboard/hooks/useDecks';
import { useTierLimits } from '@/features/dashboard/hooks/useTierLimits';
import { Icons, Modal, DeckCard, EmptyState, inputStyle, primaryButtonStyle, secondaryButtonStyle, globalStyles } from '../components';

function DecksPageInner() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const { decks, cardCounts, loading: loadingDecks, addDeck, updateDeck, removeDeck } = useDecks(user?.id);
  const { tierLimits, incrementDeckCount } = useTierLimits();
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedDeck, setSelectedDeck] = useState<Deck | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  
  const [deckTitle, setDeckTitle] = useState('');
  const [deckDescription, setDeckDescription] = useState('');
  const [deckConcurso, setDeckConcurso] = useState('');
  const [deckMateria, setDeckMateria] = useState('');
  const [deckTema, setDeckTema] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [filterConcurso, setFilterConcurso] = useState('Todos');
  const [filterMateria, setFilterMateria] = useState('Todas');
  const [groupBy, setGroupBy] = useState<'Nenhum' | 'Materia' | 'Concurso'>('Nenhum');

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

  const handleCreateDeck = async () => {
    if (!deckTitle.trim() || !user) return;
    if (tierLimits && !tierLimits.isPro && decks.length >= tierLimits.maxDecks) {
      setError(`Limite de ${tierLimits.maxDecks} decks atingido. Faça upgrade para Pro.`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await addDeck(deckTitle, deckDescription, deckConcurso, deckMateria, deckTema);
      setShowCreateModal(false);
      resetForm();
      incrementDeckCount();
    } catch (err) {
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
      await updateDeck(selectedDeck.id, deckTitle, deckDescription, deckConcurso, deckMateria, deckTema);
      setShowEditModal(false);
      resetForm();
    } catch (err) {
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
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (deck: Deck) => {
    setSelectedDeck(deck);
    setDeckTitle(deck.title);
    setDeckDescription(deck.description || '');
    setDeckConcurso(deck.concurso || '');
    setDeckMateria(deck.materia || '');
    setDeckTema(deck.tema || '');
    setShowEditModal(true);
    setActiveMenu(null);
  };

  const openDeleteModal = (deck: Deck) => {
    setSelectedDeck(deck);
    setShowDeleteModal(true);
    setActiveMenu(null);
  };

  const resetForm = () => {
    setDeckTitle(''); setDeckDescription(''); setDeckConcurso(''); setDeckMateria(''); setDeckTema('');
    setSelectedDeck(null); setError('');
  };

  const uniqueConcursos = Array.from(new Set(decks.map(d => d.concurso).filter(Boolean))) as string[];
  const uniqueMaterias = Array.from(new Set(decks.map(d => d.materia).filter(Boolean))) as string[];

  const filteredDecks = decks.filter(deck => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match = deck.title.toLowerCase().includes(q) || (deck.description?.toLowerCase() || '').includes(q) ||
        (deck.concurso?.toLowerCase() || '').includes(q) || (deck.materia?.toLowerCase() || '').includes(q) ||
        (deck.tema?.toLowerCase() || '').includes(q);
      if (!match) return false;
    }
    if (filterConcurso !== 'Todos' && deck.concurso !== filterConcurso) return false;
    if (filterMateria !== 'Todas' && deck.materia !== filterMateria) return false;
    return true;
  });

  const renderDeckCard = (deck: Deck) => (
    <DeckCard key={deck.id} deck={deck} cardCount={cardCounts[deck.id] || 0} isMenuOpen={activeMenu === deck.id} onMenuToggle={() => setActiveMenu(activeMenu === deck.id ? null : deck.id)} onEdit={() => openEditModal(deck)} onDelete={() => openDeleteModal(deck)} />
  );

  const renderDecks = () => {
    if (filteredDecks.length === 0) {
      return (
        <div style={{ padding: 40, textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: 16 }}>
          <p style={{ color: '#a1a1aa' }}>Nenhum deck encontrado com os filtros atuais.</p>
          <button type="button" onClick={() => { setSearchQuery(''); setFilterConcurso('Todos'); setFilterMateria('Todas'); }} style={{ ...secondaryButtonStyle, marginTop: 16 }}>Limpar Filtros</button>
        </div>
      );
    }
    if (groupBy === 'Nenhum') return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>{filteredDecks.map(renderDeckCard)}</div>;
    
    const groups: Record<string, Deck[]> = {};
    filteredDecks.forEach(deck => {
      const key = groupBy === 'Concurso' ? deck.concurso : deck.materia;
      const groupName = key || 'Sem classificação';
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(deck);
    });
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
        {Object.entries(groups).sort(([a], [b]) => {
          if (a === 'Sem classificação') return 1;
          if (b === 'Sem classificação') return -1;
          return a.localeCompare(b);
        }).map(([groupName, groupDecks]) => (
          <div key={groupName}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#f4f4f5', marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 8 }}>
              {groupName} <span style={{ color: '#71717a', fontSize: 14, fontWeight: 500 }}>({groupDecks.length})</span>
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>{groupDecks.map(renderDeckCard)}</div>
          </div>
        ))}
      </div>
    );
  };

  if (loadingUser) {
    return (
      <div style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 48, height: 48, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#6366F1', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style jsx global>{globalStyles}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', padding: '32px 24px' }}>
      <style jsx global>{globalStyles}</style>
      <main style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40, flexWrap: 'wrap', gap: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em', color: '#f4f4f5' }}>Catálogo de Decks</h1>
              {tierLimits && (
                <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: tierLimits.isPro ? 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)' : 'rgba(255,255,255,0.08)', color: tierLimits.isPro ? '#000' : '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{tierLimits.isPro ? '👑 Pro' : 'Free'}</span>
              )}
            </div>
            <p style={{ color: '#71717a', fontSize: 15 }}>
              {decks.length === 0 ? 'Crie seu primeiro deck' : `${decks.length} deck(s) totais`}
            </p>
          </div>
          <button onClick={() => { if (tierLimits && !tierLimits.isPro && decks.length >= tierLimits.maxDecks) { alert(`Limite atingido.`); router.push('/upgrade'); } else setShowCreateModal(true); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 22px', background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #A855F7 100%)', border: 'none', borderRadius: 12, color: 'white', fontSize: 15, fontWeight: 600, cursor: 'pointer', boxShadow: '0 0 24px rgba(99, 102, 241, 0.4)' }}>
            <Icons.Plus /> Novo Deck
          </button>
        </div>

        {loadingDecks ? (
          <div style={{ textAlign: 'center', padding: 80 }}><Icons.Loader /></div>
        ) : decks.length === 0 ? (
          <EmptyState onCreateDeck={() => setShowCreateModal(true)} />
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24, background: 'rgba(255,255,255,0.02)', padding: 16, borderRadius: 16, border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ flex: '1 1 200px' }}>
                <input type="text" placeholder="Buscar decks..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ ...inputStyle, width: '100%' } as React.CSSProperties} />
              </div>
              <div style={{ flex: '0 1 180px' }}>
                <select value={filterConcurso} onChange={(e) => setFilterConcurso(e.target.value)} style={{ ...inputStyle, width: '100%', appearance: 'auto', cursor: 'pointer', color: '#f4f4f5' } as React.CSSProperties}>
                  <option value="Todos" style={{ color: '#000' }}>Todos os Concursos</option>
                  {uniqueConcursos.map(c => <option key={c} value={c} style={{ color: '#000' }}>{c}</option>)}
                </select>
              </div>
              <div style={{ flex: '0 1 180px' }}>
                <select value={filterMateria} onChange={(e) => setFilterMateria(e.target.value)} style={{ ...inputStyle, width: '100%', appearance: 'auto', cursor: 'pointer', color: '#f4f4f5' } as React.CSSProperties}>
                  <option value="Todas" style={{ color: '#000' }}>Todas as Matérias</option>
                  {uniqueMaterias.map(m => <option key={m} value={m} style={{ color: '#000' }}>{m}</option>)}
                </select>
              </div>
              <div style={{ flex: '0 1 180px' }}>
                <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as 'Nenhum' | 'Concurso' | 'Materia')} style={{ ...inputStyle, width: '100%', appearance: 'auto', cursor: 'pointer', color: '#f4f4f5' } as React.CSSProperties}>
                  <option value="Nenhum" style={{ color: '#000' }}>Agrupar: Nenhum</option>
                  <option value="Concurso" style={{ color: '#000' }}>Agrupar por Concurso</option>
                  <option value="Materia" style={{ color: '#000' }}>Agrupar por Matéria</option>
                </select>
              </div>
            </div>
            {renderDecks()}
          </>
        )}
      </main>

      {/* --- Modals for Create, Edit, Delete --- */}
      {showCreateModal && (
        <Modal title="Criar Novo Deck" onClose={() => { setShowCreateModal(false); resetForm(); }}>
          <form onSubmit={(e) => { e.preventDefault(); handleCreateDeck(); }}>
            {error && <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 12, padding: 14, color: '#f87171', marginBottom: 20 }}>{error}</div>}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 10, color: '#e4e4e7' }}>Título do Deck *</label>
              <input type="text" placeholder="Ex: Direito Civil - OAB" value={deckTitle} onChange={(e) => setDeckTitle(e.target.value)} style={inputStyle} required autoFocus />
            </div>
            <div style={{ marginBottom: 28 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 10, color: '#e4e4e7' }}>Descrição (opcional)</label>
              <textarea placeholder="Uma breve descrição..." value={deckDescription} onChange={(e) => setDeckDescription(e.target.value)} style={{ ...inputStyle, height: 88, resize: 'none' } as React.CSSProperties} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 28 }}>
              <div><label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#e4e4e7' }}>Concurso</label><input type="text" placeholder="Ex: OAB" value={deckConcurso} onChange={(e) => setDeckConcurso(e.target.value)} style={inputStyle} /></div>
              <div><label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#e4e4e7' }}>Matéria</label><input type="text" placeholder="Ex: Direito Civil" value={deckMateria} onChange={(e) => setDeckMateria(e.target.value)} style={inputStyle} /></div>
              <div><label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#e4e4e7' }}>Tema</label><input type="text" placeholder="Ex: Direito Civil" value={deckTema} onChange={(e) => setDeckTema(e.target.value)} style={inputStyle} /></div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" onClick={() => { setShowCreateModal(false); resetForm(); }} style={secondaryButtonStyle}>Cancelar</button>
              <button type="submit" disabled={saving || !deckTitle.trim()} style={{ ...primaryButtonStyle, opacity: saving || !deckTitle.trim() ? 0.6 : 1 }}>{saving ? <Icons.Loader /> : 'Criar Deck'}</button>
            </div>
          </form>
        </Modal>
      )}

      {showEditModal && selectedDeck && (
        <Modal title="Editar Deck" onClose={() => { setShowEditModal(false); resetForm(); }}>
          <form onSubmit={(e) => { e.preventDefault(); handleEditDeck(); }}>
            {error && <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 12, padding: 14, color: '#f87171', marginBottom: 20 }}>{error}</div>}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 10, color: '#e4e4e7' }}>Título do Deck *</label>
              <input type="text" value={deckTitle} onChange={(e) => setDeckTitle(e.target.value)} style={inputStyle} required autoFocus />
            </div>
            <div style={{ marginBottom: 28 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 10, color: '#e4e4e7' }}>Descrição (opcional)</label>
              <textarea value={deckDescription} onChange={(e) => setDeckDescription(e.target.value)} style={{ ...inputStyle, height: 88, resize: 'none' } as React.CSSProperties} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 28 }}>
              <div><label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#e4e4e7' }}>Concurso</label><input type="text" value={deckConcurso} onChange={(e) => setDeckConcurso(e.target.value)} style={inputStyle} /></div>
              <div><label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#e4e4e7' }}>Matéria</label><input type="text" value={deckMateria} onChange={(e) => setDeckMateria(e.target.value)} style={inputStyle} /></div>
              <div><label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#e4e4e7' }}>Tema</label><input type="text" value={deckTema} onChange={(e) => setDeckTema(e.target.value)} style={inputStyle} /></div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" onClick={() => { setShowEditModal(false); resetForm(); }} style={secondaryButtonStyle}>Cancelar</button>
              <button type="submit" disabled={saving || !deckTitle.trim()} style={{ ...primaryButtonStyle, opacity: saving || !deckTitle.trim() ? 0.6 : 1 }}>{saving ? <Icons.Loader /> : 'Salvar'}</button>
            </div>
          </form>
        </Modal>
      )}

      {showDeleteModal && selectedDeck && (
        <Modal title="Excluir Deck" onClose={() => { setShowDeleteModal(false); setSelectedDeck(null); }}>
          <p style={{ color: '#a1a1aa', marginBottom: 28, lineHeight: 1.7, fontSize: 15 }}>
            Tem certeza que deseja excluir o deck <strong style={{ color: '#f4f4f5' }}>&ldquo;{selectedDeck.title}&rdquo;</strong>? 
            Esta ação não pode ser desfeita e todos os cards serão perdidos.
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button type="button" onClick={() => { setShowDeleteModal(false); setSelectedDeck(null); }} style={secondaryButtonStyle}>Cancelar</button>
            <button onClick={handleDeleteDeck} disabled={saving} style={{ ...primaryButtonStyle, background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', boxShadow: '0 0 24px rgba(239, 68, 68, 0.3)', opacity: saving ? 0.6 : 1 }}>{saving ? <Icons.Loader /> : 'Excluir'}</button>
          </div>
        </Modal>
      )}

      {activeMenu && <div style={{ position: 'fixed', inset: 0, zIndex: 5 }} onClick={() => setActiveMenu(null)} />}
    </div>
  );
}

export default function DecksPage() {
  return (
    <Suspense>
      <DecksPageInner />
    </Suspense>
  );
}


'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { Card } from '@/lib/types';

import { useDeck } from '@/features/deck/hooks/useDeck';
import { useCards } from '@/features/deck/hooks/useCards';
import { useTierLimits } from '@/features/dashboard/hooks/useTierLimits';

import { Icons } from '@/features/deck/components/Icons';
import { DeckHeader } from '@/features/deck/components/DeckHeader';
import { EmptyState } from '@/features/deck/components/EmptyState';
import { CardList } from '@/features/deck/components/CardList';
import { 
  CreateCardModal, 
  EditCardModal, 
  DeleteCardModal 
} from '@/features/deck/components/Modals';

export default function DeckDetailPage() {
  const router = useRouter();
  const params = useParams();
  const deckId = params.id as string;
  
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // Initial User Check
  useEffect(() => {
    const checkUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/login');
        return;
      }
      
      setUser(user);
      setLoadingUser(false);
    };

    checkUser();
  }, [router]);

  // Hooks
  const { deck, loading: loadingDeck } = useDeck(deckId, user?.id);
  const { 
    cards, 
    loading: loadingCards, 
    addCard, 
    updateCard, 
    removeCard 
  } = useCards(deckId);
  
  const { tierLimits } = useTierLimits();

  // Local State for Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  // Handlers
  const handleEditClick = (card: Card) => {
    setSelectedCard(card);
    setShowEditModal(true);
  };

  const handleDeleteClick = (card: Card) => {
    setSelectedCard(card);
    setShowDeleteModal(true);
  };

  const tierLimitReached = !!(
    tierLimits && 
    !tierLimits.isPro && 
    cards.length >= tierLimits.maxCardsPerDeck
  );

  // Loading Screen
  if (loadingUser || loadingDeck || !deck) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-base)',
      }}>
        <Icons.Loader />
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

      <DeckHeader 
        deck={deck} 
        hasCards={cards.length > 0} 
        onStudy={() => router.push(`/estudar/${deckId}`)} 
      />

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

        {loadingCards ? (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <Icons.Loader />
          </div>
        ) : cards.length === 0 ? (
          <EmptyState onCreateCard={() => setShowCreateModal(true)} />
        ) : (
          <CardList 
            cards={cards} 
            loading={loadingCards} 
            onEdit={handleEditClick} 
            onDelete={handleDeleteClick} 
          />
        )}
      </main>

      {/* Modals */}
      <CreateCardModal 
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={addCard}
        tierLimitReached={tierLimitReached}
        maxCards={tierLimits?.maxCardsPerDeck ?? 50} // Default fallback
      />

      <EditCardModal 
        card={selectedCard}
        isOpen={showEditModal}
        onClose={() => { setShowEditModal(false); setSelectedCard(null); }}
        onSubmit={updateCard}
      />

      <DeleteCardModal 
        card={selectedCard}
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setSelectedCard(null); }}
        onConfirm={removeCard}
      />
    </div>
  );
}

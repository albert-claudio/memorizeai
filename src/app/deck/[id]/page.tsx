
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { Card, ExamTarget } from '@/lib/types';

import { useDeck } from '@/features/deck/hooks/useDeck';
import { useCards } from '@/features/deck/hooks/useCards';
import { examTargetService } from '@/features/deck/services/examTargetService';

import { Icons } from '@/features/deck/components/Icons';
import { DeckHeader } from '@/features/deck/components/DeckHeader';
import { EmptyState } from '@/features/deck/components/EmptyState';
import { CardList } from '@/features/deck/components/CardList';
import { ExamTargetCard } from '@/features/deck/components/ExamTargetCard';
import { 
  EditCardModal, 
  DeleteCardModal,
  ExamTargetModal,
} from '@/features/deck/components/Modals';

function getExamTargetLabel(examTarget: ExamTarget | null): string | null {
  if (!examTarget) return null;

  const days = Math.ceil((examTarget.target_date - Date.now()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Prova agora';
  if (days === 1) return 'Prova em 1 dia';
  return `Prova em ${days} dias`;
}

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
    updateCard, 
    removeCard 
  } = useCards(deckId);

  // Local State for Modals
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showExamTargetModal, setShowExamTargetModal] = useState(false);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [examTarget, setExamTarget] = useState<ExamTarget | null>(null);
  const [prioritizeNearExam, setPrioritizeNearExam] = useState(false);
  const [loadingExamTarget, setLoadingExamTarget] = useState(true);
  const [savingExamTarget, setSavingExamTarget] = useState(false);
  const [deletingExamTarget, setDeletingExamTarget] = useState(false);
  const [examTargetUnavailable, setExamTargetUnavailable] = useState(false);
  const [examTargetError, setExamTargetError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const loadExamTarget = async () => {
      try {
        setLoadingExamTarget(true);
        setExamTargetError(null);

        const response = await examTargetService.get(deckId);
        if (cancelled) return;

        setExamTarget(response.examTarget);
        setPrioritizeNearExam(response.prioritizeNearExam);
        setExamTargetUnavailable(response.unavailable);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Erro ao carregar meta de prova';
        setExamTargetError(message);
      } finally {
        if (!cancelled) {
          setLoadingExamTarget(false);
        }
      }
    };

    loadExamTarget();

    return () => {
      cancelled = true;
    };
  }, [deckId, user]);

  // Handlers
  const handleEditClick = (card: Card) => {
    setSelectedCard(card);
    setShowEditModal(true);
  };

  const handleDeleteClick = (card: Card) => {
    setSelectedCard(card);
    setShowDeleteModal(true);
  };

  const handleExamTargetSubmit = async (payload: {
    title: string;
    target_date: number;
    target_retention: number;
  }) => {
    setSavingExamTarget(true);
    setExamTargetError(null);

    try {
      const response = await examTargetService.save(deckId, payload);
      setExamTarget(response.examTarget);
      setPrioritizeNearExam(response.prioritizeNearExam);
      setExamTargetUnavailable(response.unavailable);
    } finally {
      setSavingExamTarget(false);
    }
  };

  const handleExamTargetDelete = async () => {
    const confirmed = window.confirm('Remover a meta de prova deste deck?');
    if (!confirmed) return;

    setDeletingExamTarget(true);
    setExamTargetError(null);

    try {
      const response = await examTargetService.remove(deckId);
      setExamTarget(response.examTarget);
      setPrioritizeNearExam(response.prioritizeNearExam);
      setExamTargetUnavailable(response.unavailable);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao remover meta de prova';
      setExamTargetError(message);
    } finally {
      setDeletingExamTarget(false);
    }
  };

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
        onConfigureExamTarget={() => setShowExamTargetModal(true)}
        examTargetLabel={getExamTargetLabel(examTarget)}
      />

      <main style={{ padding: '20px clamp(12px, 4vw, 24px) 32px', maxWidth: 1000, margin: '0 auto' }}>
        <ExamTargetCard
          examTarget={examTarget}
          loading={loadingExamTarget}
          prioritizeNearExam={prioritizeNearExam}
          unavailable={examTargetUnavailable}
          error={examTargetError}
          onConfigure={() => setShowExamTargetModal(true)}
          onDelete={handleExamTargetDelete}
          deleting={deletingExamTarget}
        />

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
            onClick={() => router.push('/dashboard/runs')}
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
            Gerar com IA
          </button>
        </div>

        {loadingCards ? (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <Icons.Loader />
          </div>
        ) : cards.length === 0 ? (
          <EmptyState onGenerateWithAI={() => router.push('/dashboard/runs')} />
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

      <ExamTargetModal
        isOpen={showExamTargetModal}
        examTarget={examTarget}
        onClose={() => {
          if (!savingExamTarget) setShowExamTargetModal(false);
        }}
        onSubmit={handleExamTargetSubmit}
      />
    </div>
  );
}

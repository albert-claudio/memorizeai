
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

import { useStudySession } from '@/features/study/hooks/useStudySession';
import { useSwipe } from '@/features/study/hooks/useSwipe';
import { 
  StudyHeader, 
  StudyCard, 
  SessionSummary, 
  WaitingScreen, 
  LeechModal, 
  StruggleModal 
} from '@/features/study/components';
import { Icons } from '@/features/deck/components/Icons';

export default function EstudarPage() {
  const router = useRouter();
  const params = useParams();
  const deckId = params.id as string;
  
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

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
  const {
    loading: loadingSession,
    deck,
    currentCard,
    totalDue,
    currentIndex,
    isFlipped,
    setIsFlipped,
    results,
    isComplete,
    handlers,
    waitingForRelearning,
    relearningQueue,
    modals,
    isTransitioning
  } = useStudySession(deckId, user?.id);

  const {
    dragOffset,
    isDragging,
    swipeDirection,
    handlers: swipeHandlers,
    resetSwipe
  } = useSwipe({
    onSwipeLeft: () => handlers.handleGrade(0),
    onSwipeRight: () => handlers.handleGrade(2),
    disabled: !isFlipped || isTransitioning.current
  });

  // Handle manual grade buttons
  const handleGradeClick = async (grade: 0 | 1 | 2 | 3) => {
    // Only reset if not already swiping, to prevent jitter? 
    // Actually manual buttons should just trigger.
    resetSwipe();
    await handlers.handleGrade(grade);
  };

  // Reset swipe when card changes
  useEffect(() => {
    resetSwipe();
  }, [currentCard, resetSwipe]);

  // Renderers
  if (loadingUser || loadingSession) {
    return (
      <div style={{
        minHeight: '100dvh',
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

  if (isComplete) {
    return <SessionSummary results={results} deckId={deckId} />;
  }

  if (waitingForRelearning.waiting) {
    return (
      <WaitingScreen 
        relearningCount={relearningQueue.length}
        remainingSeconds={waitingForRelearning.remainingSeconds}
        onFinish={() => router.push(`/deck/${deckId}`)}
      />
    );
  }

  if (!deck) return null; // Should have redirected

  return (
    <div style={{ 
      minHeight: '100dvh', 
      background: 'var(--bg-base)', 
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <StudyHeader 
        deckTitle={deck.title} 
        currentIndex={currentIndex} 
        totalDue={totalDue} 
      />

      <main style={{ 
        flex: 1, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        padding: 24,
        position: 'relative'
      }}>
        {currentCard ? (
          <StudyCard
            key={currentCard.id}
            card={currentCard}
            isFlipped={isFlipped}
            dragOffset={dragOffset}
            swipeDirection={swipeDirection}
            isDragging={isDragging}
            onFlip={() => !isDragging && setIsFlipped(!isFlipped)}
            onDragStart={swipeHandlers.handleDragStart}
            onDragMove={swipeHandlers.handleDragMove}
            onDragEnd={swipeHandlers.handleDragEnd}
          />
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
            Carregando próximo card...
          </div>
        )}
      </main>

      {/* Floating Swipe Indicators */}
      <div style={{
        position: 'fixed',
        top: '50%',
        left: 24,
        transform: 'translateY(-50%)',
        opacity: swipeDirection === 'left' || (isDragging && dragOffset.x < -50) ? 1 : 0,
        transition: 'opacity 0.2s',
        pointerEvents: 'none',
        zIndex: 50,
      }}>
        <div style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: '#ef4444',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          boxShadow: '0 10px 30px rgba(239, 68, 68, 0.4)',
        }}>
          <Icons.X />
        </div>
      </div>

      <div style={{
        position: 'fixed',
        top: '50%',
        right: 24,
        transform: 'translateY(-50%)',
        opacity: swipeDirection === 'right' || (isDragging && dragOffset.x > 50) ? 1 : 0,
        transition: 'opacity 0.2s',
        pointerEvents: 'none',
        zIndex: 50,
      }}>
        <div style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: '#22c55e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          boxShadow: '0 10px 30px rgba(34, 197, 94, 0.4)',
        }}>
          <Icons.Check />
        </div>
      </div>


      {/* Controls */}
      <div style={{ 
        padding: '24px 24px 48px', 
        display: 'flex', 
        justifyContent: 'center', 
        gap: 16,
        position: 'relative',
        zIndex: 20,
      }}>
        {!isFlipped ? (
           <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Toque no card para ver a resposta</p>
        ) : (
          <>
            <button 
              onClick={() => handleGradeClick(0)}
              style={{ ...gradeBtnStyle, borderColor: '#EF4444', color: '#EF4444', background: 'rgba(239, 68, 68, 0.1)' }}
            >
              Errei
              <span style={{ fontSize: 10, opacity: 0.7 }}>1m</span>
            </button>
            <button 
              onClick={() => handleGradeClick(1)}
              style={{ ...gradeBtnStyle, borderColor: '#F59E0B', color: '#F59E0B', background: 'rgba(245, 158, 11, 0.1)' }}
            >
              Difícil
              <span style={{ fontSize: 10, opacity: 0.7 }}>2d</span>
            </button>
            <button 
              onClick={() => handleGradeClick(2)}
              style={{ ...gradeBtnStyle, borderColor: '#22C55E', color: '#22C55E', background: 'rgba(34, 197, 94, 0.1)' }}
            >
              Bom
              <span style={{ fontSize: 10, opacity: 0.7 }}>4d</span>
            </button>
            <button 
              onClick={() => handleGradeClick(3)}
              style={{ ...gradeBtnStyle, borderColor: '#6366F1', color: '#6366F1', background: 'rgba(99, 102, 241, 0.1)' }}
            >
              Fácil
              <span style={{ fontSize: 10, opacity: 0.7 }}>7d</span>
            </button>
          </>
        )}
      </div>

      {/* Modals */}
      <LeechModal
        card={modals.leechModal.card}
        loading={modals.leechModal.loading}
        suggestion={modals.leechModal.suggestion}
        atomicCards={modals.leechModal.atomicCards}
        applying={modals.leechModal.applying}
        onClose={() => modals.setLeechModal({ ...modals.leechModal, show: false })}
        onApply={handlers.applyLeech}
      />

      <StruggleModal
        card={modals.struggleModal.card}
        loading={modals.struggleModal.loading}
        analysis={modals.struggleModal.analysis}
        memoryTip={modals.struggleModal.memoryTip}
        simplifiedCards={modals.struggleModal.simplifiedCards}
        applying={modals.struggleModal.applying}
        onClose={() => modals.setStruggleModal({ ...modals.struggleModal, show: false })}
        onApply={handlers.applyStruggle}
      />
    </div>
  );
}

const gradeBtnStyle = {
  flex: 1,
  padding: '12px 8px',
  border: '1px solid',
  borderRadius: 12,
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  gap: 4,
};

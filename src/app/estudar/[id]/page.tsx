'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { generateReinforcementCards } from '@/app/actions/generateReinforcementCards';
import { atomizeLeechCard, applyAtomization } from '@/app/actions/atomizeLeechCard';
import { CitationButton } from '@/components/Citation';
import type { Card, Deck } from '@/lib/types';
import { 
  processReview, 
  getIntervalPreviews, 
  sortByPriority, 
  isDue,
  RELEARNING_STEPS,
  type Grade,
  GRADE_LABELS,
  type FSRSConfig,
  DEFAULT_CONFIG,
} from '@/lib/fsrs';
import { DEFAULT_RETENTION, DEFAULT_WEIGHTS } from '@/lib/fsrs-weights';

// ============================================================================
// ICONS
// ============================================================================
const Icons = {
  X: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  Check: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20,6 9,17 4,12"/>
    </svg>
  ),
  Rotate: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2v6h-6"/>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
    </svg>
  ),
  ArrowLeft: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12,19 5,12 12,5"/>
    </svg>
  ),
  Trophy: () => (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
      <path d="M4 22h16"/>
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
    </svg>
  ),
  AlertTriangle: () => (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  Sparkles: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.912 5.813a1 1 0 0 0 .95.687h6.138l-4.97 3.613a1 1 0 0 0-.362 1.118L17.58 20l-4.97-3.613a1 1 0 0 0-1.176 0L6.42 20l1.912-5.769a1 1 0 0 0-.362-1.118L3 9.5h6.138a1 1 0 0 0 .95-.687L12 3z"/>
    </svg>
  ),
  Clock: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
};

// Grade button colors and styles
const GRADE_STYLES: Record<Grade, { bg: string; border: string; color: string }> = {
  0: { bg: 'rgba(239, 68, 68, 0.15)', border: '#EF4444', color: '#EF4444' },
  1: { bg: 'rgba(245, 158, 11, 0.15)', border: '#F59E0B', color: '#F59E0B' },
  2: { bg: 'rgba(34, 197, 94, 0.15)', border: '#22C55E', color: '#22C55E' },
  3: { bg: 'rgba(99, 102, 241, 0.15)', border: '#6366F1', color: '#6366F1' },
};

export default function EstudarPage() {
  const router = useRouter();
  const params = useParams();
  const deckId = params.id as string;
  
  const [loading, setLoading] = useState(true);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [dueCards, setDueCards] = useState<Card[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [results, setResults] = useState<{ correct: number; wrong: number }>({ correct: 0, wrong: 0 });
  const [wrongCards, setWrongCards] = useState<Card[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  
  // Relearning queue (cards that need to be reviewed again this session)
  const [relearningQueue, setRelearningQueue] = useState<Card[]>([]);
  
  // Leech modal state
  const [leechModal, setLeechModal] = useState<{
    show: boolean;
    card: Card | null;
    loading: boolean;
    suggestion: string;
    atomicCards: { front: string; back: string }[];
    applying: boolean;
  }>({
    show: false,
    card: null,
    loading: false,
    suggestion: '',
    atomicCards: [],
    applying: false,
  });
  
  // Interval previews for current card
  const [intervalPreviews, setIntervalPreviews] = useState<Record<Grade, string>>({
    0: '1 min',
    1: '1 d',
    2: '1 d',
    3: '2 d',
  });
  
  // Estado para geração de reforço
  const [generatingReinforcement, setGeneratingReinforcement] = useState(false);
  const [reinforcementResult, setReinforcementResult] = useState<{ 
    success: boolean; 
    count: number;
    newDeckId?: string;
    newDeckTitle?: string;
  } | null>(null);
  
  // Swipe state
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const startPos = useRef({ x: 0, y: 0 });
  
  // Metadados das fontes para citação
  const [sourcesMetadata, setSourcesMetadata] = useState<Record<string, {
    filename: string;
    pageNumber: number | null;
  }>>({});
  
  // FSRS config with user's desired retention
  const [fsrsConfig, setFsrsConfig] = useState<FSRSConfig>(DEFAULT_CONFIG);

  const supabase = createClient();

  // Update interval previews when current card changes
  useEffect(() => {
    if (dueCards.length > 0 && currentIndex < dueCards.length) {
      const currentCard = dueCards[currentIndex];
      const previews = getIntervalPreviews({
        difficulty: currentCard.difficulty,
        stability: currentCard.stability,
        ease_factor: currentCard.ease_factor,
        lapses: currentCard.lapses,
        step: currentCard.step,
      }, fsrsConfig);
      setIntervalPreviews(previews);
    }
  }, [currentIndex, dueCards, fsrsConfig]);

  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Middleware handles redirect, but double-check for safety
      if (!user) {
        window.location.href = '/login';
        return;
      }

      // Load user SRS settings (desired retention)
      const { data: srsSettings } = await supabase
        .from('user_srs_settings')
        .select('desired_retention')
        .eq('user_id', user.id)
        .single();
      
      if (srsSettings?.desired_retention) {
        setFsrsConfig(prev => ({
          ...prev,
          desiredRetention: srsSettings.desired_retention,
        }));
      }

      // Load deck
      const { data: deckData } = await supabase
        .from('decks')
        .select('*')
        .eq('id', deckId)
        .is('deleted_at', null)
        .single();
      
      if (!deckData) {
        router.push('/dashboard');
        return;
      }
      setDeck(deckData);

      // Load cards
      const { data: cardsData } = await supabase
        .from('cards')
        .select('*')
        .eq('deck_id', deckId)
        .is('deleted_at', null);
      
      if (!cardsData || cardsData.length === 0) {
        router.push(`/deck/${deckId}`);
        return;
      }
      
      setCards(cardsData);
      
      // Filter and sort due cards
      const now = Date.now();
      const due = sortByPriority(
        cardsData.filter(c => isDue(c.next_review_at, now)),
        now
      );
      setDueCards(due);
      
      // Buscar metadados das fontes para cards com source_id
      const sourceIds = [...new Set(cardsData.filter(c => c.source_id).map(c => c.source_id))];
      const cardIds = cardsData.filter(c => c.source_id).map(c => c.id);
      
      if (sourceIds.length > 0) {
        const { data: sourcesData } = await supabase
          .from('sources')
          .select('id, filename')
          .in('id', sourceIds);
        
        const { data: referencesData } = await supabase
          .from('card_references')
          .select('card_id, page_number, source_id')
          .in('card_id', cardIds);
        
        const metadata: Record<string, { filename: string; pageNumber: number | null }> = {};
        
        for (const card of cardsData.filter(c => c.source_id)) {
          const source = sourcesData?.find(s => s.id === card.source_id);
          const reference = referencesData?.find(r => r.card_id === card.id);
          
          if (source) {
            metadata[card.id] = {
              filename: source.filename,
              pageNumber: reference?.page_number ?? null,
            };
          }
        }
        
        setSourcesMetadata(metadata);
      }

      setLoading(false);
    };

    loadData();
  }, [deckId, router, supabase]);

  // Handle grade submission (replaces old handleSwipe)
  const handleGrade = useCallback(async (grade: Grade) => {
    const currentCard = dueCards[currentIndex];
    if (!currentCard) return;
    
    const now = Date.now();
    const result = processReview({
      difficulty: currentCard.difficulty,
      stability: currentCard.stability,
      ease_factor: currentCard.ease_factor,
      lapses: currentCard.lapses,
      is_leech: currentCard.is_leech,
      next_review_at: currentCard.next_review_at ?? now,
      last_review_at: currentCard.last_review_at ?? now,
      relearning_step: currentCard.relearning_step,
      step: currentCard.step,
    }, grade, now, fsrsConfig);
    
    // Track results
    if (grade === 0) {
      setResults(prev => ({ ...prev, wrong: prev.wrong + 1 }));
      setWrongCards(prev => [...prev, currentCard]);
      
      // Add to relearning queue (will be reviewed again this session)
      const updatedCard = { ...currentCard, ...result.newState };
      setRelearningQueue(prev => [...prev, updatedCard]);
    } else {
      setResults(prev => ({ ...prev, correct: prev.correct + 1 }));
    }
    
    // Update card in database
    const { error } = await supabase
      .from('cards')
      .update({
        difficulty: result.newState.difficulty,
        stability: result.newState.stability,
        ease_factor: result.newState.ease_factor,
        lapses: result.newState.lapses,
        is_leech: result.newState.is_leech,
        next_review_at: result.newState.next_review_at,
        last_review_at: result.newState.last_review_at,
        relearning_step: result.newState.relearning_step,
        step: result.newState.step,
        updated_at: now,
      })
      .eq('id', currentCard.id);
    
    if (error) {
      console.error('Error updating card:', error);
    }
    
    // Log review for analytics
    await supabase.from('card_reviews').insert({
      card_id: currentCard.id,
      user_id: (await supabase.auth.getUser()).data.user?.id,
      grade,
      difficulty_before: currentCard.difficulty,
      stability_before: currentCard.stability,
      interval_days: result.intervalDays,
      reviewed_at: now,
    });
    
    // Check if became leech
    if (result.becameLeech) {
      // Show leech modal with AI suggestion
      setLeechModal({
        show: true,
        card: currentCard,
        loading: true,
        suggestion: '',
        atomicCards: [],
        applying: false,
      });
      
      // Get AI suggestions
      const leechResult = await atomizeLeechCard({
        id: currentCard.id,
        deck_id: currentCard.deck_id,
        front: currentCard.front,
        back: currentCard.back,
      });
      
      setLeechModal(prev => ({
        ...prev,
        loading: false,
        suggestion: leechResult.suggestion,
        atomicCards: leechResult.atomicCards,
      }));
      
      return; // Don't advance to next card yet
    }
    
    // Animate and advance
    setSwipeDirection(grade === 0 ? 'left' : 'right');
    
    setTimeout(() => {
      advanceToNextCard();
    }, 300);
  }, [currentIndex, dueCards, supabase]);

  const advanceToNextCard = useCallback(() => {
    // Check if there are relearning cards ready
    const now = Date.now();
    const readyRelearning = relearningQueue.filter(c => 
      c.next_review_at && c.next_review_at <= now
    );
    
    if (readyRelearning.length > 0) {
      // Insert ready relearning cards at current position
      const remainingDue = dueCards.slice(currentIndex + 1);
      setDueCards([...readyRelearning, ...remainingDue]);
      setRelearningQueue(prev => prev.filter(c => !readyRelearning.includes(c)));
      setCurrentIndex(0);
    } else if (currentIndex >= dueCards.length - 1) {
      // Check for pending relearning cards
      if (relearningQueue.length > 0) {
        // Wait for relearning cards
        const nextRelearning = Math.min(...relearningQueue.map(c => c.next_review_at ?? Infinity));
        const waitTime = nextRelearning - now;
        
        if (waitTime > 0 && waitTime < 5 * 60 * 1000) { // Wait up to 5 minutes
          // Show waiting state
          setIsComplete(true);
        } else {
          setIsComplete(true);
        }
      } else {
        setIsComplete(true);
      }
    } else {
      setCurrentIndex(prev => prev + 1);
    }
    
    setIsFlipped(false);
    setSwipeDirection(null);
    setDragOffset({ x: 0, y: 0 });
  }, [currentIndex, dueCards, relearningQueue]);

  const handleApplyAtomization = async () => {
    if (!leechModal.card || leechModal.atomicCards.length === 0) return;
    
    setLeechModal(prev => ({ ...prev, applying: true }));
    
    const result = await applyAtomization(
      {
        id: leechModal.card.id,
        deck_id: leechModal.card.deck_id,
        front: leechModal.card.front,
        back: leechModal.card.back,
      },
      leechModal.atomicCards
    );
    
    if (result.success) {
      // Remove the old card from queue and close modal
      setDueCards(prev => prev.filter(c => c.id !== leechModal.card?.id));
      setLeechModal({ show: false, card: null, loading: false, suggestion: '', atomicCards: [], applying: false });
      advanceToNextCard();
    } else {
      setLeechModal(prev => ({ ...prev, applying: false }));
    }
  };

  // Swipe handlers (used for gestures, maps to grades)
  const handleSwipe = (direction: 'left' | 'right') => {
    handleGrade(direction === 'left' ? 0 : 2);
  };

  const handleDragStart = (clientX: number, clientY: number) => {
    if (!isFlipped) return;
    setIsDragging(true);
    startPos.current = { x: clientX, y: clientY };
  };

  const handleDragMove = (clientX: number, clientY: number) => {
    if (!isDragging || !isFlipped) return;
    const deltaX = clientX - startPos.current.x;
    const deltaY = clientY - startPos.current.y;
    setDragOffset({ x: deltaX, y: deltaY * 0.3 });
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    
    const threshold = 100;
    if (dragOffset.x > threshold) {
      handleSwipe('right');
    } else if (dragOffset.x < -threshold) {
      handleSwipe('left');
    } else {
      setDragOffset({ x: 0, y: 0 });
    }
  };

  const getCardStyle = () => {
    const rotation = dragOffset.x * 0.05;
    let transform = `translateX(${dragOffset.x}px) translateY(${dragOffset.y}px) rotate(${rotation}deg)`;
    
    if (swipeDirection === 'left') {
      transform = 'translateX(-150%) rotate(-30deg)';
    } else if (swipeDirection === 'right') {
      transform = 'translateX(150%) rotate(30deg)';
    }
    
    return {
      transform,
      transition: isDragging ? 'none' : 'transform 0.3s ease-out',
    };
  };

  const getIndicatorOpacity = (direction: 'left' | 'right') => {
    if (direction === 'left') {
      return Math.min(Math.abs(Math.min(dragOffset.x, 0)) / 100, 1);
    }
    return Math.min(Math.max(dragOffset.x, 0) / 100, 1);
  };

  if (loading) {
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

  // No cards due
  if (dueCards.length === 0 && !isComplete) {
    return (
      <div style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-base)',
        padding: 24,
        textAlign: 'center',
      }}>
        <div style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: 'rgba(34, 197, 94, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24,
          color: 'var(--success)',
        }}>
          <Icons.Check />
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
          Nenhum card para revisar! 🎉
        </h1>
        <p style={{ fontSize: 16, color: 'var(--text-secondary)', marginBottom: 32 }}>
          Volte mais tarde para sua próxima revisão
        </p>
        <Link href={`/deck/${deckId}`} style={{ textDecoration: 'none' }}>
          <button style={{
            padding: '16px 32px',
            background: 'var(--bg-muted)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            color: 'var(--text-primary)',
            fontSize: 16,
            fontWeight: 500,
            cursor: 'pointer',
          }}>
            Voltar ao Deck
          </button>
        </Link>
      </div>
    );
  }

  // Complete screen
  if (isComplete) {
    const total = results.correct + results.wrong;
    const percentage = total > 0 ? Math.round((results.correct / total) * 100) : 0;
    
    return (
      <div style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-base)',
        padding: 24,
        textAlign: 'center',
      }}>
        <div style={{
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: percentage >= 70 
            ? 'rgba(34, 197, 94, 0.15)' 
            : 'rgba(245, 158, 11, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 32,
          color: percentage >= 70 ? 'var(--success)' : '#F59E0B',
        }}>
          <Icons.Trophy />
        </div>
        
        <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>
          {percentage >= 70 ? 'Incrível! 🎉' : 'Bom trabalho! 💪'}
        </h1>
        <p style={{ fontSize: 18, color: 'var(--text-secondary)', marginBottom: 32 }}>
          Você completou a sessão de estudo
        </p>
        
        <div style={{
          display: 'flex',
          gap: 24,
          marginBottom: 32,
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 48,
              fontWeight: 800,
              color: 'var(--success)',
              lineHeight: 1,
            }}>
              {results.correct}
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>Acertos</div>
          </div>
          <div style={{
            width: 1,
            background: 'var(--border)',
          }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 48,
              fontWeight: 800,
              color: '#EF4444',
              lineHeight: 1,
            }}>
              {results.wrong}
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>Erros</div>
          </div>
        </div>
        
        {/* Seção de Reforço com IA */}
        {wrongCards.length >= 3 && !reinforcementResult && (
          <div style={{
            background: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            borderRadius: 16,
            padding: 20,
            marginBottom: 24,
            width: '100%',
            maxWidth: 320,
          }}>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
              💡 Você errou {wrongCards.length} cards. Deseja gerar flashcards de reforço com IA?
            </p>
            <button
              onClick={async () => {
                setGeneratingReinforcement(true);
                const result = await generateReinforcementCards(
                  deckId,
                  deck?.title || 'Deck',
                  wrongCards.map(c => ({ id: c.id, front: c.front, back: c.back }))
                );
                setGeneratingReinforcement(false);
                setReinforcementResult({ 
                  success: result.success, 
                  count: result.cardsCreated,
                  newDeckId: result.newDeckId,
                  newDeckTitle: result.newDeckTitle,
                });
              }}
              disabled={generatingReinforcement}
              style={{
                width: '100%',
                padding: '14px 24px',
                background: generatingReinforcement 
                  ? 'var(--bg-muted)' 
                  : 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
                border: 'none',
                borderRadius: 12,
                color: 'white',
                fontSize: 15,
                fontWeight: 600,
                cursor: generatingReinforcement ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              {generatingReinforcement ? (
                <>
                  <div style={{
                    width: 18,
                    height: 18,
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: 'white',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }} />
                  Gerando...
                </>
              ) : (
                '✨ Gerar Reforço com IA'
              )}
            </button>
          </div>
        )}
        
        {/* Feedback de sucesso */}
        {reinforcementResult && (
          <div style={{
            background: reinforcementResult.success 
              ? 'rgba(34, 197, 94, 0.1)' 
              : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${reinforcementResult.success ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            borderRadius: 16,
            padding: 16,
            marginBottom: 24,
            width: '100%',
            maxWidth: 320,
            textAlign: 'center',
          }}>
            <p style={{ 
              fontSize: 14, 
              color: reinforcementResult.success ? 'var(--success)' : '#EF4444',
              fontWeight: 500,
              marginBottom: reinforcementResult.success ? 12 : 0,
            }}>
              {reinforcementResult.success 
                ? `✅ ${reinforcementResult.count} cards de reforço criados!`
                : '❌ Não foi possível gerar os cards.'}
            </p>
            {reinforcementResult.success && reinforcementResult.newDeckId && (
              <Link href={`/estudar/${reinforcementResult.newDeckId}`} style={{ textDecoration: 'none' }}>
                <button style={{
                  padding: '12px 20px',
                  background: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
                  border: 'none',
                  borderRadius: 10,
                  color: 'white',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}>
                  📚 Estudar Revisão Agora
                </button>
              </Link>
            )}
          </div>
        )}
        
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          width: '100%',
          maxWidth: 320,
        }}>
          <button
            onClick={() => {
              setCurrentIndex(0);
              setResults({ correct: 0, wrong: 0 });
              setWrongCards([]);
              setIsComplete(false);
              setIsFlipped(false);
              setReinforcementResult(null);
              setRelearningQueue([]);
              // Reload due cards
              const now = Date.now();
              const due = sortByPriority(
                cards.filter(c => isDue(c.next_review_at, now)),
                now
              );
              setDueCards(due);
            }}
            style={{
              padding: '18px 32px',
              background: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
              border: 'none',
              borderRadius: 14,
              color: 'white',
              fontSize: 17,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(99, 102, 241, 0.3)',
            }}
          >
            Estudar Novamente
          </button>
          <Link href={`/deck/${deckId}`} style={{ textDecoration: 'none' }}>
            <button style={{
              width: '100%',
              padding: '18px 32px',
              background: 'var(--bg-muted)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              color: 'var(--text-secondary)',
              fontSize: 17,
              fontWeight: 500,
              cursor: 'pointer',
            }}>
              Voltar ao Deck
            </button>
          </Link>
        </div>
      </div>
    );
  }

  const currentCard = dueCards[currentIndex];
  const isRelearning = currentCard?.relearning_step !== null && currentCard?.relearning_step !== undefined;

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-base)',
      overflow: 'hidden',
      touchAction: 'none',
    }}>
      {/* Leech Modal */}
      {leechModal.show && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: 20,
        }}>
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: 20,
            padding: 28,
            maxWidth: 400,
            width: '100%',
            textAlign: 'center',
          }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'rgba(245, 158, 11, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              color: '#F59E0B',
            }}>
              <Icons.AlertTriangle />
            </div>
            
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
              Card Sanguessuga Detectado 🩸
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Você errou este card {currentCard?.lapses} vezes. Talvez ele esteja muito complexo.
            </p>
            
            {leechModal.loading ? (
              <div style={{
                padding: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                color: 'var(--text-muted)',
              }}>
                <div style={{
                  width: 20,
                  height: 20,
                  border: '2px solid var(--border)',
                  borderTopColor: 'var(--accent)',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }} />
                Analisando com IA...
              </div>
            ) : (
              <>
                {leechModal.suggestion && (
                  <div style={{
                    background: 'var(--bg-muted)',
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 16,
                    textAlign: 'left',
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginBottom: 8 }}>
                      💡 ANÁLISE DA IA
                    </div>
                    <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {leechModal.suggestion}
                    </p>
                  </div>
                )}
                
                {leechModal.atomicCards.length > 0 && (
                  <div style={{
                    background: 'rgba(99, 102, 241, 0.1)',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 20,
                    textAlign: 'left',
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginBottom: 12 }}>
                      ✨ SUGESTÃO: Dividir em {leechModal.atomicCards.length} cards atômicos
                    </div>
                    {leechModal.atomicCards.slice(0, 3).map((card, i) => (
                      <div key={i} style={{
                        fontSize: 13,
                        color: 'var(--text-primary)',
                        padding: '8px 0',
                        borderBottom: i < 2 ? '1px solid var(--border)' : 'none',
                      }}>
                        <strong>Q:</strong> {card.front.substring(0, 60)}...
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => {
                  setLeechModal({ show: false, card: null, loading: false, suggestion: '', atomicCards: [], applying: false });
                  advanceToNextCard();
                }}
                style={{
                  flex: 1,
                  padding: '14px 20px',
                  background: 'var(--bg-muted)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  color: 'var(--text-secondary)',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Manter Original
              </button>
              {leechModal.atomicCards.length > 0 && (
                <button
                  onClick={handleApplyAtomization}
                  disabled={leechModal.applying}
                  style={{
                    flex: 1,
                    padding: '14px 20px',
                    background: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
                    border: 'none',
                    borderRadius: 12,
                    color: 'white',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: leechModal.applying ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  {leechModal.applying ? (
                    <>
                      <div style={{
                        width: 16,
                        height: 16,
                        border: '2px solid rgba(255,255,255,0.3)',
                        borderTopColor: 'white',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                      }} />
                      Aplicando...
                    </>
                  ) : (
                    <>
                      <Icons.Sparkles />
                      Dividir Card
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Header */}
      <header style={{
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <Link
          href={`/deck/${deckId}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 44,
            height: 44,
            borderRadius: 12,
            background: 'var(--bg-muted)',
            color: 'var(--text-secondary)',
            textDecoration: 'none',
          }}
        >
          <Icons.ArrowLeft />
        </Link>
        
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {currentIndex + 1} / {dueCards.length}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {deck?.title}
          </div>
        </div>
        
        {/* Relearning indicator */}
        {isRelearning && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            background: 'rgba(245, 158, 11, 0.15)',
            borderRadius: 20,
            color: '#F59E0B',
            fontSize: 12,
            fontWeight: 600,
          }}>
            <Icons.Clock />
            Reaprendizado
          </div>
        )}
        
        {!isRelearning && <div style={{ width: 44 }} />}
      </header>

      {/* Progress Bar */}
      <div style={{
        height: 4,
        background: 'var(--bg-muted)',
        marginBottom: 24,
      }}>
        <div style={{
          height: '100%',
          width: `${((currentIndex) / dueCards.length) * 100}%`,
          background: 'linear-gradient(90deg, #6366F1, #7C3AED)',
          transition: 'width 0.3s ease',
        }} />
      </div>

      {/* Card Area */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 20px',
        position: 'relative',
      }}>
        {/* Swipe Indicators */}
        <div style={{
          position: 'absolute',
          left: 20,
          top: '50%',
          transform: 'translateY(-50%)',
          opacity: getIndicatorOpacity('left'),
          transition: isDragging ? 'none' : 'opacity 0.2s',
          pointerEvents: 'none',
        }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.2)',
            border: '3px solid #EF4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#EF4444',
          }}>
            <Icons.X />
          </div>
        </div>
        
        <div style={{
          position: 'absolute',
          right: 20,
          top: '50%',
          transform: 'translateY(-50%)',
          opacity: getIndicatorOpacity('right'),
          transition: isDragging ? 'none' : 'opacity 0.2s',
          pointerEvents: 'none',
        }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'rgba(34, 197, 94, 0.2)',
            border: '3px solid var(--success)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--success)',
          }}>
            <Icons.Check />
          </div>
        </div>

        {/* Card */}
        <div
          ref={cardRef}
          style={{
            width: '100%',
            maxWidth: 400,
            aspectRatio: '3/4',
            maxHeight: 'calc(100dvh - 340px)',
            perspective: '1000px',
            cursor: isFlipped ? 'grab' : 'pointer',
            ...getCardStyle(),
          }}
          onClick={() => !isFlipped && setIsFlipped(true)}
          onMouseDown={(e) => handleDragStart(e.clientX, e.clientY)}
          onMouseMove={(e) => handleDragMove(e.clientX, e.clientY)}
          onMouseUp={handleDragEnd}
          onMouseLeave={handleDragEnd}
          onTouchStart={(e) => handleDragStart(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchMove={(e) => handleDragMove(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchEnd={handleDragEnd}
        >
          <div style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            transformStyle: 'preserve-3d',
            transition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}>
            {/* Front */}
            <div style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              backfaceVisibility: 'hidden',
              background: 'linear-gradient(145deg, #1C1C1E 0%, #2C2C2E 100%)',
              borderRadius: 24,
              padding: 32,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}>
              <span style={{
                position: 'absolute',
                top: 24,
                left: 24,
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--accent)',
                letterSpacing: '0.1em',
              }}>
                PERGUNTA
              </span>
              <p style={{
                fontSize: 'clamp(18px, 5vw, 24px)',
                fontWeight: 600,
                lineHeight: 1.4,
                maxHeight: '80%',
                overflow: 'auto',
              }}>
                {currentCard?.front}
              </p>
              <div style={{
                position: 'absolute',
                bottom: 24,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: 'var(--text-muted)',
                fontSize: 14,
              }}>
                <Icons.Rotate />
                <span>Toque para ver resposta</span>
              </div>
            </div>
            
            {/* Back */}
            <div style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              backfaceVisibility: 'hidden',
              background: 'linear-gradient(145deg, rgba(99, 102, 241, 0.15) 0%, rgba(124, 58, 237, 0.15) 100%)',
              borderRadius: 24,
              padding: 32,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              transform: 'rotateY(180deg)',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
              border: '1px solid var(--accent)',
            }}>
              <span style={{
                position: 'absolute',
                top: 24,
                left: 24,
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--success)',
                letterSpacing: '0.1em',
              }}>
                RESPOSTA
              </span>
              <p style={{
                fontSize: 'clamp(16px, 4vw, 20px)',
                fontWeight: 500,
                lineHeight: 1.5,
                maxHeight: '80%',
                overflow: 'auto',
              }}>
                {currentCard?.back}
              </p>
              {currentCard?.citation_text && currentCard?.source_id && (
                <div style={{ position: 'absolute', bottom: 24, right: 24 }}>
                  <CitationButton
                    sourceName={sourcesMetadata[currentCard.id]?.filename || deck?.title || 'PDF'}
                    pageNumber={sourcesMetadata[currentCard.id]?.pageNumber ?? null}
                    excerpt={currentCard.citation_text}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4-Grade Action Buttons */}
      <div style={{
        padding: '20px 16px 32px',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8,
          maxWidth: 400,
          margin: '0 auto',
        }}>
          {([0, 1, 2, 3] as Grade[]).map((grade) => {
            const style = GRADE_STYLES[grade];
            const isDisabled = !isFlipped;
            
            return (
              <button
                key={grade}
                onClick={() => isFlipped && handleGrade(grade)}
                disabled={isDisabled}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '12px 8px',
                  background: isFlipped ? style.bg : 'var(--bg-muted)',
                  border: `2px solid ${isFlipped ? style.border : 'var(--border)'}`,
                  borderRadius: 14,
                  color: isFlipped ? style.color : 'var(--text-muted)',
                  cursor: isFlipped ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s ease',
                  opacity: isFlipped ? 1 : 0.4,
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                  {GRADE_LABELS[grade]}
                </span>
                <span style={{ fontSize: 11, opacity: 0.8 }}>
                  {intervalPreviews[grade]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

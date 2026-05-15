
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import * as Sentry from '@sentry/nextjs';
import type { Card, Deck } from '@/lib/types';
import { 
  processReview, 
  getIntervalPreviews, 
  sortByPriority, 
  isDue,
  type Grade,
  type FSRSConfig,
  DEFAULT_CONFIG,
} from '@/lib/fsrs';
import { weightsFromAny } from '@/lib/fsrs/weights';
import { studyService } from '../services/studyService';
import { analyzeStruggleCard, applyStruggleSuggestions } from '@/app/actions/analyzeStruggleCard';
import { atomizeLeechCard, applyAtomization } from '@/app/actions/atomizeLeechCard';

export function useStudySession(deckId: string, userId: string | undefined, isPro: boolean = false) {
  const router = useRouter();
  
  // Data State
  const [loading, setLoading] = useState(true);
  const [deck, setDeck] = useState<Deck | null>(null);
  // cards is stored for potential future use; dueCards is the active filtered subset
  const [, setCards] = useState<Card[]>([]);
  const [dueCards, setDueCards] = useState<Card[]>([]);
  
  // Session State
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [results, setResults] = useState<{ correct: number; wrong: number }>({ correct: 0, wrong: 0 });
  const [isComplete, setIsComplete] = useState(false);
  
  // Relearning State
  const [relearningQueue, setRelearningQueue] = useState<Card[]>([]);
  const [waitingForRelearning, setWaitingForRelearning] = useState<{
    waiting: boolean;
    nextReviewAt: number | null;
    remainingSeconds: number;
  }>({ waiting: false, nextReviewAt: null, remainingSeconds: 0 });

  // Config State
  const [fsrsConfig, setFsrsConfig] = useState<FSRSConfig>(DEFAULT_CONFIG);
  const [intervalPreviews, setIntervalPreviews] = useState<Record<Grade, string>>({
    0: '1 min', 1: '1 d', 2: '1 d', 3: '2 d',
  });

  // Modal States
  const [leechModal, setLeechModal] = useState<{
    show: boolean;
    card: Card | null;
    loading: boolean;
    suggestion: string;
    atomicCards: { front: string; back: string }[];
    applying: boolean;
  }>({ show: false, card: null, loading: false, suggestion: '', atomicCards: [], applying: false });

  const [struggleModal, setStruggleModal] = useState<{
    show: boolean;
    card: Card | null;
    loading: boolean;
    analysis: string;
    memoryTip: string;
    simplifiedCards: { front: string; back: string; type: 'simplified' | 'example' | 'context' }[];
    applying: boolean;
  }>({ show: false, card: null, loading: false, analysis: '', memoryTip: '', simplifiedCards: [], applying: false });

  const isTransitioning = useRef(false);

  // Initial Data Load
  useEffect(() => {
    if (!userId) return;

    const loadData = async () => {
      try {
        setLoading(true);

        // Load settings + weights first; review queue is fetched via API with a safe fallback.
        const [settings, userWeights] = await Promise.all([
          studyService.getUserSettings(userId),
          studyService.getUserWeights(userId),
        ]);

        // Build FSRSConfig once, before any interval calculations
        const config: FSRSConfig = {
          desiredRetention: settings?.desired_retention ?? DEFAULT_CONFIG.desiredRetention,
          weights: userWeights?.is_custom
            ? weightsFromAny(userWeights.weights)
            : DEFAULT_CONFIG.weights,
        };
        setFsrsConfig(config);

        let reviewData: { deck: Deck | null; cards: Card[] };

        try {
          const queueResponse = await studyService.getReviewQueue(deckId);
          reviewData = {
            deck: queueResponse.deck,
            cards: queueResponse.cards,
          };
        } catch (queueError) {
          console.warn('Review queue API unavailable, falling back to local ordering:', queueError);

          const [fallbackDeck, fallbackCards] = await Promise.all([
            studyService.getDeck(deckId, userId),
            studyService.getDueCards(deckId),
          ]);

          reviewData = {
            deck: fallbackDeck,
            cards: sortByPriority(fallbackCards.filter(c => isDue(c.next_review_at, Date.now()))),
          };
        }

        // Load Deck
        if (!reviewData.deck) {
          router.push('/dashboard');
          return;
        }
        setDeck(reviewData.deck);

        // Load Cards
        const cardsData = reviewData.cards;
        if (!cardsData || cardsData.length === 0) {
          router.push(`/deck/${deckId}`);
          return;
        }
        setCards(cardsData);

        setDueCards(cardsData);

      } catch (err) {
        console.error('Error loading study session:', err);
        Sentry.captureException(err, { tags: { hook: 'useStudySession', action: 'loadData', deckId } });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [deckId, userId, router]);

  // Interval Previews Update
  useEffect(() => {
    if (dueCards.length > 0 && currentIndex < dueCards.length) {
      const currentCard = dueCards[currentIndex];
      const previews = getIntervalPreviews({
        difficulty: currentCard.difficulty,
        stability: currentCard.stability,
        ease_factor: currentCard.ease_factor,
        lapses: currentCard.lapses,
        relearning_step: currentCard.relearning_step,
        step: currentCard.step,
      }, fsrsConfig);
      setIntervalPreviews(previews);
    }
  }, [currentIndex, dueCards, fsrsConfig]);

  // Relearning Timer
  useEffect(() => {
    if (!waitingForRelearning.waiting) return;
    
    const timer = setInterval(() => {
      const now = Date.now();
      const nextReviewAt = waitingForRelearning.nextReviewAt;
      
      if (!nextReviewAt) {
        clearInterval(timer);
        return;
      }
      
      const remaining = Math.ceil((nextReviewAt - now) / 1000);
      
      if (remaining <= 0) {
        // Resume session
        const readyCards = relearningQueue.filter(c => c.next_review_at && c.next_review_at <= now);
        if (readyCards.length > 0) {
          setDueCards(readyCards);
          setRelearningQueue(prev => prev.filter(c => !readyCards.includes(c)));
          setCurrentIndex(0);
          setWaitingForRelearning({ waiting: false, nextReviewAt: null, remainingSeconds: 0 });
        }
        clearInterval(timer);
      } else {
        setWaitingForRelearning(prev => ({ ...prev, remainingSeconds: remaining }));
      }
    }, 1000);
    
    return () => clearInterval(timer);
  }, [waitingForRelearning.waiting, waitingForRelearning.nextReviewAt, relearningQueue]);

  // Core Review Logic
  const handleGrade = useCallback(async (grade: Grade) => {
    if (isTransitioning.current) return;
    isTransitioning.current = true;
    
    const currentCard = dueCards[currentIndex];
    if (!currentCard) {
      isTransitioning.current = false;
      return;
    }
    
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
    
    // Optimistic Updates
    if (grade === 0) {
      setResults(prev => ({ ...prev, wrong: prev.wrong + 1 }));
      const updatedCard = { ...currentCard, ...result.newState };
      setRelearningQueue(prev => [...prev, updatedCard]);
    } else {
      setResults(prev => ({ ...prev, correct: prev.correct + 1 }));
    }
    
    // Async DB Updates
    try {
      await studyService.updateCard({ ...currentCard, ...result.newState }, now);
      await studyService.logReview({
        card_id: currentCard.id,
        user_id: userId!,
        grade,
        difficulty_before: currentCard.difficulty,
        stability_before: currentCard.stability,
        interval_days: result.intervalDays,
        reviewed_at: now,
      });
    } catch (err) {
      console.error('Failed to log review:', err);
      Sentry.captureException(err, { tags: { hook: 'useStudySession', action: 'logReview' } });
    }
    
    // AI Interventions (Pro only)
    if (isPro && result.becameStruggle) {
       handleStruggle(currentCard, result.newState.lapses);
       isTransitioning.current = false;
       return;
    }
    
    if (isPro && result.becameLeech) {
      handleLeech(currentCard);
      isTransitioning.current = false;
      return;
    }

    // Advance
    setTimeout(() => {
      advanceToNextCard();
    }, 300);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, dueCards, fsrsConfig, userId]);

  const advanceToNextCard = useCallback(() => {
    const now = Date.now();
    const readyRelearning = relearningQueue.filter(c => c.next_review_at && c.next_review_at <= now);
    
    if (readyRelearning.length > 0) {
      const remainingDue = dueCards.slice(currentIndex + 1);
      setDueCards([...readyRelearning, ...remainingDue]);
      setRelearningQueue(prev => prev.filter(c => !readyRelearning.includes(c)));
      setCurrentIndex(0);
    } else if (currentIndex >= dueCards.length - 1) {
       checkPendingRelearning(now);
    } else {
      setCurrentIndex(prev => prev + 1);
    }
    
    setIsFlipped(false);
    isTransitioning.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, dueCards, relearningQueue]);

  const checkPendingRelearning = (now: number) => {
    if (relearningQueue.length > 0) {
      const nextRelearning = Math.min(...relearningQueue.map(c => c.next_review_at ?? Infinity));
      const waitTime = nextRelearning - now;
      
      if (waitTime > 0 && waitTime < 10 * 60 * 1000) {
        setWaitingForRelearning({
          waiting: true,
          nextReviewAt: nextRelearning,
          remainingSeconds: Math.ceil(waitTime / 1000),
        });
      } else {
        setIsComplete(true);
      }
    } else {
      setIsComplete(true);
    }
  };

  // AI Handlers
  const handleStruggle = async (card: Card, lapses: number) => {
    setStruggleModal({ show: true, card, loading: true, analysis: '', memoryTip: '', simplifiedCards: [], applying: false });
    const res = await analyzeStruggleCard({ id: card.id, deck_id: card.deck_id, front: card.front, back: card.back, lapses });
    setStruggleModal(prev => ({ ...prev, loading: false, ...res }));
  };

  const applyStruggle = async () => {
    const { card, simplifiedCards } = struggleModal;
    if (!card || simplifiedCards.length === 0) return;

    setStruggleModal(prev => ({ ...prev, applying: true }));
    const result = await applyStruggleSuggestions(
      {
        id: card.id,
        deck_id: card.deck_id,
        front: card.front,
        back: card.back,
        lapses: card.lapses,
      },
      simplifiedCards
    );

    if (result.success) {
      setStruggleModal({ show: false, card: null, loading: false, analysis: '', memoryTip: '', simplifiedCards: [], applying: false });
      advanceToNextCard();
    } else {
      setStruggleModal(prev => ({ ...prev, applying: false }));
    }
  };

  const handleLeech = async (card: Card) => {
    setLeechModal({ show: true, card, loading: true, suggestion: '', atomicCards: [], applying: false });
    const res = await atomizeLeechCard({ id: card.id, deck_id: card.deck_id, front: card.front, back: card.back });
    setLeechModal(prev => ({ ...prev, loading: false, ...res }));
  };

  const applyLeech = async () => {
    const { card, atomicCards } = leechModal;
    if (!card || atomicCards.length === 0) return;

    setLeechModal(prev => ({ ...prev, applying: true }));
    const result = await applyAtomization(
      {
        id: card.id,
        deck_id: card.deck_id,
        front: card.front,
        back: card.back,
      },
      atomicCards
    );

    if (result.success) {
      setDueCards(prev => prev.filter(c => c.id !== card.id));
      setLeechModal({ show: false, card: null, loading: false, suggestion: '', atomicCards: [], applying: false });
      advanceToNextCard();
    } else {
      setLeechModal(prev => ({ ...prev, applying: false }));
    }
  };

  return {
    loading,
    deck,
    currentCard: dueCards[currentIndex],
    totalDue: dueCards.length,
    currentIndex,
    isFlipped,
    setIsFlipped,
    results,
    isComplete,
    handlers: { handleGrade, handleStruggle, applyStruggle, handleLeech, applyLeech },
    waitingForRelearning,
    relearningQueue,
    intervalPreviews,
    modals: { leechModal, setLeechModal, struggleModal, setStruggleModal },
    isTransitioning,
  };
}

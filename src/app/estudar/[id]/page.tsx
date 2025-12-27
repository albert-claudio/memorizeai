'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { generateReinforcementCards } from '@/app/actions/generateReinforcementCards';
import type { Card, Deck } from '@/lib/types';

// ============================================================================
// ICONS
// ============================================================================
const Icons = {
  X: () => (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  Check: () => (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
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
};

export default function EstudarPage() {
  const router = useRouter();
  const params = useParams();
  const deckId = params.id as string;
  
  const [loading, setLoading] = useState(true);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [results, setResults] = useState<{ correct: number; wrong: number }>({ correct: 0, wrong: 0 });
  const [wrongCards, setWrongCards] = useState<Card[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  
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

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/login');
        return;
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

      // Shuffle cards
      const shuffled = [...cardsData].sort(() => Math.random() - 0.5);
      setCards(shuffled);
      setLoading(false);
    };

    loadData();
  }, [deckId, router]);

  const handleSwipe = (direction: 'left' | 'right') => {
    setSwipeDirection(direction);
    const currentCard = cards[currentIndex];
    
    if (direction === 'right') {
      setResults(prev => ({ ...prev, correct: prev.correct + 1 }));
    } else {
      setResults(prev => ({ ...prev, wrong: prev.wrong + 1 }));
      // Rastreia o card errado
      setWrongCards(prev => [...prev, currentCard]);
    }

    // Animate out
    setTimeout(() => {
      if (currentIndex >= cards.length - 1) {
        setIsComplete(true);
      } else {
        setCurrentIndex(prev => prev + 1);
        setIsFlipped(false);
        setSwipeDirection(null);
        setDragOffset({ x: 0, y: 0 });
      }
    }, 300);
  };

  // Touch/Mouse handlers
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

  // Complete screen
  if (isComplete) {
    const percentage = Math.round((results.correct / cards.length) * 100);
    
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
              setCards([...cards].sort(() => Math.random() - 0.5));
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

  const currentCard = cards[currentIndex];

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-base)',
      overflow: 'hidden',
      touchAction: 'none',
    }}>
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
            {currentIndex + 1} / {cards.length}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {deck?.title}
          </div>
        </div>
        
        <div style={{ width: 44 }} />
      </header>

      {/* Progress Bar */}
      <div style={{
        height: 4,
        background: 'var(--bg-muted)',
        marginBottom: 24,
      }}>
        <div style={{
          height: '100%',
          width: `${((currentIndex) / cards.length) * 100}%`,
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
            maxHeight: 'calc(100dvh - 280px)',
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
                {currentCard.front}
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
                {currentCard.back}
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
                <span>← Errei</span>
                <span style={{ margin: '0 8px', opacity: 0.3 }}>|</span>
                <span>Acertei →</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{
        padding: '24px 20px 40px',
        display: 'flex',
        justifyContent: 'center',
        gap: 48,
        flexShrink: 0,
      }}>
        <button
          onClick={() => isFlipped && handleSwipe('left')}
          disabled={!isFlipped}
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: isFlipped ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-muted)',
            border: isFlipped ? '3px solid #EF4444' : '2px solid var(--border)',
            color: isFlipped ? '#EF4444' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: isFlipped ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s ease',
            opacity: isFlipped ? 1 : 0.4,
          }}
        >
          <Icons.X />
        </button>
        
        <button
          onClick={() => isFlipped && handleSwipe('right')}
          disabled={!isFlipped}
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: isFlipped ? 'rgba(34, 197, 94, 0.15)' : 'var(--bg-muted)',
            border: isFlipped ? '3px solid var(--success)' : '2px solid var(--border)',
            color: isFlipped ? 'var(--success)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: isFlipped ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s ease',
            opacity: isFlipped ? 1 : 0.4,
          }}
        >
          <Icons.Check />
        </button>
      </div>
    </div>
  );
}

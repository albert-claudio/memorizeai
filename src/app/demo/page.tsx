'use client';

import { useState } from 'react';
import Link from 'next/link';

// ============================================================================
// ICONS
// ============================================================================
const Icons = {
  Tap: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"/>
    </svg>
  ),
  Clock: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12,6 12,12 16,14"/>
    </svg>
  ),
  ArrowLeft: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12,19 5,12 12,5"/>
    </svg>
  ),
  Rocket: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
      <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
    </svg>
  ),
};

// ============================================================================
// SAMPLE FLASHCARDS
// ============================================================================
const sampleCards = [
  { 
    category: 'OAB • Civil',
    question: 'Qual é o prazo prescricional para ações de reparação civil?', 
    answer: '3 anos', 
    reference: 'Art. 206, §3º, V do Código Civil' 
  },
  { 
    category: 'OAB • Constitucional',
    question: 'Qual a idade mínima para ser eleito Presidente da República?', 
    answer: '35 anos', 
    reference: 'CF, Art. 14, §3º, VI, a' 
  },
  { 
    category: 'OAB • Administrativo',
    question: 'Qual o prazo decadencial para a Administração anular atos ilegais?', 
    answer: '5 anos', 
    reference: 'Lei 9.784/99, Art. 54' 
  },
  { 
    category: 'OAB • Civil',
    question: 'O que é a teoria da imprevisão no Direito Civil?', 
    answer: 'Permite revisão contratual por fato superveniente', 
    reference: 'CC, Art. 478' 
  },
  { 
    category: 'OAB • Penal',
    question: 'Qual é a pena máxima de reclusão permitida no Brasil?', 
    answer: '40 anos', 
    reference: 'CP, Art. 75' 
  },
  { 
    category: 'OAB • Trabalhista',
    question: 'Qual o prazo prescricional para ações trabalhistas após o término do contrato?', 
    answer: '2 anos', 
    reference: 'CF, Art. 7º, XXIX' 
  },
];

// ============================================================================
// DEMO PAGE
// ============================================================================
export default function DemoPage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [nextReview, setNextReview] = useState('');
  const [showingResult, setShowingResult] = useState(false);
  
  const currentCard = sampleCards[currentIndex];
  
  const handleRating = (rating: string) => {
    const reviews: Record<string, string> = {
      'Errei': '10 minutos',
      'Difícil': '1 dia',
      'Bom': '4 dias',
      'Fácil': '10 dias',
    };
    setNextReview(reviews[rating]);
    setShowingResult(true);
    
    setTimeout(() => {
      setFlipped(false);
      setNextReview('');
      setShowingResult(false);
      if (currentIndex < sampleCards.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        setCurrentIndex(0);
      }
    }, 2000);
  };
  
  const handleFlip = () => {
    if (!showingResult) {
      setFlipped(!flipped);
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'var(--bg-base)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <header style={{ 
        padding: '12px 16px', 
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <Link href="/" style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 6,
          color: 'var(--text-secondary)',
          textDecoration: 'none',
          fontSize: 14,
          flexShrink: 0,
        }}>
          <Icons.ArrowLeft />
          <span className="hide-mobile">Voltar</span>
        </Link>
        
        <span style={{ 
          fontSize: 18, 
          fontWeight: 800, 
          letterSpacing: '-0.02em',
          background: 'linear-gradient(135deg, #6366F1 0%, #A855F7 50%, #EC4899 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>Vimens</span>
        
        <Link href="/cadastro" className="btn-primary" style={{ 
          padding: '8px 12px', 
          fontSize: 13,
          flexShrink: 0,
          width: 'auto',
        }}>
          Entrar
        </Link>
      </header>
      
      {/* Main Content */}
      <main style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <span className="badge badge-accent" style={{ marginBottom: 16 }}>
            Demonstração Interativa
          </span>
          <h1 style={{ 
            fontSize: 'clamp(24px, 4vw, 32px)', 
            fontWeight: 700,
            marginBottom: 8,
          }}>
            Experimente o <span className="text-gradient">Vimens</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            Card {currentIndex + 1} de {sampleCards.length} • Clique no card para virar
          </p>
        </div>
        
        {/* Flashcard */}
        <div style={{ width: '100%', maxWidth: 420, marginBottom: 32 }}>
          <div 
            className={`flip-card ${flipped ? 'flipped' : ''}`}
            onClick={handleFlip}
            style={{ 
              aspectRatio: '3/4', 
              cursor: showingResult ? 'default' : 'pointer',
            }}
          >
            <div className="flip-card-inner">
              {/* Front */}
              <div className="flip-card-front card-glow" style={{ 
                padding: 32, 
                display: 'flex', 
                flexDirection: 'column' 
              }}>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  marginBottom: 24 
                }}>
                  <span className="badge badge-accent">{currentCard.category}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    {currentIndex + 1}/{sampleCards.length}
                  </span>
                </div>
                
                <div style={{ 
                  flex: 1, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center' 
                }}>
                  <p style={{ 
                    fontSize: 'clamp(18px, 4vw, 22px)', 
                    fontWeight: 600, 
                    textAlign: 'center', 
                    lineHeight: 1.4 
                  }}>
                    {currentCard.question}
                  </p>
                </div>
                
                <div style={{ 
                  textAlign: 'center', 
                  color: 'var(--text-muted)', 
                  fontSize: 13, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: 8 
                }}>
                  <Icons.Tap />
                  Toque para ver resposta
                </div>
              </div>
              
              {/* Back */}
              <div className="flip-card-back card" style={{ 
                padding: 32, 
                display: 'flex', 
                flexDirection: 'column', 
                background: 'var(--bg-overlay)' 
              }}>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  marginBottom: 24 
                }}>
                  <span className="badge badge-accent">Resposta</span>
                </div>
                
                <div style={{ 
                  flex: 1, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  flexDirection: 'column', 
                  gap: 12 
                }}>
                  <p className="text-gradient" style={{ 
                    fontSize: 'clamp(28px, 6vw, 36px)', 
                    fontWeight: 800,
                    textAlign: 'center',
                  }}>
                    {currentCard.answer}
                  </p>
                  <p style={{ 
                    fontSize: 14, 
                    color: 'var(--text-secondary)', 
                    textAlign: 'center' 
                  }}>
                    {currentCard.reference}
                  </p>
                </div>
                
                {showingResult ? (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: 16, 
                    background: 'var(--accent-muted)', 
                    borderRadius: 12 
                  }}>
                    <p style={{ 
                      fontSize: 14, 
                      color: 'var(--accent-hover)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    }}>
                      <Icons.Clock /> 
                      Próxima revisão: <strong>{nextReview}</strong>
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button 
                      className="action-btn error" 
                      onClick={(e) => { e.stopPropagation(); handleRating('Errei'); }}
                    >
                      Errei
                    </button>
                    <button 
                      className="action-btn warning" 
                      onClick={(e) => { e.stopPropagation(); handleRating('Difícil'); }}
                    >
                      Difícil
                    </button>
                    <button 
                      className="action-btn success" 
                      onClick={(e) => { e.stopPropagation(); handleRating('Bom'); }}
                    >
                      Bom
                    </button>
                    <button 
                      className="action-btn success" 
                      onClick={(e) => { e.stopPropagation(); handleRating('Fácil'); }}
                    >
                      Fácil
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Explanation */}
        <div style={{ 
          maxWidth: 500, 
          textAlign: 'center',
          padding: 24,
          background: 'var(--bg-raised)',
          borderRadius: 16,
          border: '1px solid var(--border)',
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            Como funciona a revisão adaptativa?
          </h3>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>
            O intervalo da próxima revisão muda conforme sua resposta. Se errou, revisa logo.
            Se foi fácil, espera mais dias. O algoritmo <strong style={{ color: 'var(--accent)' }}>FSRS V5</strong> aprende 
            com seu histórico para otimizar a memorização.
          </p>
          <Link href="/cadastro" className="btn-primary" style={{ width: '100%' }}>
            <Icons.Rocket />
            Começar grátis e importar meu PDF
          </Link>
        </div>
      </main>
    </div>
  );
}

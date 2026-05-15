'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { track } from '@/lib/analytics/tracker';

// ============================================================================
// ICONS
// ============================================================================
const Icons = {
  Brain: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.54"/>
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.54"/>
    </svg>
  ),
  Sparkles: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    </svg>
  ),
  Upload: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17,8 12,3 7,8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  ),
  Chart: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  ),
  Target: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="12" r="6"/>
      <circle cx="12" cy="12" r="2"/>
    </svg>
  ),
  Check: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20,6 9,17 4,12"/>
    </svg>
  ),
  X: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  Shield: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  Rocket: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
      <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
    </svg>
  ),
  Crown: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/>
    </svg>
  ),
  ArrowRight: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/>
      <polyline points="12,5 19,12 12,19"/>
    </svg>
  ),
  Tap: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"/>
    </svg>
  ),
  Edit: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
  Calendar: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
  Folder: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  Play: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5,3 19,12 5,21"/>
    </svg>
  ),
  Clock: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12,6 12,12 16,14"/>
    </svg>
  ),
};

// ============================================================================
// NAVBAR
// ============================================================================
function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
      <div className="container navbar-inner">
        <a href="#" className="navbar-logo">
          <span style={{ 
            fontSize: 24, 
            fontWeight: 800, 
            letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg, #6366F1 0%, #A855F7 50%, #EC4899 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>Vimens</span>
        </a>
        
        <Link href="/cadastro" className="btn-primary navbar-cta">
          Entrar
        </Link>
      </div>
    </nav>
  );
}

// ============================================================================
// HERO
// ============================================================================
function Hero() {
  const [flipped, setFlipped] = useState(false);
  const exams = ['OAB', 'ENEM', 'Bancos', 'Receita', 'INSS', 'PF', 'TJ', 'TRF'];

  useEffect(() => { track('landing_view'); }, []);

  return (
    <section style={{ paddingTop: 120, paddingBottom: 80, position: 'relative', overflow: 'hidden' }}>
      <div className="bg-gradient-hero" />
      
      <div className="container">
        <div className="hero-grid">
          {/* Content */}
          <div className="hero-content">
            <div className="animate-fade-up" style={{ animationDelay: '0s' }}>
              <span className="badge badge-accent" style={{ marginBottom: 24 }}>
                Pare de estudar no escuro
              </span>
            </div>
            
            <h1 className="animate-fade-up" style={{ 
              fontSize: 'clamp(28px, 5.5vw, 52px)', 
              fontWeight: 700, 
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
              marginBottom: 16,
              animationDelay: '0.1s'
            }}>
              Ler não aprova. <span className="text-gradient">Acertar questões, sim.</span>
            </h1>
            
            <p className="animate-fade-up" style={{ 
              fontSize: 'clamp(16px, 2.2vw, 22px)', 
              color: 'var(--text-secondary)', 
              marginBottom: 32,
              lineHeight: 1.5,
              animationDelay: '0.15s'
            }}>
              Chega de leitura passiva. Envie seu material e transforme resumos em simulados da sua banca. Descubra o que você não sabe antes da prova.
            </p>
            
            <div className="animate-fade-up" style={{ 
              display: 'flex', 
              flexDirection: 'column',
              gap: 10,
              marginBottom: 28,
              animationDelay: '0.3s'
            }}>
              <Link href="/cadastro" className="btn-primary" onClick={() => track('signup_click', { source: 'hero_cta' })}>
                <Icons.Rocket />
                Criar conta grátis e testar meu material
              </Link>
              <Link href="/demo" className="btn-secondary">
                <Icons.Play />
                Ver Demonstração
              </Link>
            </div>
            
            <div className="animate-fade-up" style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 6,
              justifyContent: 'center',
              flexWrap: 'wrap',
              animationDelay: '0.4s'
            }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 2 }}>Feito para</span>
              {exams.map((e, i) => (
                <span key={i} style={{ 
                  fontSize: 11, 
                  color: 'var(--text-secondary)',
                  padding: '3px 7px',
                  background: 'var(--bg-muted)',
                  borderRadius: 4,
                }}>
                  {e}
                </span>
              ))}
            </div>
          </div>
          
          {/* Card */}
          <div className="hero-card animate-fade-up animate-float" style={{ animationDelay: '0.5s' }}>
            <div 
              className={`flip-card ${flipped ? 'flipped' : ''}`}
              onClick={() => setFlipped(!flipped)}
              style={{ aspectRatio: '3/4' }}
            >
              <div className="flip-card-inner">
                {/* Front */}
                <div className="flip-card-front card-glow" style={{ padding: 24, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                    <span className="badge badge-accent">OAB • Civil</span>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>12/50</span>
                  </div>
                  
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <p style={{ fontSize: 'clamp(18px, 4vw, 22px)', fontWeight: 600, textAlign: 'center', lineHeight: 1.4 }}>
                      Qual é o prazo prescricional para ações de reparação civil?
                    </p>
                  </div>
                  
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Icons.Tap />
                    Toque para ver resposta
                  </div>
                </div>
                
                {/* Back */}
                <div className="flip-card-back card" style={{ padding: 24, display: 'flex', flexDirection: 'column', background: 'var(--bg-overlay)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                    <span className="badge badge-accent">Resposta</span>
                    <span style={{ fontSize: 13, color: 'var(--success)' }}>✓ Correta</span>
                  </div>
                  
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
                    <p className="text-gradient" style={{ fontSize: 'clamp(32px, 6vw, 40px)', fontWeight: 800 }}>3 anos</p>
                    <p style={{ fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center' }}>
                      Art. 206, §3º, V do Código Civil
                    </p>
                  </div>
                  
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="action-btn error">Errei</button>
                    <button className="action-btn warning">Difícil</button>
                    <button className="action-btn success">Fácil</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// HOW IT WORKS
// ============================================================================
function HowItWorks() {
  const steps = [
    { num: '01', title: 'Envie seu material', desc: 'PDF, texto ou anotações. Qualquer conteúdo que você queira memorizar.' },
    { num: '02', title: 'Insira o material que você já estuda', desc: 'A IA transforma seu conteúdo em questões, explicações e fontes rastreáveis.' },
    { num: '03', title: 'Revise todo dia', desc: 'O sistema agenda as próximas revisões com base nos seus acertos e erros.' },
  ];

  return (
    <section className="section" style={{ background: 'var(--bg-raised)' }} id="how">
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <span className="badge badge-accent" style={{ marginBottom: 16 }}>Como Funciona</span>
          <h2 className="section-title">3 passos para <span className="text-gradient">memorizar de verdade</span></h2>
        </div>
        
        <div className="grid-steps-3">
          {steps.map((s, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div className="step-num animate-pulse-glow">{s.num}</div>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 10, lineHeight: 1.3 }}>{s.title}</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{s.desc}</p>
            </div>
          ))}
        </div>
        
        <p style={{ textAlign: 'center', marginTop: 40, color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5 }}>
          Revisão adaptativa com <strong style={{ color: 'var(--accent)' }}>FSRS V5</strong>. O sistema aprende com seu desempenho.
        </p>
      </div>
    </section>
  );
}

// ============================================================================
// DEMO PREVIEW (VEJA NA PRÁTICA)
// ============================================================================
function DemoPreview() {
  const [currentCard, setCurrentCard] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [nextReview, setNextReview] = useState('');
  
  const cards = [
    { q: 'Qual o prazo decadencial para anular ato administrativo?', a: '5 anos', ref: 'Lei 9.784/99, Art. 54' },
    { q: 'O que é a teoria da imprevisão?', a: 'Revisão contratual por fato superveniente', ref: 'CC, Art. 478' },
    { q: 'Qual a idade mínima para ser Presidente?', a: '35 anos', ref: 'CF, Art. 14, §3º, VI, a' },
  ];
  
  const handleRating = (rating: string) => {
    const reviews: Record<string, string> = {
      'Errei': '10 minutos',
      'Difícil': '1 dia',
      'Bom': '4 dias',
      'Fácil': '10 dias',
    };
    setNextReview(reviews[rating]);
    setTimeout(() => {
      setFlipped(false);
      setNextReview('');
      setCurrentCard((c) => (c + 1) % cards.length);
    }, 1500);
  };
  
  return (
    <section className="section" id="demo-preview">
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <span className="badge badge-accent" style={{ marginBottom: 16 }}>
            <Icons.Play />
            Veja na Prática
          </span>
          <h2 className="section-title">Experimente <span className="text-gradient">sem criar conta</span></h2>
          <p className="section-subtitle" style={{ margin: '0 auto' }}>
            Clique no card, responda e veja como o sistema adapta suas revisões.
          </p>
        </div>
        
        <div style={{ maxWidth: 400, margin: '0 auto' }}>
          <div 
            className={`flip-card ${flipped ? 'flipped' : ''}`}
            onClick={() => !nextReview && setFlipped(!flipped)}
            style={{ aspectRatio: '4/3', cursor: nextReview ? 'default' : 'pointer' }}
          >
            <div className="flip-card-inner">
              {/* Front */}
              <div className="flip-card-front card-glow" style={{ padding: 32, display: 'flex', flexDirection: 'column' }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <p style={{ fontSize: 18, fontWeight: 500, textAlign: 'center', lineHeight: 1.5 }}>
                    {cards[currentCard].q}
                  </p>
                </div>
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  <Icons.Tap /> Toque para ver resposta
                </div>
              </div>
              
              {/* Back */}
              <div className="flip-card-back card" style={{ padding: 32, display: 'flex', flexDirection: 'column', background: 'var(--bg-overlay)' }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
                  <p className="text-gradient" style={{ fontSize: 28, fontWeight: 700 }}>{cards[currentCard].a}</p>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{cards[currentCard].ref}</p>
                </div>
                
                {nextReview ? (
                  <div style={{ textAlign: 'center', padding: 16, background: 'var(--accent-muted)', borderRadius: 12 }}>
                    <p style={{ fontSize: 14, color: 'var(--accent-hover)' }}>
                      <Icons.Clock /> Próxima revisão: <strong>{nextReview}</strong>
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="action-btn error" onClick={(e) => { e.stopPropagation(); handleRating('Errei'); }}>Errei</button>
                    <button className="action-btn warning" onClick={(e) => { e.stopPropagation(); handleRating('Difícil'); }}>Difícil</button>
                    <button className="action-btn success" onClick={(e) => { e.stopPropagation(); handleRating('Bom'); }}>Bom</button>
                    <button className="action-btn success" onClick={(e) => { e.stopPropagation(); handleRating('Fácil'); }}>Fácil</button>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div style={{ textAlign: 'center', marginTop: 32 }}>
            <Link href="/cadastro" className="btn-primary">
              <Icons.Upload />
              Começar grátis e importar meu material
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// EXAMS (PARA QUEM É)
// ============================================================================
function Exams() {
  const tracks = [
    { name: 'OAB', example: 'Prazo para recurso ordinário constitucional', routine: '30 min/dia', retention: '85%' },
    { name: 'ENEM', example: 'Período do Brasil Colônia até a República', routine: '40 min/dia', retention: '80%' },
    { name: 'Bancos', example: 'Taxa Selic e política monetária', routine: '25 min/dia', retention: '85%' },
    { name: 'Receita Federal', example: 'Tributos e competência tributária', routine: '35 min/dia', retention: '90%' },
    { name: 'INSS', example: 'Benefícios previdenciários', routine: '30 min/dia', retention: '85%' },
    { name: 'PF', example: 'Direito Penal e Processual Penal', routine: '35 min/dia', retention: '90%' },
    { name: 'TJ/TRF', example: 'Organização judiciária', routine: '40 min/dia', retention: '90%' },
  ];
  
  return (
    <section className="section" style={{ background: 'var(--bg-raised)' }} id="exams">
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <span className="badge badge-accent" style={{ marginBottom: 16 }}>Para Quem É</span>
          <h2 className="section-title">Trilhas para <span className="text-gradient">sua prova</span></h2>
          <p className="section-subtitle" style={{ margin: '0 auto' }}>
            Organize por matéria. O scheduler se adapta ao seu histórico.
          </p>
        </div>
        
        <div className="grid-exams">
          {tracks.map((t, i) => (
            <div key={i} className="card" style={{ padding: 24 }}>
              <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: 'var(--accent)' }}>{t.name}</h3>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
                Ex: {`"${t.example}"`}
              </p>
              <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-muted)' }}>
                <span>⏱ {t.routine}</span>
                <span>🎯 {t.retention}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// FEATURES
// ============================================================================
function Features() {
  const features = [
    { icon: <Icons.Upload />, title: 'Geração a partir do PDF', desc: 'Envie seu material e receba flashcards prontos para revisar.' },
    { icon: <Icons.Upload />, title: 'Seu conteúdo vira treino', desc: 'Nada de quiz solto: as questões nascem do material que você realmente está usando.' },
    { icon: <Icons.Shield />, title: 'Sem inventar quando a base é fraca', desc: 'Se o material não sustenta uma questão difícil, o Vimens limita ou recusa em vez de maquiar resposta.' },
    { icon: <Icons.Target />, title: 'Metas de retenção', desc: 'Defina quanto quer lembrar: 80%, 85%, 90%. O sistema ajusta.' },
    { icon: <Icons.Chart />, title: 'Estatísticas claras', desc: 'Veja sua evolução, identifique lacunas e acompanhe o progresso.' },
    { icon: <Icons.Folder />, title: 'Organização por trilhas', desc: 'Separe por matéria, concurso ou tema. Encontre tudo rápido.' },
  ];

  return (
    <section className="section" id="features">
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <span className="badge badge-accent" style={{ marginBottom: 16 }}>Recursos</span>
          <h2 className="section-title">Do seu material ao diagnóstico em <span className="text-gradient">poucos minutos</span></h2>
          <p className="section-subtitle" style={{ margin: '0 auto' }}>
            Nada de caixa preta. Você decide o que estudar e quando.
          </p>
        </div>
        
        <div className="grid-features">
          {features.map((f, i) => (
            <div key={i} className="card feature-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div className="icon-box">{f.icon}</div>
              </div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// PRICING
// ============================================================================
function Pricing() {
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [proOffer, setProOffer] = useState<{
    formattedPrice: string;
    periodLabel: string;
  } | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadOffer = async () => {
      try {
        const response = await fetch('/api/stripe/offer', { cache: 'no-store' });
        if (!response.ok || !mounted) return;
        const data = await response.json();
        setProOffer(data);
      } catch {
        // keep fallback values
      }
    };

    loadOffer();

    return () => {
      mounted = false;
    };
  }, []);

  const handlePremiumCheckout = async () => {
    setCheckoutLoading(true);
    track('checkout_click');
    try {
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planKey: 'pro_monthly' }),
      });

      const data = await response.json();

      if (data.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else if (response.status === 401) {
        // User not logged in, redirect to signup
        window.location.href = '/cadastro?plan=premium';
      } else {
        console.error('Erro ao criar checkout:', data.error);
        alert('Erro ao iniciar checkout. Tente novamente.');
        setCheckoutLoading(false);
      }
    } catch (error) {
      console.error('Erro:', error);
      alert('Erro ao conectar. Tente novamente.');
      setCheckoutLoading(false);
    }
  };

  const plans = [
    {
      name: 'Grátis',
      price: 'R$ 0',
      period: 'para sempre',
      features: [
        { text: 'Até 3 decks', ok: true },
        { text: 'Até 50 cards por deck', ok: true },
        { text: '3 uploads por semana (PDF, DOCX, PPTX)', ok: true },
        { text: 'Flashcards limitados', ok: true },
        { text: 'Revisão básica para estudar seus cards', ok: true },
        { text: 'Sem simulados por banca (FGV, FCC, CESPE)', ok: false },
      ],
      featured: false
    },
    {
      name: 'Premium',
      price: proOffer?.formattedPrice || 'R$ 29',
      period: proOffer?.periodLabel || '/mês',
      features: [
        { text: 'Decks ilimitados', ok: true },
        { text: 'Até 10.000 cards por deck', ok: true },
        { text: 'Uploads ilimitados de PDF, DOCX e PPTX', ok: true },
        { text: 'Geração de cards em grande volume', ok: true },
        { text: 'Simulados por banca (FGV, FCC, CESPE)', ok: true },
        { text: 'FSRS avançado + calibração de retenção', ok: true },
      ],
      featured: true
    },
  ];

  return (
    <section className="section" style={{ background: 'var(--bg-raised)' }} id="pricing">
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <span className="badge badge-accent" style={{ marginBottom: 16 }}>
            <Icons.Crown />
            Planos
          </span>
          <h2 className="section-title">Simples e <span className="text-gradient">sem pegadinha</span></h2>
        </div>
        
        <div className="grid-pricing">
          {plans.map((p, i) => (
            <div key={i} className={`${p.featured ? 'card-glow' : 'card'} pricing-card ${p.featured ? 'featured' : ''}`}>
              <div style={{ textAlign: 'center', paddingBottom: 24, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
                <h3 style={{ fontSize: 20, marginBottom: 4 }}>{p.name}</h3>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>
                  {p.featured ? 'Para quem leva a sério' : 'Para começar'}
                </p>
                <p>
                  <span className={`${p.featured ? 'text-gradient' : ''}`} style={{ fontSize: 40, fontWeight: 800 }}>{p.price}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>{p.period}</span>
                </p>
              </div>
              
              <ul style={{ listStyle: 'none', marginBottom: 24, flex: 1 }}>
                {p.features.map((f, j) => (
                  <li key={j} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <span className={f.ok ? 'check-icon' : 'x-icon'}>
                      {f.ok ? <Icons.Check /> : <Icons.X />}
                    </span>
                    <span style={{ color: f.ok ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: 14 }}>{f.text}</span>
                  </li>
                ))}
              </ul>
              
              {p.featured ? (
                <button 
                  onClick={handlePremiumCheckout}
                  disabled={checkoutLoading}
                  className="btn-primary" 
                  style={{ 
                    width: '100%', 
                    textAlign: 'center',
                    opacity: checkoutLoading ? 0.7 : 1,
                    cursor: checkoutLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {checkoutLoading ? 'Carregando...' : 'Comece agora!'}
                  {!checkoutLoading && <Icons.ArrowRight />}
                </button>
              ) : (
                <Link href="/cadastro" className="btn-secondary" style={{ width: '100%', textAlign: 'center' }}>
                  Começar Grátis
                  <Icons.ArrowRight />
                </Link>
              )}
            </div>
          ))}
        </div>
        
        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <div className="glass" style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '12px 24px', borderRadius: 100 }}>
            <Icons.Shield />
            <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              Cancele quando quiser.
            </span>
          </div>
          <p style={{ marginTop: 16, fontSize: 13, color: 'var(--text-muted)' }}>
            Treinar revela o erro. Seu material vira simulado, correção e diagnóstico para mostrar o que ainda derruba sua nota.
          </p>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// CTA
// ============================================================================
function CTA() {
  return (
    <section className="section">
      <div className="container" style={{ textAlign: 'center', maxWidth: 600 }}>
        <h2 className="section-title" style={{ marginBottom: 16 }}>
          Pronto para <span className="text-gradient">começar</span>?
        </h2>
        
        <p style={{ color: 'var(--text-secondary)', marginBottom: 32, fontSize: 16 }}>
          Crie uma conta grátis, envie seu material e veja o Vimens apontar o caminho entre o estudo passivo e a aprovação.
        </p>
        
        <Link href="/cadastro" className="btn-primary" style={{ marginBottom: 24 }}>
          <Icons.Rocket />
          Criar minha conta grátis
        </Link>
        
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>✓ Cancele quando quiser</p>
      </div>
    </section>
  );
}

// ============================================================================
// FOOTER
// ============================================================================
function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <Link href="/" className="navbar-logo" style={{ fontSize: 18 }}>
          <span style={{ 
            fontSize: 22, 
            fontWeight: 800, 
            letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg, #6366F1 0%, #A855F7 50%, #EC4899 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>Vimens</span>
        </Link>
        
        <div className="footer-links">
          <Link href="/termos">Termos</Link>
          <Link href="/privacidade">Privacidade</Link>
          <a href="mailto:suporte@vimens.app">Suporte</a>
        </div>
        
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          © 2026 Vimens
        </p>
      </div>
    </footer>
  );
}

// ============================================================================
// PAGE
// ============================================================================
export default function Home() {
  return (
    <main style={{ minHeight: '100vh' }}>
      <Navbar />
      <Hero />
      <HowItWorks />
      <DemoPreview />
      <Features />
      <Exams />
      <Pricing />
      <CTA />
      <Footer />
    </main>
  );
}

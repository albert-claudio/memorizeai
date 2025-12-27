'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

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
  Zap: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13,2 3,14 12,14 11,22 21,10 12,10"/>
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
  Star: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
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
          <div style={{ 
            width: 36, 
            height: 36, 
            borderRadius: 10, 
            background: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Icons.Brain />
          </div>
          <span>Memorize<span className="text-gradient">AI</span></span>
        </a>
        
        <Link href="/login" className="btn-primary navbar-cta">
          Começar Grátis
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

  return (
    <section style={{ paddingTop: 120, paddingBottom: 80, position: 'relative', overflow: 'hidden' }}>
      <div className="bg-gradient-hero" />
      
      <div className="container">
        <div className="hero-grid">
          {/* Content */}
          <div className="hero-content">
            <div className="animate-fade-up" style={{ animationDelay: '0s' }}>
              <span className="badge badge-urgent" style={{ marginBottom: 24 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F87171', animation: 'pulse 2s infinite' }} />
                VAGAS LIMITADAS
              </span>
            </div>
            
            <h1 className="animate-fade-up" style={{ 
              fontSize: 'clamp(32px, 6vw, 56px)', 
              fontWeight: 800, 
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              marginBottom: 20,
              animationDelay: '0.1s'
            }}>
              Aprovação em concursos é <span className="text-gradient">questão de método.</span>
            </h1>
            
            <p className="animate-fade-up" style={{ 
              fontSize: 'clamp(16px, 2vw, 20px)', 
              color: 'var(--text-secondary)', 
              marginBottom: 32,
              lineHeight: 1.6,
              animationDelay: '0.2s'
            }}>
              Flashcards inteligentes com IA. Envie seu PDF e receba cards prontos para estudar.
            </p>
            
            <div className="animate-fade-up" style={{ 
              display: 'flex', 
              flexDirection: 'column',
              gap: 12,
              marginBottom: 32,
              animationDelay: '0.3s'
            }}>
              <Link href="/login" className="btn-primary">
                <Icons.Rocket />
                Começar Grátis
              </Link>
              <Link href="/login" className="btn-secondary">
                Ver Demonstração
              </Link>
            </div>
            
            <div className="animate-fade-up" style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 12,
              justifyContent: 'center',
              animationDelay: '0.4s'
            }}>
              <div style={{ display: 'flex' }}>
                {['A', 'B', 'C', 'D'].map((l, i) => (
                  <div key={i} style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 600,
                    marginLeft: i > 0 ? -8 : 0,
                    border: '2px solid var(--bg-base)'
                  }}>
                    {l}
                  </div>
                ))}
              </div>
              <div className="stars">
                {[1,2,3,4,5].map(i => <Icons.Star key={i} />)}
              </div>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--text-primary)' }}>+2.847</strong> aprovam
              </span>
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
// EXAMS
// ============================================================================
function Exams() {
  const exams = ['OAB', 'ENEM', 'CAIXA', 'Banco do Brasil', 'Receita Federal', 'INSS', 'PF', 'TJ/TRF'];
  
  return (
    <section style={{ padding: '40px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--bg-raised)' }}>
      <div className="container">
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
          Preparação para os principais concursos
        </p>
        <div className="exam-track">
          {exams.map(e => <span key={e} className="exam-pill">{e}</span>)}
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
    { icon: <Icons.Upload />, title: 'PDF → Flashcards', desc: 'Envie qualquer material e nossa IA cria os cards automaticamente.', badge: 'IA' },
    { icon: <Icons.Brain />, title: 'Repetição Espaçada', desc: 'Algoritmo SM-2 agenda revisões no momento ideal.', badge: 'Científico' },
    { icon: <Icons.Target />, title: 'Plano de Ataque', desc: 'Errou? A IA identifica o tema e cria um plano personalizado.', badge: 'Exclusivo' },
    { icon: <Icons.Chart />, title: 'Analytics Completo', desc: 'Acompanhe evolução, identifique lacunas e veja médias.', badge: 'Dados' },
    { icon: <Icons.Sparkles />, title: 'Reformulação IA', desc: 'Cards reformulados de diferentes ângulos para fixação.', badge: 'Premium' },
    { icon: <Icons.Zap />, title: 'Evolução Diária', desc: 'Todo dia, veja se houve evolução real com insights.', badge: 'Premium' },
  ];

  return (
    <section className="section" id="features">
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <span className="badge badge-accent" style={{ marginBottom: 16 }}>Recursos</span>
          <h2 className="section-title">Tudo para <span className="text-gradient">dominar o conteúdo</span></h2>
          <p className="section-subtitle" style={{ margin: '0 auto' }}>
            Tecnologia de ponta para quem não aceita menos que a aprovação.
          </p>
        </div>
        
        <div className="grid-features">
          {features.map((f, i) => (
            <div key={i} className="card feature-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div className="icon-box">{f.icon}</div>
                <span className="badge badge-accent" style={{ fontSize: 10 }}>{f.badge}</span>
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
// HOW IT WORKS
// ============================================================================
function HowItWorks() {
  const steps = [
    { num: '01', title: 'Envie seu Material', desc: 'PDFs, apostilas, resumos.' },
    { num: '02', title: 'IA Processa', desc: 'Cards otimizados automaticamente.' },
    { num: '03', title: 'Estude Inteligente', desc: 'Revisão no momento ideal.' },
    { num: '04', title: 'Evolua Todo Dia', desc: 'Acompanhe seu progresso.' },
  ];

  return (
    <section className="section" style={{ background: 'var(--bg-raised)' }} id="how">
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <span className="badge badge-accent" style={{ marginBottom: 16 }}>Como Funciona</span>
          <h2 className="section-title">4 passos para a <span className="text-gradient">aprovação</span></h2>
        </div>
        
        <div className="grid-steps">
          {steps.map((s, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div className="step-num animate-pulse-glow">{s.num}</div>
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{s.title}</h3>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// STATS
// ============================================================================
function Stats() {
  const stats = [
    { value: '89%', label: 'Taxa de aprovação baseada em Ciência Cognitiva.' },
    { value: '2.5M+', label: 'Cards otimizados automaticamente.' },
    { value: '47min', label: 'Economizados/dia' },
    { value: '4.9★', label: 'Avaliação média' },
  ];

  return (
    <section className="section">
      <div className="container">
        <div className="card-glow" style={{ padding: 'clamp(32px, 5vw, 64px)', borderRadius: 24 }}>
          <div className="grid-stats">
            {stats.map((s, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <p className="text-gradient" style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 800, marginBottom: 8 }}>{s.value}</p>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// PRICING
// ============================================================================
function Pricing() {
  const plans = [
    {
      name: 'Grátis',
      price: 'R$ 0',
      period: 'para sempre',
      features: [
        { text: 'Até 3 decks', ok: true },
        { text: '50 cards/deck', ok: true },
        { text: 'Repetição espaçada', ok: true },
        { text: 'Analytics básico', ok: true },
        { text: 'Upload PDF', ok: false },
        { text: 'Geração IA', ok: false },
      ],
      featured: false
    },
    {
      name: 'Premium',
      price: 'R$ 29',
      period: '/mês',
      features: [
        { text: 'Decks ilimitados', ok: true },
        { text: 'Cards ilimitados', ok: true },
        { text: 'Repetição avançada', ok: true },
        { text: 'Analytics completo', ok: true },
        { text: 'Upload PDF', ok: true },
        { text: 'Geração IA', ok: true },
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
          <h2 className="section-title">Invista na sua <span className="text-gradient">aprovação</span></h2>
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
              
              <button className={p.featured ? 'btn-primary' : 'btn-secondary'} style={{ width: '100%' }}>
                {p.featured ? 'Assinar Premium' : 'Começar Grátis'}
                <Icons.ArrowRight />
              </button>
            </div>
          ))}
        </div>
        
        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <div className="glass" style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '12px 24px', borderRadius: 100 }}>
            <Icons.Shield />
            <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>7 dias de garantia incondicional</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// TESTIMONIALS
// ============================================================================
function Testimonials() {
  const items = [
    { name: 'Ana Carolina S.', role: 'Aprovada OAB', text: 'A sensação é de ter um professor particular 24h. A IA não só cria os cards, mas entende exatamente onde eu estou errando e reformula a pergunta.' },
    { name: 'Ricardo M.', role: 'Aprovado CAIXA', text: 'Joguei um PDF de 500 páginas de Direito Administrativo e em 2 minutos tinha os flashcards prontos. O que eu levaria uma semana resumindo, fiz em alguns minutos.' },
    { name: 'Juliana F.', role: 'ENEM 850+', text: 'O sistema de "lacunas de aprendizado" é assustadoramente preciso. Ele me mostrou que eu sabia tudo de Humanas, mas nada de Raciocínio Lógico. Mudou meu plano de estudo.' },
  ];

  return (
    <section className="section">
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <span className="badge badge-accent" style={{ marginBottom: 16 }}>Depoimentos</span>
          <h2 className="section-title">Quem usa, <span className="text-gradient">aprova</span></h2>
        </div>
        
        <div className="grid-testimonials">
          {items.map((t, i) => (
            <div key={i} className="card testimonial-card">
              <div className="stars">
                {[1,2,3,4,5].map(j => <Icons.Star key={j} />)}
              </div>
              <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6, flex: 1 }}>
                &ldquo;{t.text}&rdquo;
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                <div className="avatar">{t.name[0]}</div>
                <div>
                  <p style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</p>
                  <p style={{ fontSize: 13, color: 'var(--success)' }}>{t.role}</p>
                </div>
              </div>
            </div>
          ))}
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
    <section className="section" style={{ background: 'var(--bg-raised)' }}>
      <div className="container" style={{ textAlign: 'center', maxWidth: 600 }}>
        <span className="badge badge-urgent" style={{ marginBottom: 24 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F87171', animation: 'pulse 2s infinite' }} />
          Oferta por tempo limitado
        </span>
        
        <h2 className="section-title" style={{ marginBottom: 16 }}>
          Sua aprovação está a <span className="text-gradient">um clique</span>
        </h2>
        
        <p style={{ color: 'var(--text-secondary)', marginBottom: 32, fontSize: 16 }}>
          Junte-se à nova elite dos concursos. <span style={{ color: 'var(--warning)' }}>Não fique para trás.</span>
        </p>
        
        <Link href="/login" className="btn-primary" style={{ marginBottom: 24 }}>
          <Icons.Rocket />
          Quero Começar Agora
        </Link>
        
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          ✓ Sem cartão &nbsp; ✓ Cancele quando quiser &nbsp; ✓ 7 dias grátis
        </p>
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
        <a href="#" className="navbar-logo" style={{ fontSize: 18 }}>
          <div style={{ 
            width: 32, 
            height: 32, 
            borderRadius: 8, 
            background: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Icons.Brain />
          </div>
          <span>Memorize<span className="text-gradient">AI</span></span>
        </a>
        
        <div className="footer-links">
          <a href="#">Termos</a>
          <a href="#">Privacidade</a>
          <a href="#">Contato</a>
        </div>
        
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          © 2024 MemorizeAI
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
      <Exams />
      <Features />
      <HowItWorks />
      <Stats />
      <Pricing />
      <Testimonials />
      <CTA />
      <Footer />
    </main>
  );
}

'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import logoPurple from '@/app/assets/vimens-logo-purple.png';
import { track } from '@/lib/analytics/tracker';

type Plan = {
  name: string;
  subtitle: string;
  price: string;
  period: string;
  features: Array<{ text: string; ok: boolean }>;
  featured?: boolean;
};

const exams = ['OAB', 'ENEM', 'Bancos', 'Receita Federal', 'INSS', 'PF', 'TJ/TRF'];

const features = [
  {
    icon: 'down',
    title: 'Geração a partir do PDF',
    desc: 'Envie seu material e receba flashcards prontos para revisar.',
  },
  {
    icon: 'spark',
    title: 'Seu conteúdo vira treino',
    desc: 'Nada de quiz solto: as questões nascem do material que você realmente está usando.',
  },
  {
    icon: 'shield',
    title: 'Sem inventar quando a base é fraca',
    desc: 'Se o material não sustenta uma questão difícil, o Vimens limita ou recusa.',
  },
  {
    icon: 'target',
    title: 'Metas de retenção',
    desc: 'Defina quanto quer lembrar: 80%, 85%, 90%. O sistema ajusta.',
  },
  {
    icon: 'chart',
    title: 'Estatísticas claras',
    desc: 'Veja sua evolução, identifique lacunas e acompanhe o progresso.',
  },
  {
    icon: 'folder',
    title: 'Organização por trilhas',
    desc: 'Separe por matéria, concurso ou tema. Encontre tudo rápido.',
  },
];

const tracks = [
  { name: 'OAB', example: 'Prazo para recurso ordinário constitucional', time: '30 min/dia', retention: '85%' },
  { name: 'ENEM', example: 'Período do Brasil Colônia até a República', time: '40 min/dia', retention: '80%' },
  { name: 'Bancos', example: 'Taxa Selic e política monetária', time: '25 min/dia', retention: '85%' },
  { name: 'Receita Federal', example: 'Tributos e competência tributária', time: '35 min/dia', retention: '90%' },
  { name: 'INSS', example: 'Benefícios previdenciários', time: '30 min/dia', retention: '85%' },
  { name: 'PF', example: 'Direito Penal e Processual Penal', time: '35 min/dia', retention: '90%' },
  { name: 'TJ/TRF', example: 'Organização judiciária', time: '40 min/dia', retention: '90%' },
];

function Icon({ name }: { name: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  const paths: Record<string, ReactNode> = {
    rocket: (
      <>
        <path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1Z" />
        <path d="M12 15 9 12a22 22 0 0 1 2-4A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22 22 0 0 1-4 2Z" />
      </>
    ),
    play: <path d="m8 5 11 7-11 7V5Z" />,
    down: (
      <>
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </>
    ),
    spark: <path d="m12 3 2 6 6 3-6 3-2 6-2-6-6-3 6-3 2-6Z" />,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />,
    target: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1" />
      </>
    ),
    chart: (
      <>
        <path d="M5 19V9" />
        <path d="M12 19V5" />
        <path d="M19 19v-7" />
      </>
    ),
    folder: <path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
    check: <path d="m20 6-11 11-5-5" />,
    x: (
      <>
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14" />
        <path d="m13 5 7 7-7 7" />
      </>
    ),
  };

  return <svg {...common}>{paths[name]}</svg>;
}

function Logo({ small = false }: { small?: boolean }) {
  return (
    <Image
      src={logoPurple}
      alt="Vimens"
      className={small ? 'lp-logo lp-logo-small' : 'lp-logo'}
      priority
    />
  );
}

function HeroMock() {
  return (
    <div className="lp-hero-device" aria-hidden="true">
      <div className="lp-device-panel">
        <div className="lp-device-topbar">
          <span>Simulado OAB</span>
          <b>68%</b>
        </div>
        <div className="lp-device-question">
          <p className="lp-card-kicker">Direito Constitucional</p>
          <h3>O art. 5º da Constituição Federal garante o direito de resposta proporcional ao agravo?</h3>
        </div>
        <div className="lp-device-options">
          <div className="lp-device-option lp-device-option-correct">
            <Icon name="check" />
            <span>Certo</span>
          </div>
          <div className="lp-device-option lp-device-option-muted">
            <span className="lp-radio" />
            <span>Errado</span>
          </div>
        </div>
        <div className="lp-device-insight">
          <div>
            <span>Lacuna detectada</span>
            <strong>40% de erro em direitos fundamentais</strong>
          </div>
          <small>Revisar hoje</small>
        </div>
      </div>
    </div>
  );
}

function ErrorCard() {
  return (
    <div className="lp-error-card">
      <div>
        <p className="lp-card-kicker">Direito Administrativo - CESPE</p>
        <h3>No regime de parceria público-privada, o parceiro privado assume o risco financeiro integral do empreendimento?</h3>
      </div>
      <div className="lp-answer-row">
        <span className="lp-radio" />
        <span>Certo</span>
      </div>
      <div className="lp-answer-row lp-answer-wrong">
        <span className="lp-answer-x">x</span>
        <span>Errado - sua resposta</span>
      </div>
      <div className="lp-diagnosis">
        <p className="lp-diagnosis-title">Diagnóstico do erro</p>
        <p>Erro de base. Revise PPP sempre tem contraprestação pública e risco compartilhado.</p>
        <span>Revisar em 2 dias</span>
      </div>
    </div>
  );
}

function Hero() {
  useEffect(() => {
    track('landing_view');
  }, []);

  return (
    <section className="lp-hero">
      <div className="lp-container">
        <header className="lp-nav">
          <Link href="/" aria-label="Vimens">
            <Logo />
          </Link>
          <Link href="/login" className="lp-nav-link">Entrar</Link>
        </header>

        <div className="lp-hero-grid">
          <div className="lp-hero-copy">
            <span className="lp-pill">Pare de revisar no escuro</span>
            <h1>
              Ler não aprova.
              <strong>Responder,<br /> sim.</strong>
            </h1>
            <p>
              Chega de leitura passiva. Envie seu material e transforme resumos em simulados da sua banca.
              Descubra o que você não sabe antes da prova.
            </p>
            <div className="lp-hero-actions">
              <Link href="/cadastro" className="lp-primary" onClick={() => track('signup_click', { source: 'hero_cta' })}>
                <Icon name="arrow" />
                Criar conta grátis e testar meu material
              </Link>
              <Link href="/demo" className="lp-secondary">
                <Icon name="play" />
                Ver Demonstração
              </Link>
            </div>
            <div className="lp-exam-strip">
              <span>Feito para</span>
              {exams.slice(0, 5).map((exam) => <b key={exam}>{exam}</b>)}
            </div>
          </div>
          <HeroMock />
        </div>
      </div>
    </section>
  );
}

function Steps() {
  const steps = [
    ['01', 'Envie seu material', 'PDF, texto ou anotações. Qualquer conteúdo que você queira memorizar.'],
    ['02', 'Transforme em conteúdo', 'Em minutos você tem flashcards e questões no formato da sua banca.'],
    ['03', 'Revise todo dia', 'O sistema agenda as próximas revisões com base nos seus acertos e erros.'],
  ];

  return (
    <section className="lp-band">
      <div className="lp-container lp-section-center">
        <span className="lp-pill">Como funciona</span>
        <h2>3 passos para <strong>memorizar de verdade</strong></h2>
        <div className="lp-steps">
          {steps.map(([num, title, desc]) => (
            <div key={num} className="lp-step">
              <span>{num}</span>
              <h3>{title}</h3>
              <p>{desc}</p>
            </div>
          ))}
        </div>
        <p className="lp-small-note">Revisão adaptativa com <strong>FSRS V5</strong>. O sistema aprende com seu desempenho.</p>
      </div>
    </section>
  );
}

function ErrorLearning() {
  return (
    <section className="lp-section lp-error-section">
      <div className="lp-container lp-section-center">
        <span className="lp-pill">Por que não é só mais um app de flashcard</span>
        <h2>Aprende com seus <strong>Erros</strong></h2>
        <p className="lp-subtitle">Com algoritmo personalizado baseado nos seus erros.</p>
        <div className="lp-error-glow">
          <ErrorCard />
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section className="lp-section">
      <div className="lp-container lp-section-center">
        <span className="lp-pill">Recursos</span>
        <h2>Do seu material ao diagnóstico em <strong>poucos minutos</strong></h2>
        <p className="lp-subtitle">Nada de caixa preta. Você decide o que estudar e quando.</p>
        <div className="lp-feature-grid">
          {features.map((feature) => (
            <article className="lp-feature-card" key={feature.title}>
              <span className="lp-icon"><Icon name={feature.icon} /></span>
              <h3>{feature.title}</h3>
              <p>{feature.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Tracks() {
  return (
    <section className="lp-band">
      <div className="lp-container lp-section-center">
        <span className="lp-pill">Para quem é</span>
        <h2>Trilhas para <strong>sua prova</strong></h2>
        <p className="lp-subtitle">Organize por matéria. O scheduler se adapta ao seu histórico.</p>
        <div className="lp-track-grid">
          {tracks.map((track) => (
            <article className="lp-track-card" key={track.name}>
              <h3>{track.name}</h3>
              <p>Ex: &quot;{track.example}&quot;</p>
              <div>
                <span>{track.time}</span>
                <span>{track.retention}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [proOffer, setProOffer] = useState<{ formattedPrice: string; periodLabel: string } | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadOffer() {
      try {
        const response = await fetch('/api/stripe/offer', { cache: 'no-store' });
        if (!response.ok || !mounted) return;
        setProOffer(await response.json());
      } catch {
        // Keep fallback values.
      }
    }

    loadOffer();
    return () => {
      mounted = false;
    };
  }, []);

  async function handlePremiumCheckout() {
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
        window.location.href = data.url;
        return;
      }

      if (response.status === 401) {
        window.location.href = '/cadastro?plan=premium';
        return;
      }

      setCheckoutLoading(false);
      alert('Erro ao iniciar checkout. Tente novamente.');
    } catch {
      setCheckoutLoading(false);
      alert('Erro ao conectar. Tente novamente.');
    }
  }

  const plans: Plan[] = [
    {
      name: 'Grátis',
      subtitle: 'Para começar',
      price: 'R$ 0',
      period: '',
      features: [
        { text: 'Até 3 decks', ok: true },
        { text: 'Até 50 cards por deck', ok: true },
        { text: '3 uploads por semana', ok: true },
        { text: 'Flashcards limitados', ok: true },
        { text: 'Sem simulados por banca', ok: false },
        { text: 'FSRS avançado + calibração', ok: false },
      ],
    },
    {
      name: 'Premium',
      subtitle: 'Para quem leva a sério',
      price: proOffer?.formattedPrice ?? 'R$ 29',
      period: proOffer?.periodLabel ?? '/mês',
      featured: true,
      features: [
        { text: 'Decks ilimitados', ok: true },
        { text: 'Até 10.000 cards por deck', ok: true },
        { text: 'Uploads ilimitados', ok: true },
        { text: 'Geração de cards em volume', ok: true },
        { text: 'Simulados por banca', ok: true },
        { text: 'FSRS avançado + calibração', ok: true },
      ],
    },
  ];

  return (
    <section className="lp-band lp-pricing-band">
      <div className="lp-container lp-section-center">
        <span className="lp-pill">Planos</span>
        <h2>Simples e <strong>sem pegadinha</strong></h2>
        <div className="lp-pricing-grid">
          {plans.map((plan) => (
            <article className={plan.featured ? 'lp-plan lp-plan-featured' : 'lp-plan'} key={plan.name}>
              {plan.featured && <span className="lp-popular">Popular</span>}
              <div className="lp-plan-head">
                <h3>{plan.name}</h3>
                <p>{plan.subtitle}</p>
                <strong>{plan.price}<small>{plan.period}</small></strong>
              </div>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature.text} className={feature.ok ? '' : 'lp-muted-line'}>
                    <Icon name={feature.ok ? 'check' : 'x'} />
                    {feature.text}
                  </li>
                ))}
              </ul>
              {plan.featured ? (
                <button className="lp-primary lp-plan-button" onClick={handlePremiumCheckout} disabled={checkoutLoading}>
                  {checkoutLoading ? 'Carregando...' : 'Comece agora!'}
                  {!checkoutLoading && <Icon name="arrow" />}
                </button>
              ) : (
                <Link href="/cadastro" className="lp-secondary lp-plan-button">
                  Começar Grátis
                  <Icon name="arrow" />
                </Link>
              )}
            </article>
          ))}
        </div>
        <p className="lp-small-note">Cancele quando quiser. Treinar revela o erro antes da prova.</p>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="lp-section lp-final-cta">
      <div className="lp-container lp-section-center">
        <h2>Pronto para <strong>começar?</strong></h2>
        <p className="lp-subtitle">
          Crie uma conta grátis, envie seu material e veja o Vimens apontar o caminho entre estudo passivo e aprovação.
        </p>
        <Link href="/cadastro" className="lp-primary">
          <Icon name="rocket" />
          Criar minha conta grátis
        </Link>
        <p className="lp-small-note">Cancele quando quiser</p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="lp-footer">
      <div className="lp-container lp-footer-inner">
        <Link href="/" aria-label="Vimens">
          <Logo small />
        </Link>
        <nav>
          <Link href="/termos">Termos</Link>
          <Link href="/privacidade">Privacidade</Link>
          <a href="mailto:suporte@vimens.com.br">Suporte</a>
        </nav>
        <p>© 2026 Vimens</p>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <main className="lp-page">
      <Hero />
      <Steps />
      <ErrorLearning />
      <Features />
      <Tracks />
      <Pricing />
      <CTA />
      <Footer />
    </main>
  );
}

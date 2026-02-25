import Link from 'next/link';

export const metadata = {
  title: 'Termos de Uso | Vimens',
  description: 'Termos de uso da plataforma Vimens.',
};

export default function TermosPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-base)',
        color: 'var(--text-primary)',
      }}
    >
      <header
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Link
          href="/"
          style={{
            fontSize: 24,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg, #6366F1 0%, #A855F7 50%, #EC4899 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text' as const,
            textDecoration: 'none',
          }}
        >
          Vimens
        </Link>
      </header>

      <main style={{ maxWidth: 800, margin: '0 auto', padding: '48px 24px' }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 32 }}>Termos de Uso</h1>

        <p style={{ color: 'var(--text-muted)', marginBottom: 32, fontSize: 14 }}>
          Última atualização: 22 de fevereiro de 2026
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          <section>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>1. Aceitação dos Termos</h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              Ao acessar ou usar o Vimens, você concorda em cumprir estes Termos de Uso. Se você não
              concordar com qualquer parte destes termos, não poderá acessar o serviço.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>2. Descrição do Serviço</h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              O Vimens é uma plataforma de estudo baseada em flashcards com repetição espaçada. O
              serviço permite que usuários criem, importem e estudem flashcards, utilizando algoritmos
              de aprendizado para otimizar a memorização.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>3. Contas de Usuário</h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              Você é responsável por manter a confidencialidade de suas credenciais de acesso e por
              todas as atividades que ocorram em sua conta. Notifique-nos imediatamente sobre qualquer
              uso não autorizado.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>4. Uso Aceitável</h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 12 }}>
              Você concorda em não:
            </p>
            <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginLeft: 24 }}>
              <li>Violar leis ou regulamentos aplicáveis;</li>
              <li>Carregar conteúdo ilegal, ofensivo ou que viole direitos autorais;</li>
              <li>Tentar acessar sistemas ou dados não autorizados;</li>
              <li>Usar o serviço para spam ou atividades maliciosas.</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>5. Conteúdo do Usuário</h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              Você mantém os direitos sobre o conteúdo que cria no Vimens. Ao usar o serviço, você nos
              concede uma licença limitada para armazenar e processar seu conteúdo, conforme necessário
              para fornecer o serviço.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>6. Planos e Pagamentos</h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              Oferecemos planos gratuitos e pagos. Os planos pagos são cobrados mensalmente. Você pode
              cancelar a qualquer momento pelo portal de cobrança. Atualmente, o plano pago não possui
              período de teste grátis. A cobrança começa imediatamente após a confirmação no checkout.
              Eventuais promoções, quando existentes, são exibidas no checkout antes da confirmação.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>7. Limitação de Responsabilidade</h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              O Vimens é fornecido como está. Não garantimos que o serviço será ininterrupto ou livre
              de erros. Não nos responsabilizamos por danos indiretos resultantes do uso ou incapacidade
              de usar o serviço.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>8. Alterações nos Termos</h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              Podemos modificar estes termos a qualquer momento. Notificaremos sobre mudanças
              significativas por e-mail ou através do serviço. O uso continuado após alterações
              constitui aceitação dos novos termos.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>9. Contato</h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              Para dúvidas sobre estes termos, entre em contato pelo e-mail{' '}
              <a href="mailto:suporte@vimens.app" style={{ color: 'var(--accent)' }}>
                suporte@vimens.app
              </a>
              .
            </p>
          </section>
        </div>

        <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
          <Link href="/" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 14 }}>
            {'<-'} Voltar para a página inicial
          </Link>
        </div>
      </main>
    </div>
  );
}

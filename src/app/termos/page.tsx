import Link from 'next/link';

export const metadata = {
  title: 'Termos de Uso | Vimens',
  description: 'Termos de uso da plataforma Vimens.',
};

const sectionTitleStyle = { fontSize: 20, fontWeight: 600, marginBottom: 12 };
const paragraphStyle = { color: 'var(--text-secondary)', lineHeight: 1.7 };

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
          Última atualização: 16 de março de 2026
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          <section>
            <h2 style={sectionTitleStyle}>1. Escopo e aceite</h2>
            <p style={paragraphStyle}>
              Estes Termos regem o acesso e uso da plataforma Vimens, inclusive seus recursos gratuitos
              e pagos. Ao criar uma conta, acessar ou
              usar a plataforma, você declara que leu e concorda com estes Termos e com a Política de
              Privacidade.
            </p>
          </section>

          <section>
            <h2 style={sectionTitleStyle}>2. Descrição do serviço</h2>
            <p style={paragraphStyle}>
              A Vimens é uma plataforma de estudo que permite criar, organizar e revisar materiais de
              aprendizagem, inclusive com recursos de geração assistida por IA, repetição espaçada e
              análise de desempenho.
            </p>
            <p style={{ ...paragraphStyle, marginTop: 12 }}>
              Os conteúdos gerados automaticamente podem conter imprecisões e devem ser revisados pelo
              usuário antes do uso acadêmico, profissional ou em provas. A plataforma não garante
              aprovação, desempenho específico ou ausência de erros nos materiais gerados.
            </p>
          </section>

          <section>
            <h2 style={sectionTitleStyle}>3. Conta do usuário</h2>
            <p style={paragraphStyle}>
              Você é responsável por manter a confidencialidade de suas credenciais, pela veracidade das
              informações fornecidas e pelas atividades realizadas em sua conta. Se identificar uso não
              autorizado, informe imediatamente pelo canal de suporte.
            </p>
          </section>

          <section>
            <h2 style={sectionTitleStyle}>4. Uso permitido e restrições</h2>
            <p style={{ ...paragraphStyle, marginBottom: 12 }}>Você concorda em não:</p>
            <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginLeft: 24 }}>
              <li>violar leis, regulamentos ou direitos de terceiros;</li>
              <li>enviar conteúdo sem autorização, inclusive material protegido por direitos autorais;</li>
              <li>enviar documentos com dados pessoais de terceiros sem base legal adequada;</li>
              <li>tentar acessar áreas, sistemas ou dados sem permissão;</li>
              <li>usar a plataforma para fraude, spam, abuso, engenharia reversa ou atividade maliciosa.</li>
            </ul>
          </section>

          <section>
            <h2 style={sectionTitleStyle}>5. Conteúdo do usuário e propriedade intelectual</h2>
            <p style={paragraphStyle}>
              Você mantém a titularidade do conteúdo que envia ou cria na plataforma, mas declara que tem
              os direitos e autorizações necessários para utilizá-lo. Ao usar o serviço, você concede à
              Vimens licença não exclusiva, limitada e pelo tempo necessário para armazenar, processar e
              exibir esse conteúdo com a finalidade de operar, proteger e melhorar o serviço.
            </p>
          </section>

          <section>
            <h2 style={sectionTitleStyle}>6. Planos pagos, cancelamento e reembolso</h2>
            <p style={paragraphStyle}>
              Preços, periodicidade, funcionalidades e condições comerciais aplicáveis ao plano serão
              apresentados no checkout antes da contratação. As assinaturas são recorrentes enquanto não
              houver cancelamento.
            </p>
            <p style={{ ...paragraphStyle, marginTop: 12 }}>
              O cancelamento ordinário pode ser solicitado a qualquer momento pelo portal de cobrança. Em
              regra, o cancelamento encerra a renovação futura e mantém o acesso pago até o fim do ciclo
              já quitado.
            </p>
            <p style={{ ...paragraphStyle, marginTop: 12 }}>
              Solicitações de reembolso automático podem estar disponíveis em até 7 (sete) dias contados
              do pagamento elegível, conforme a legislação aplicável e a validação do registro da cobrança
              pelo processador de pagamento. Quando um reembolso integral é efetivamente processado, o
              acesso ao plano pago é encerrado imediatamente. Pedidos fora da janela automática ou com
              falha operacional podem ser analisados pelo suporte.
            </p>
          </section>

          <section>
            <h2 style={sectionTitleStyle}>7. Suspensão, encerramento e disponibilidade</h2>
            <p style={paragraphStyle}>
              Podemos suspender ou limitar o acesso à plataforma em caso de indícios de abuso, fraude,
              risco de segurança, violação destes Termos ou exigência legal. Também poderemos alterar,
              evoluir, descontinuar ou restringir funcionalidades da plataforma, inclusive recursos beta ou
              experimentais.
            </p>
          </section>

          <section>
            <h2 style={sectionTitleStyle}>8. Limitação de responsabilidade</h2>
            <p style={paragraphStyle}>
              A plataforma é fornecida no estado em que se encontra, dentro dos limites legalmente
              permitidos. Não garantimos disponibilidade ininterrupta, ausência de falhas, compatibilidade
              com todo dispositivo ou adequação a finalidades específicas. Na máxima extensão permitida
              pela legislação aplicável, a Vimens não responde por lucros cessantes, danos indiretos ou
              prejuízos decorrentes do uso de conteúdo não revisado pelo usuário.
            </p>
          </section>

          <section>
            <h2 style={sectionTitleStyle}>9. Alterações destes Termos</h2>
            <p style={paragraphStyle}>
              Estes Termos podem ser atualizados periodicamente. Quando houver alteração relevante,
              poderemos avisar por e-mail, pela própria plataforma ou por outro canal adequado. A data
              indicada no topo desta página informa a versão mais recente.
            </p>
          </section>

          <section>
            <h2 style={sectionTitleStyle}>10. Contato</h2>
            <p style={paragraphStyle}>
              Dúvidas sobre estes Termos, cobrança, cancelamento ou reembolso podem ser encaminhadas para{' '}
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

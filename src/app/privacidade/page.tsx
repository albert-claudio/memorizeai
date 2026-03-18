import Link from 'next/link';

export const metadata = {
  title: 'Política de Privacidade | Vimens',
  description: 'Política de privacidade da plataforma Vimens.',
};

const sectionTitleStyle = { fontSize: 20, fontWeight: 600, marginBottom: 12 };
const paragraphStyle = { color: 'var(--text-secondary)', lineHeight: 1.7 };

export default function PrivacidadePage() {
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

      <main
        style={{
          maxWidth: 800,
          margin: '0 auto',
          padding: '48px 24px',
        }}
      >
        <h1
          style={{
            fontSize: 32,
            fontWeight: 700,
            marginBottom: 32,
          }}
        >
          Política de Privacidade
        </h1>

        <p style={{ color: 'var(--text-muted)', marginBottom: 32, fontSize: 14 }}>
          Última atualização: 16 de março de 2026
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          <section>
            <h2 style={sectionTitleStyle}>1. Escopo e responsável pelo tratamento</h2>
            <p style={paragraphStyle}>
              Esta Política descreve como a plataforma Vimens, também apresentada publicamente como
              Memoriza, trata dados pessoais de usuários, visitantes e clientes. Para assuntos de
              privacidade e exercício de direitos, o canal oficial de contato é{' '}
              <a href="mailto:suporte@vimens.app" style={{ color: 'var(--accent)' }}>
                suporte@vimens.app
              </a>
              .
            </p>
          </section>

          <section>
            <h2 style={sectionTitleStyle}>2. Dados pessoais que tratamos</h2>
            <p style={{ ...paragraphStyle, marginBottom: 12 }}>Podemos tratar as seguintes categorias de dados:</p>
            <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginLeft: 24 }}>
              <li>
                <strong>Dados de cadastro e autenticação:</strong> e-mail, nome informado pelo usuário e
                identificadores de conta.
              </li>
              <li>
                <strong>Dados de uso e estudo:</strong> decks, cards, histórico de revisões, métricas de
                desempenho, preferências de uso e registros de interação.
              </li>
              <li>
                <strong>Documentos enviados e texto extraído:</strong> arquivos submetidos pelo usuário e
                o conteúdo necessário ao processamento e geração de materiais.
              </li>
              <li>
                <strong>Dados técnicos e de segurança:</strong> endereço IP, navegador, logs de acesso,
                identificadores de sessão e eventos relacionados à segurança e prevenção a fraudes.
              </li>
              <li>
                <strong>Dados de cobrança:</strong> status da assinatura, identificadores do cliente e da
                assinatura no processador de pagamento. Os dados completos do cartão são tratados pelo
                Stripe e não são armazenados diretamente por nós.
              </li>
            </ul>
          </section>

          <section>
            <h2 style={sectionTitleStyle}>3. Finalidades e bases legais</h2>
            <p style={{ ...paragraphStyle, marginBottom: 12 }}>Tratamos dados pessoais, em geral, para:</p>
            <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginLeft: 24 }}>
              <li>criar e administrar contas, autenticar usuários e prestar o serviço contratado;</li>
              <li>processar documentos enviados e gerar materiais de estudo solicitados pelo usuário;</li>
              <li>executar cobranças, gerenciar assinaturas, cancelamentos e reembolsos;</li>
              <li>proteger a plataforma, prevenir fraude, abuso e incidentes de segurança;</li>
              <li>cumprir obrigações legais, regulatórias, fiscais e de auditoria;</li>
              <li>melhorar a experiência do produto com métricas agregadas e análise operacional.</li>
            </ul>
            <p style={{ ...paragraphStyle, marginTop: 12 }}>
              As bases legais podem incluir, conforme o caso, execução de contrato e procedimentos
              preliminares, cumprimento de obrigação legal ou regulatória, exercício regular de direitos,
              legítimo interesse e consentimento quando ele for exigido.
            </p>
          </section>

          <section>
            <h2 style={sectionTitleStyle}>4. Compartilhamento de dados</h2>
            <p style={{ ...paragraphStyle, marginBottom: 12 }}>
              Compartilhamos dados pessoais somente quando isso é necessário para operar a plataforma ou
              cumprir obrigação legal, inclusive com:
            </p>
            <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginLeft: 24 }}>
              <li>
                <strong>Supabase:</strong> autenticação, banco de dados e armazenamento.
              </li>
              <li>
                <strong>Stripe:</strong> processamento de pagamentos, assinaturas, cancelamentos e
                reembolsos.
              </li>
              <li>
                <strong>Provedores de IA atualmente utilizados:</strong> Groq e Google Gemini, para
                recursos de geração e análise solicitados pelo usuário.
              </li>
            </ul>
            <p style={{ ...paragraphStyle, marginTop: 12 }}>
              Não vendemos dados pessoais. Dependendo do fornecedor utilizado, pode haver transferência
              internacional de dados, observadas medidas contratuais e de segurança compatíveis com a
              legislação aplicável.
            </p>
          </section>

          <section>
            <h2 style={sectionTitleStyle}>5. Cookies e tecnologias semelhantes</h2>
            <p style={paragraphStyle}>
              Utilizamos cookies e identificadores estritamente necessários para autenticação, manutenção
              de sessão, segurança e funcionamento da plataforma. No momento, não utilizamos cookies de
              terceiros voltados à publicidade comportamental dentro da própria aplicação.
            </p>
          </section>

          <section>
            <h2 style={sectionTitleStyle}>6. Retenção e eliminação</h2>
            <p style={paragraphStyle}>
              Mantemos dados pessoais pelo tempo necessário para prestar o serviço, preservar a segurança
              da plataforma, cumprir obrigações legais e resguardar direitos em processos administrativos,
              judiciais ou arbitrais. Quando houver pedido válido de exclusão ou quando os dados deixarem
              de ser necessários, poderemos eliminá-los, anonimiza-los ou mantê-los bloqueados, conforme a
              base legal aplicável e os limites técnicos e regulatórios.
            </p>
          </section>

          <section>
            <h2 style={sectionTitleStyle}>7. Direitos do titular</h2>
            <p style={{ ...paragraphStyle, marginBottom: 12 }}>
              Nos termos da LGPD, você pode solicitar, quando cabível:
            </p>
            <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginLeft: 24 }}>
              <li>confirmação da existência de tratamento e acesso aos dados pessoais;</li>
              <li>correção de dados incompletos, inexatos ou desatualizados;</li>
              <li>anonimização, bloqueio ou eliminação, nos casos legalmente cabíveis;</li>
              <li>portabilidade, observados segredo comercial, viabilidade técnica e regulamentação;</li>
              <li>informação sobre compartilhamentos realizados;</li>
              <li>revogação do consentimento, quando o tratamento depender dele;</li>
              <li>informação sobre a possibilidade de peticionar perante a ANPD.</li>
            </ul>
            <p style={{ ...paragraphStyle, marginTop: 12 }}>
              Para exercer esses direitos, envie sua solicitação para{' '}
              <a href="mailto:suporte@vimens.app" style={{ color: 'var(--accent)' }}>
                suporte@vimens.app
              </a>
              . Poderemos solicitar informações adicionais para confirmar sua identidade e a extensão do
              pedido.
            </p>
          </section>

          <section>
            <h2 style={sectionTitleStyle}>8. Segurança</h2>
            <p style={paragraphStyle}>
              Adotamos medidas técnicas e organizacionais razoáveis para proteger dados pessoais contra
              acessos não autorizados, perda, alteração ou destruição indevida. Ainda assim, nenhum sistema
              é completamente invulnerável e não podemos garantir segurança absoluta.
            </p>
          </section>

          <section>
            <h2 style={sectionTitleStyle}>9. Alterações desta Política</h2>
            <p style={paragraphStyle}>
              Esta Política pode ser atualizada periodicamente para refletir alterações legais, técnicas ou
              operacionais. A versão vigente será sempre identificada pela data indicada no topo desta
              página.
            </p>
          </section>

          <section>
            <h2 style={sectionTitleStyle}>10. Contato</h2>
            <p style={paragraphStyle}>
              Dúvidas sobre privacidade, proteção de dados ou exercício de direitos podem ser encaminhadas
              para{' '}
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

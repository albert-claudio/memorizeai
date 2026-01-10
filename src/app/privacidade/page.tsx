import Link from 'next/link';

export const metadata = {
  title: 'Política de Privacidade | Vimens',
  description: 'Política de privacidade da plataforma Vimens.',
};

export default function PrivacidadePage() {
  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'var(--bg-base)',
      color: 'var(--text-primary)',
    }}>
      {/* Header */}
      <header style={{ 
        padding: '16px 24px', 
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Link href="/" style={{ 
          fontSize: 24, 
          fontWeight: 800, 
          letterSpacing: '-0.02em',
          background: 'linear-gradient(135deg, #6366F1 0%, #A855F7 50%, #EC4899 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text' as const,
          textDecoration: 'none',
        }}>
          Vimens
        </Link>
      </header>
      
      {/* Content */}
      <main style={{ 
        maxWidth: 800, 
        margin: '0 auto', 
        padding: '48px 24px',
      }}>
        <h1 style={{ 
          fontSize: 32, 
          fontWeight: 700, 
          marginBottom: 32,
        }}>
          Política de Privacidade
        </h1>
        
        <p style={{ color: 'var(--text-muted)', marginBottom: 32, fontSize: 14 }}>
          Última atualização: Janeiro de 2025
        </p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          <section>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>1. Informações que Coletamos</h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 12 }}>
              Coletamos as seguintes informações:
            </p>
            <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginLeft: 24 }}>
              <li><strong>Dados de conta:</strong> email, nome (se fornecido)</li>
              <li><strong>Dados de uso:</strong> flashcards criados, histórico de revisões, progresso de estudo</li>
              <li><strong>Dados técnicos:</strong> endereço IP, tipo de navegador, dados de acesso</li>
              <li><strong>Arquivos enviados:</strong> PDFs e documentos para geração de flashcards</li>
            </ul>
          </section>
          
          <section>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>2. Como Usamos suas Informações</h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 12 }}>
              Suas informações são usadas para:
            </p>
            <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginLeft: 24 }}>
              <li>Fornecer e manter o serviço Vimens</li>
              <li>Calcular intervalos de revisão personalizados (FSRS)</li>
              <li>Gerar flashcards a partir de seus documentos</li>
              <li>Enviar notificações sobre revisões pendentes</li>
              <li>Melhorar o serviço com base em padrões de uso agregados</li>
            </ul>
          </section>
          
          <section>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>3. Armazenamento de Dados</h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              Seus dados são armazenados de forma segura em servidores da Supabase (PostgreSQL). 
              Os PDFs enviados são processados para extração de texto e podem ser armazenados 
              temporariamente para geração de flashcards. Utilizamos criptografia em trânsito 
              e em repouso.
            </p>
          </section>
          
          <section>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>4. Compartilhamento de Dados</h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 12 }}>
              Compartilhamos dados apenas com:
            </p>
            <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginLeft: 24 }}>
              <li><strong>Supabase:</strong> autenticação e banco de dados</li>
              <li><strong>Provedores de IA:</strong> para geração de flashcards (Groq, OpenAI)</li>
              <li><strong>Processadores de pagamento:</strong> para assinaturas Premium</li>
            </ul>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginTop: 12 }}>
              Não vendemos seus dados pessoais a terceiros.
            </p>
          </section>
          
          <section>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>5. Seus Direitos</h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 12 }}>
              Você tem direito a:
            </p>
            <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginLeft: 24 }}>
              <li>Acessar seus dados pessoais</li>
              <li>Corrigir dados incorretos</li>
              <li>Solicitar exclusão de sua conta e dados</li>
              <li>Exportar seus flashcards e dados de estudo</li>
              <li>Retirar consentimento para processamento</li>
            </ul>
          </section>
          
          <section>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>6. Cookies</h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              Utilizamos cookies essenciais para autenticação e funcionamento do serviço. 
              Não utilizamos cookies de rastreamento de terceiros para publicidade.
            </p>
          </section>
          
          <section>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>7. Retenção de Dados</h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              Mantemos seus dados enquanto sua conta estiver ativa. Após exclusão da conta, 
              seus dados são removidos dentro de 30 dias, exceto quando necessário manter 
              por obrigações legais.
            </p>
          </section>
          
          <section>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>8. Segurança</h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              Implementamos medidas de segurança técnicas e organizacionais para proteger 
              seus dados, incluindo criptografia, controle de acesso e monitoramento.
            </p>
          </section>
          
          <section>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>9. Alterações nesta Política</h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              Podemos atualizar esta política periodicamente. Notificaremos sobre mudanças 
              significativas por email ou através do serviço.
            </p>
          </section>
          
          <section>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>10. Contato</h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              Para dúvidas sobre privacidade ou exercer seus direitos, entre em contato pelo email{' '}
              <a href="mailto:suporte@vimens.app" style={{ color: 'var(--accent)' }}>
                suporte@vimens.app
              </a>.
            </p>
          </section>
        </div>
        
        <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
          <Link href="/" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 14 }}>
            ← Voltar para a página inicial
          </Link>
        </div>
      </main>
    </div>
  );
}

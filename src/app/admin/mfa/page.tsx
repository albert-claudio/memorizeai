import { redirect } from 'next/navigation';
import { getAdminAccessState } from '@/lib/auth/admin-security';
import MfaSetup from './MfaSetup';

export default async function AdminMfaPage() {
  const admin = await getAdminAccessState(false);
  if (!admin.ok) {
    redirect(admin.redirectTo ?? '/dashboard');
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#050507',
        color: '#f4f4f5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#0A0A0A',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 16,
          padding: 28,
        }}
      >
        <div style={{ fontSize: 12, color: '#818cf8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          Admin MFA
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.02em' }}>
          Verificacao obrigatoria
        </h1>
        <p style={{ color: '#a1a1aa', fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
          Toda sessao administrativa precisa de TOTP ativo antes de acessar o painel.
        </p>
        <MfaSetup />
      </section>
    </main>
  );
}

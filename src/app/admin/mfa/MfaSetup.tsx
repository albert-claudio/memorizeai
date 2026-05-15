'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Factor = {
  id: string;
  friendly_name?: string;
  factor_type?: string;
  status?: string;
};

export default function MfaSetup() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [verifiedFactors, setVerifiedFactors] = useState<Factor[]>([]);
  const [factorId, setFactorId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [totpUri, setTotpUri] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal.data?.currentLevel === 'aal2') {
        router.replace('/admin');
        return;
      }

      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) {
        setError(factors.error.message);
        setLoading(false);
        return;
      }

      const totpFactors = factors.data?.totp ?? [];
      setVerifiedFactors(totpFactors);
      setFactorId(totpFactors[0]?.id ?? '');
      setLoading(false);
    };

    load();
  }, [router]);

  const startEnrollment = async () => {
    setError('');
    setStatus('');
    setBusy(true);
    try {
      const supabase = createClient();
      const factors = await supabase.auth.mfa.listFactors();
      const staleTotpFactors = (factors.data?.all ?? []).filter(
        (factor: Factor) => factor.factor_type === 'totp' && factor.status !== 'verified'
      );

      for (const factor of staleTotpFactors) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }

      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        issuer: 'Vimens',
        friendlyName: `Admin ${Date.now()}`,
      });

      if (enrollError || !data || data.type !== 'totp') {
        const errorCode = 'code' in (enrollError ?? {}) ? enrollError?.code : undefined;
        const message = errorCode === 'mfa_totp_enroll_not_enabled'
          ? 'TOTP MFA nao esta habilitado no Supabase Auth.'
          : enrollError?.message || 'Nao foi possivel iniciar o MFA.';
        setError(message);
        return;
      }

      setFactorId(data.id);
      setQrCode(toScannableSvgDataUri(data.totp.qr_code));
      setTotpUri(data.totp.uri);
      setSecret(data.totp.secret);
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setStatus('');
    setBusy(true);

    try {
      const supabase = createClient();
      const normalizedCode = code.replace(/\D/g, '');
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: normalizedCode,
      });

      if (verifyError) {
        setError(`Codigo recusado pelo Supabase: ${verifyError.message}`);
        return;
      }

      setStatus('MFA validado. Atualizando sessao...');
      await supabase.auth.refreshSession();
      const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      if (aal.data?.currentLevel !== 'aal2') {
        setError('MFA validado, mas a sessao ainda nao subiu para AAL2. Saia, entre novamente e tente acessar o admin.');
        return;
      }

      router.replace('/admin');
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const resetEnrollment = async () => {
    setError('');
    setStatus('');
    setBusy(true);

    try {
      const supabase = createClient();
      if (factorId) {
        await supabase.auth.mfa.unenroll({ factorId });
      }

      setVerifiedFactors([]);
      setFactorId('');
      setQrCode('');
      setTotpUri('');
      setSecret('');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p style={mutedStyle}>Carregando MFA...</p>;
  }

  const needsEnrollment = verifiedFactors.length === 0 && !qrCode;

  return (
    <div>
      {error && <p style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{error}</p>}
      {status && <p style={{ color: '#4ade80', fontSize: 13, marginBottom: 12 }}>{status}</p>}
      {needsEnrollment ? (
        <button type="button" onClick={startEnrollment} disabled={busy} style={buttonStyle}>
          {busy ? 'Gerando...' : 'Configurar autenticador'}
        </button>
      ) : (
        <>
          {qrCode && (
            <div style={{ marginBottom: 20 }}>
              <div style={qrShellStyle}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrCode}
                  alt="QR Code MFA"
                  width={288}
                  height={288}
                  style={qrImageStyle}
                />
              </div>
              <p style={qrHelpStyle}>
                Escaneie com Google Authenticator, Microsoft Authenticator ou 1Password.
              </p>
              <div style={manualSetupStyle}>
                <span style={manualLabelStyle}>Chave manual</span>
                <code style={secretStyle}>{secret}</code>
              </div>
              {totpUri && (
                <a href={totpUri} style={authenticatorLinkStyle}>
                  Abrir no app autenticador
                </a>
              )}
              <button type="button" onClick={resetEnrollment} disabled={busy} style={secondaryButtonStyle}>
                Gerar novo QR
              </button>
            </div>
          )}

          {!qrCode && (
            <p style={mutedStyle}>
              Use o codigo do seu aplicativo autenticador para elevar esta sessao.
            </p>
          )}

          <form onSubmit={verifyCode}>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              style={inputStyle}
              disabled={busy}
            />
            <button type="submit" disabled={busy || !factorId || code.replace(/\D/g, '').length < 6} style={buttonStyle}>
              {busy ? 'Validando...' : 'Validar MFA'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

const mutedStyle: React.CSSProperties = {
  color: '#a1a1aa',
  fontSize: 14,
  lineHeight: 1.6,
  marginBottom: 18,
};

const SVG_DATA_URI_PREFIX = 'data:image/svg+xml;utf-8,';

function toScannableSvgDataUri(qrCode: string) {
  if (!qrCode) {
    return '';
  }

  if (qrCode.startsWith('data:image/svg+xml;base64,')) {
    return qrCode;
  }

  if (qrCode.startsWith(SVG_DATA_URI_PREFIX)) {
    const svg = qrCode.slice(SVG_DATA_URI_PREFIX.length);
    return svg.trimStart().startsWith('<svg')
      ? `${SVG_DATA_URI_PREFIX}${encodeURIComponent(svg)}`
      : qrCode;
  }

  return qrCode.trimStart().startsWith('<svg')
    ? `${SVG_DATA_URI_PREFIX}${encodeURIComponent(qrCode)}`
    : qrCode;
}

const qrShellStyle: React.CSSProperties = {
  width: '100%',
  background: '#fff',
  borderRadius: 10,
  padding: 24,
  display: 'flex',
  justifyContent: 'center',
  boxShadow: '0 18px 40px rgba(0,0,0,0.35)',
  marginBottom: 14,
};

const qrImageStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 288,
  height: 'auto',
  aspectRatio: '1 / 1',
  display: 'block',
  imageRendering: 'pixelated',
};

const qrHelpStyle: React.CSSProperties = {
  ...mutedStyle,
  fontSize: 13,
  textAlign: 'center',
  marginBottom: 14,
};

const manualSetupStyle: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 10,
  background: 'rgba(255,255,255,0.04)',
  padding: 12,
  marginBottom: 12,
};

const manualLabelStyle: React.CSSProperties = {
  display: 'block',
  color: '#a1a1aa',
  fontSize: 12,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 8,
};

const secretStyle: React.CSSProperties = {
  display: 'block',
  color: '#f4f4f5',
  fontSize: 16,
  fontWeight: 700,
  letterSpacing: '0.08em',
  lineHeight: 1.5,
  overflowWrap: 'anywhere',
  userSelect: 'all',
};

const authenticatorLinkStyle: React.CSSProperties = {
  display: 'block',
  color: '#c4b5fd',
  fontSize: 14,
  fontWeight: 700,
  textAlign: 'center',
  textDecoration: 'none',
  marginBottom: 12,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 56,
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.12)',
  background: '#09090b',
  color: '#fff',
  fontSize: 24,
  fontWeight: 700,
  letterSpacing: '0.18em',
  textAlign: 'center',
  outline: 'none',
  marginBottom: 14,
};

const buttonStyle: React.CSSProperties = {
  width: '100%',
  height: 52,
  borderRadius: 12,
  border: 'none',
  background: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
  color: '#fff',
  fontWeight: 700,
  fontSize: 15,
  cursor: 'pointer',
};

const secondaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  height: 44,
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.14)',
  boxShadow: 'none',
  marginTop: 12,
};

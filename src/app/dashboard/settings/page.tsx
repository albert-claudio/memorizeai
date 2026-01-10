'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { RetentionSlider, RetentionBadge } from '@/components/RetentionSlider';
import { DEFAULT_RETENTION } from '@/lib/fsrs-weights';
import type { User } from '@supabase/supabase-js';

// ============================================================================
// ICONS
// ============================================================================

const Icons = {
  ArrowLeft: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12,19 5,12 12,5"/>
    </svg>
  ),
  Brain: () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.54"/>
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.54"/>
    </svg>
  ),
  Settings: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  Check: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20,6 9,17 4,12"/>
    </svg>
  ),
  Loader: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  ),
  Zap: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  Info: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 16v-4"/>
      <path d="M12 8h.01"/>
    </svg>
  ),
};

// ============================================================================
// TYPES
// ============================================================================

interface UserSettings {
  desiredRetention: number;
  calibrationEnabled: boolean;
  reviewCountSinceCalibration: number;
  lastCalibrationAt: number | null;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  
  const [settings, setSettings] = useState<UserSettings>({
    desiredRetention: DEFAULT_RETENTION,
    calibrationEnabled: true,
    reviewCountSinceCalibration: 0,
    lastCalibrationAt: null,
  });

  const supabase = createClient();

  // Load user and settings
  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/login');
        return;
      }
      
      setUser(user);
      
      // Load user SRS settings
      const { data: srsSettings } = await supabase
        .from('user_srs_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();
      
      if (srsSettings) {
        setSettings({
          desiredRetention: srsSettings.desired_retention ?? DEFAULT_RETENTION,
          calibrationEnabled: srsSettings.calibration_enabled ?? true,
          reviewCountSinceCalibration: srsSettings.review_count_since_calibration ?? 0,
          lastCalibrationAt: srsSettings.last_calibration_at,
        });
      }
      
      setLoading(false);
    };

    loadData();
  }, [router, supabase]);

  // Handle retention change
  const handleRetentionChange = useCallback(async (value: number) => {
    setSettings(prev => ({ ...prev, desiredRetention: value }));
    setSaving(true);
    setSaved(false);
    
    const { error } = await supabase
      .from('user_srs_settings')
      .upsert({
        user_id: user?.id,
        desired_retention: value,
        updated_at: Date.now(),
      }, {
        onConflict: 'user_id',
      });
    
    setSaving(false);
    
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }, [user, supabase]);

  // Handle calibration toggle
  const handleCalibrationToggle = useCallback(async () => {
    const newValue = !settings.calibrationEnabled;
    setSettings(prev => ({ ...prev, calibrationEnabled: newValue }));
    
    await supabase
      .from('user_srs_settings')
      .upsert({
        user_id: user?.id,
        calibration_enabled: newValue,
        updated_at: Date.now(),
      }, {
        onConflict: 'user_id',
      });
  }, [settings.calibrationEnabled, user, supabase]);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
      }}>
        <Icons.Loader />
        <style jsx global>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a' }}>
      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Header */}
      <header style={{
        padding: '16px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(15, 15, 15, 0.8)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/dashboard" style={{ color: '#a1a1aa', display: 'flex' }}>
            <Icons.ArrowLeft />
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #A855F7 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 24px rgba(99, 102, 241, 0.4)',
            }}>
              <Icons.Brain />
            </div>
            <span style={{ 
              fontSize: 22, 
              fontWeight: 700,
              letterSpacing: '-0.02em',
            }}>
              Configurações
            </span>
          </div>
        </div>
        
        {/* Save indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 16px',
          borderRadius: 10,
          background: saved ? 'rgba(34, 197, 94, 0.15)' : 'transparent',
          color: saved ? '#22C55E' : '#a1a1aa',
          fontSize: 14,
          fontWeight: 500,
          transition: 'all 0.3s ease',
        }}>
          {saving ? (
            <>
              <Icons.Loader />
              Salvando...
            </>
          ) : saved ? (
            <>
              <Icons.Check />
              Salvo!
            </>
          ) : null}
        </div>
      </header>

      {/* Main Content */}
      <main style={{ 
        padding: '32px 24px', 
        maxWidth: 700, 
        margin: '0 auto',
      }}>
        <h1 style={{
          fontSize: 28,
          fontWeight: 700,
          marginBottom: 8,
          letterSpacing: '-0.03em',
          color: '#f4f4f5',
        }}>
          Algoritmo de Repetição
        </h1>
        <p style={{ 
          color: '#71717a',
          fontSize: 15,
          marginBottom: 32,
        }}>
          Personalize o algoritmo FSRS para se adaptar ao seu estilo de estudo
        </p>

        {/* Retention Slider Section */}
        <section style={{ marginBottom: 32 }}>
          <RetentionSlider
            value={settings.desiredRetention}
            onChange={handleRetentionChange}
            disabled={saving}
            showPreview={true}
          />
        </section>

        {/* Info Box */}
        <section style={{
          background: 'rgba(99, 102, 241, 0.08)',
          border: '1px solid rgba(99, 102, 241, 0.2)',
          borderRadius: 16,
          padding: 20,
          marginBottom: 32,
        }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ color: '#6366F1', marginTop: 2 }}>
              <Icons.Info />
            </div>
            <div>
              <h3 style={{ 
                fontSize: 15, 
                fontWeight: 600, 
                marginBottom: 6,
                color: '#e4e4e7',
              }}>
                Como funciona?
              </h3>
              <p style={{ 
                fontSize: 14, 
                color: '#a1a1aa',
                lineHeight: 1.6,
              }}>
                O algoritmo FSRS usa o <strong style={{ color: '#e4e4e7' }}>Spacing Effect</strong>: 
                quando você revisa um card que estava quase esquecendo (R baixo), 
                a estabilidade aumenta muito mais do que revisar cards frescos. 
                Isso maximiza a retenção de longo prazo.
              </p>
            </div>
          </div>
        </section>

        {/* Calibration Section */}
        <section style={{
          background: 'var(--bg-muted, #111)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 16,
          padding: 20,
          marginBottom: 32,
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'rgba(245, 158, 11, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#F59E0B',
              }}>
                <Icons.Zap />
              </div>
              <div>
                <h3 style={{ 
                  fontSize: 16, 
                  fontWeight: 600,
                  color: '#e4e4e7',
                }}>
                  Calibração Automática
                </h3>
                <p style={{ 
                  fontSize: 13, 
                  color: '#71717a',
                }}>
                  Otimiza os pesos a cada ~500 revisões
                </p>
              </div>
            </div>
            
            {/* Toggle */}
            <button
              onClick={handleCalibrationToggle}
              style={{
                width: 52,
                height: 30,
                borderRadius: 15,
                border: 'none',
                background: settings.calibrationEnabled 
                  ? 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)' 
                  : 'rgba(255,255,255,0.1)',
                cursor: 'pointer',
                position: 'relative',
                transition: 'background 0.3s ease',
              }}
            >
              <div style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: 'white',
                position: 'absolute',
                top: 4,
                left: settings.calibrationEnabled ? 26 : 4,
                transition: 'left 0.3s ease',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              }} />
            </button>
          </div>
          
          {/* Stats */}
          <div style={{
            display: 'flex',
            gap: 16,
            paddingTop: 16,
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: '#71717a', marginBottom: 4 }}>
                Revisões desde última calibração
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#e4e4e7' }}>
                {settings.reviewCountSinceCalibration}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: '#71717a', marginBottom: 4 }}>
                Última calibração
              </div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#e4e4e7' }}>
                {settings.lastCalibrationAt 
                  ? new Date(settings.lastCalibrationAt).toLocaleDateString('pt-BR')
                  : 'Nunca'
                }
              </div>
            </div>
          </div>
        </section>

        {/* Back to Dashboard */}
        <div style={{ textAlign: 'center' }}>
          <Link 
            href="/dashboard" 
            style={{
              color: '#a1a1aa',
              fontSize: 14,
              textDecoration: 'none',
            }}
          >
            ← Voltar ao Dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}

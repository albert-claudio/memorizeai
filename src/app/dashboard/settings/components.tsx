'use client';

import { CSSProperties, ReactNode, useCallback, useState } from 'react';

/* ─── Toggle Switch ─── */
export function Toggle({ value, onChange, disabled }: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      style={{
        width: 52, height: 30, borderRadius: 15, border: 'none',
        background: value
          ? 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)'
          : 'rgba(255,255,255,0.1)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative', transition: 'background 0.3s ease',
        opacity: disabled ? 0.5 : 1, flexShrink: 0,
      }}
    >
      <div style={{
        width: 22, height: 22, borderRadius: '50%', background: 'white',
        position: 'absolute', top: 4, left: value ? 26 : 4,
        transition: 'left 0.3s ease', boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
}

/* ─── Select Dropdown ─── */
export function Select({ value, onChange, options, disabled }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      style={{
        background: 'rgba(255,255,255,0.06)', color: '#e4e4e7',
        border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
        padding: '10px 14px', fontSize: 14, cursor: 'pointer',
        appearance: 'none', WebkitAppearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
        paddingRight: 36, minWidth: 0, width: '100%', maxWidth: 320,
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} style={{ background: '#1c1c1e', color: '#e4e4e7' }}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* ─── Number Stepper ─── */
export function NumberInput({ value, onChange, min, max, step, unit, disabled }: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
}) {
  const s = step ?? 1;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, width: '100%', maxWidth: 220 }}>
      <button
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - s))}
        style={stepBtnStyle}
      >−</button>
      <span style={{ fontSize: 18, fontWeight: 700, color: '#e4e4e7', minWidth: 48, textAlign: 'center' }}>
        {value}{unit && <span style={{ fontSize: 13, fontWeight: 400, color: '#71717a', marginLeft: 2 }}>{unit}</span>}
      </span>
      <button
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + s))}
        style={stepBtnStyle}
      >+</button>
    </div>
  );
}

const stepBtnStyle: CSSProperties = {
  width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.06)', color: '#e4e4e7', fontSize: 18,
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
};

/* ─── Chip Multi-Select (for study days) ─── */
export function ChipSelect({ value, onChange, options }: {
  value: string[];
  onChange: (v: string[]) => void;
  options: { value: string; label: string }[];
}) {
  const toggle = (v: string) => {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const active = value.includes(o.value);
        return (
          <button
            key={o.value}
            onClick={() => toggle(o.value)}
            style={{
              padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              border: active ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.1)',
              background: active ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
              color: active ? '#a5b4fc' : '#a1a1aa', cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Setting Row ─── */
export function SettingRow({ label, description, children }: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
      gap: 16, flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#e4e4e7' }}>{label}</div>
        {description && (
          <div style={{ fontSize: 12, color: '#71717a', marginTop: 2 }}>{description}</div>
        )}
      </div>
      <div style={{ flexShrink: 0, width: 'min(100%, 320px)', display: 'flex', justifyContent: 'flex-end' }}>{children}</div>
    </div>
  );
}

/* ─── Section Card ─── */
export function SectionCard({ title, icon, children }: {
  title: string;
  icon: string;
  children: ReactNode;
}) {
  return (
    <section style={{
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 16, padding: 'clamp(16px, 4vw, 24px)', marginBottom: 20,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
        paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: '#f4f4f5', margin: 0 }}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

/* ─── Auto-save hook ─── */
export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useAutoSave(saveFn: (updates: Record<string, unknown>) => Promise<void>) {
  const [status, setStatus] = useState<AutoSaveStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Convenience booleans for backward compat
  const saving = status === 'saving';
  const saved = status === 'saved';

  const save = useCallback(async (updates: Record<string, unknown>) => {
    setStatus('saving');
    setErrorMessage(null);
    try {
      await saveFn(updates);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (e) {
      console.error('Auto-save failed:', e);
      const msg = e instanceof Error ? e.message : 'Falha ao salvar preferências';
      setErrorMessage(msg);
      setStatus('error');
      // Clear error after 5s so user can retry
      setTimeout(() => {
        setStatus('idle');
        setErrorMessage(null);
      }, 5000);
    }
  }, [saveFn]);

  return { saving, saved, status, errorMessage, save };
}

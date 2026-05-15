
import { Icons } from '../Icons';

interface ModalProps {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}

export function Modal({ title, children, onClose }: ModalProps) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'clamp(12px, 4vw, 24px)',
      zIndex: 100,
    }}>
      <div style={{
        background: 'var(--bg-raised)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        width: '100%',
        maxWidth: 480,
        maxHeight: 'min(90vh, 720px)',
        overflow: 'auto',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px clamp(16px, 4vw, 24px)',
          borderBottom: '1px solid var(--border)',
          position: 'sticky',
          top: 0,
          background: 'var(--bg-raised)',
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            <Icons.X />
          </button>
        </div>
        <div style={{ padding: 'clamp(16px, 4vw, 24px)' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

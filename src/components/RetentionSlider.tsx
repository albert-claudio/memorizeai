'use client';

import { useState, useCallback } from 'react';
import {
  DEFAULT_RETENTION,
  MIN_RETENTION,
  MAX_RETENTION,
  getRetentionDescription,
  estimateReviewImpact,
} from '@/lib/fsrs/weights';

// ============================================================================
// TYPES
// ============================================================================

interface RetentionSliderProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  showPreview?: boolean;
}

// ============================================================================
// ICONS
// ============================================================================

const Icons = {
  Brain: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
      <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/>
      <path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/>
      <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/>
      <path d="M3.477 10.896a4 4 0 0 1 .585-.396"/>
      <path d="M19.938 10.5a4 4 0 0 1 .585.396"/>
      <path d="M6 18a4 4 0 0 1-1.967-.516"/>
      <path d="M19.967 17.484A4 4 0 0 1 18 18"/>
    </svg>
  ),
  Flame: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
    </svg>
  ),
  Target: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="12" r="6"/>
      <circle cx="12" cy="12" r="2"/>
    </svg>
  ),
  Zap: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
};

// ============================================================================
// STYLES
// ============================================================================

const styles = {
  container: {
    padding: 20,
    background: 'var(--bg-muted)',
    borderRadius: 16,
    border: '1px solid var(--border)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 10,
    background: 'rgba(99, 102, 241, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#6366F1',
  },
  title: {
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  subtitle: {
    fontSize: 13,
    color: 'var(--text-muted)',
  },
  sliderContainer: {
    marginBottom: 16,
  },
  sliderTrack: {
    position: 'relative' as const,
    height: 8,
    background: 'var(--bg-base)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  sliderInput: {
    position: 'absolute' as const,
    width: '100%',
    height: '100%',
    opacity: 0,
    cursor: 'pointer',
    zIndex: 2,
  },
  percentageDisplay: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'baseline',
    gap: 4,
    marginBottom: 12,
  },
  percentageValue: {
    fontSize: 36,
    fontWeight: 800,
    lineHeight: 1,
  },
  percentageLabel: {
    fontSize: 16,
    color: 'var(--text-muted)',
    fontWeight: 500,
  },
  levelBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderRadius: 20,
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: 'var(--text-secondary)',
    textAlign: 'center' as const,
    marginBottom: 16,
  },
  previewBox: {
    background: 'var(--bg-base)',
    borderRadius: 12,
    padding: 16,
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
  },
  previewItem: {
    flex: 1,
    textAlign: 'center' as const,
  },
  previewIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 8px',
  },
  previewLabel: {
    fontSize: 12,
    color: 'var(--text-muted)',
    marginBottom: 4,
  },
  previewValue: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  tickMarks: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: 8,
    padding: '0 4px',
  },
  tickMark: {
    fontSize: 11,
    color: 'var(--text-muted)',
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

export function RetentionSlider({
  value,
  onChange,
  disabled = false,
  showPreview = true,
}: RetentionSliderProps) {
  const [localValue, setLocalValue] = useState(value);
  
  const percentage = Math.round(localValue * 100);
  const retentionInfo = getRetentionDescription(localValue);
  const reviewImpact = estimateReviewImpact(DEFAULT_RETENTION, localValue);
  
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value);
    setLocalValue(newValue);
  }, []);
  
  const handleChangeEnd = useCallback(() => {
    onChange(localValue);
  }, [localValue, onChange]);
  
  // Calculate fill percentage for slider track
  const fillPercentage = ((localValue - MIN_RETENTION) / (MAX_RETENTION - MIN_RETENTION)) * 100;
  
  return (
    <div style={{
      ...styles.container,
      opacity: disabled ? 0.6 : 1,
      pointerEvents: disabled ? 'none' : 'auto',
    }}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.iconWrapper}>
          <Icons.Brain />
        </div>
        <div>
          <div style={styles.title}>Retenção Desejada</div>
          <div style={styles.subtitle}>Ajuste seu custo-benefício</div>
        </div>
      </div>
      
      {/* Percentage Display */}
      <div style={styles.percentageDisplay}>
        <span style={{
          ...styles.percentageValue,
          color: retentionInfo.color,
        }}>
          {percentage}
        </span>
        <span style={styles.percentageLabel}>%</span>
      </div>
      
      {/* Level Badge */}
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <span style={{
          ...styles.levelBadge,
          background: `${retentionInfo.color}20`,
          color: retentionInfo.color,
        }}>
          <Icons.Target />
          {retentionInfo.label}
        </span>
      </div>
      
      {/* Description */}
      <p style={styles.description}>
        {retentionInfo.description}
      </p>
      
      {/* Slider */}
      <div style={styles.sliderContainer}>
        <div style={styles.sliderTrack}>
          {/* Fill */}
          <div style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: `${fillPercentage}%`,
            background: `linear-gradient(90deg, ${retentionInfo.color}80, ${retentionInfo.color})`,
            borderRadius: 4,
            transition: 'width 0.1s ease-out',
          }} />
          
          {/* Input */}
          <input
            type="range"
            min={MIN_RETENTION}
            max={MAX_RETENTION}
            step={0.01}
            value={localValue}
            onChange={handleChange}
            onMouseUp={handleChangeEnd}
            onTouchEnd={handleChangeEnd}
            style={styles.sliderInput}
            disabled={disabled}
          />
          
          {/* Thumb indicator */}
          <div style={{
            position: 'absolute',
            left: `${fillPercentage}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: 'white',
            border: `3px solid ${retentionInfo.color}`,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            pointerEvents: 'none',
            transition: 'left 0.1s ease-out',
          }} />
        </div>
        
        {/* Tick marks */}
        <div style={styles.tickMarks}>
          <span style={styles.tickMark}>70%</span>
          <span style={styles.tickMark}>80%</span>
          <span style={styles.tickMark}>90%</span>
          <span style={styles.tickMark}>99%</span>
        </div>
      </div>
      
      {/* Preview */}
      {showPreview && (
        <div style={styles.previewBox}>
          <div style={styles.previewItem}>
            <div style={{
              ...styles.previewIcon,
              background: 'rgba(245, 158, 11, 0.15)',
              color: '#F59E0B',
            }}>
              <Icons.Flame />
            </div>
            <div style={styles.previewLabel}>Revisões</div>
            <div style={styles.previewValue}>
              {reviewImpact > 0 ? '+' : ''}{reviewImpact}%
            </div>
          </div>
          
          <div style={{
            width: 1,
            background: 'var(--border)',
          }} />
          
          <div style={styles.previewItem}>
            <div style={{
              ...styles.previewIcon,
              background: 'rgba(34, 197, 94, 0.15)',
              color: '#22C55E',
            }}>
              <Icons.Zap />
            </div>
            <div style={styles.previewLabel}>Memória</div>
            <div style={styles.previewValue}>
              {percentage >= 95 ? 'Forte' : percentage >= 90 ? 'Boa' : percentage >= 85 ? 'Ok' : 'Fraca'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// COMPACT VARIANT
// ============================================================================

interface RetentionBadgeProps {
  value: number;
  onClick?: () => void;
}

export function RetentionBadge({ value, onClick }: RetentionBadgeProps) {
  const percentage = Math.round(value * 100);
  const info = getRetentionDescription(value);
  
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 14px',
        background: `${info.color}15`,
        border: `1px solid ${info.color}40`,
        borderRadius: 10,
        fontSize: 14,
        fontWeight: 600,
        color: info.color,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s ease',
      }}
    >
      <Icons.Target />
      {percentage}% Retenção
    </button>
  );
}

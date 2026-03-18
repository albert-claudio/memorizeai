import React from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  style?: React.CSSProperties;
  className?: string;
}

export function Skeleton({
  width = '100%',
  height = 20,
  borderRadius = 8,
  style,
  className,
}: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className ?? ''}`}
      style={{
        width,
        height,
        borderRadius,
        background: 'rgba(255, 255, 255, 0.06)',
        ...style,
      }}
    />
  );
}

export function SkeletonCard({ style }: { style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: 16,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        ...style,
      }}
    >
      <Skeleton width={48} height={48} borderRadius={12} />
      <Skeleton width="70%" height={16} />
      <Skeleton width="45%" height={12} />
      <Skeleton width="100%" height={8} borderRadius={4} />
    </div>
  );
}

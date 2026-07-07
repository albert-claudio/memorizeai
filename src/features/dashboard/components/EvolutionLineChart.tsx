'use client';

import { useId } from 'react';
import type { ChartPoint } from '@/features/dashboard/utils/dashboardPresentation';
import { tokens } from '@/features/dashboard/components/StudyDashboard/tokens';

function buildLinePath(values: number[], width: number, height: number): string {
  if (values.length === 0) return '';

  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - (value / 100) * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

export interface EvolutionLineChartProps {
  series: ChartPoint[];
  accentColor?: string;
  height?: number;
  showLabels?: boolean;
}

export function EvolutionLineChart({
  series,
  accentColor = tokens.accent,
  height = 200,
  showLabels = true,
}: EvolutionLineChartProps) {
  const glowId = useId();
  const width = 640;
  const scores = series.map((p) => (p.value == null ? 0 : p.value));
  const path = buildLinePath(scores, width, height);
  const lastWithData = [...series].reverse().find((p) => p.hasData);

  return (
    <div>
      <div className="study-chart-scroll">
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} aria-label="Gráfico de evolução">
          <defs>
            <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {[0, 50, 100].map((grid) => {
            const y = height - (grid / 100) * height;
            return (
              <g key={grid}>
                <line
                  x1="0"
                  y1={y}
                  x2={width}
                  y2={y}
                  stroke="rgba(255,255,255,0.06)"
                  strokeDasharray="4 6"
                />
                <text x="0" y={Math.max(y - 6, 12)} fill={tokens.textMuted} fontSize="11">
                  {grid}%
                </text>
              </g>
            );
          })}
          {path && (
            <>
              <path
                d={path}
                fill="none"
                stroke={accentColor}
                strokeWidth="6"
                strokeLinecap="round"
                opacity="0.25"
              />
              <path
                d={path}
                fill="none"
                stroke={accentColor}
                strokeWidth="3"
                strokeLinecap="round"
                filter={`url(#${glowId})`}
              />
            </>
          )}
          {series.map((point, index) => {
            const x = series.length === 1 ? width / 2 : (index / (series.length - 1)) * width;
            const score = point.value ?? 0;
            const y = height - (score / 100) * height;

            return (
              <g key={point.day}>
                <circle
                  cx={x}
                  cy={y}
                  r={point.hasData ? 6 : 4}
                  fill={point.hasData ? '#fff' : 'rgba(255,255,255,0.2)'}
                  stroke={accentColor}
                  strokeWidth="2"
                />
                {lastWithData?.day === point.day && point.hasData && point.value != null && (
                  <g>
                    <rect
                      x={x - 22}
                      y={y - 36}
                      width="44"
                      height="22"
                      rx="6"
                      fill={tokens.cardBg}
                      stroke={tokens.cardBorder}
                    />
                    <text
                      x={x}
                      y={y - 20}
                      textAnchor="middle"
                      fill={accentColor}
                      fontSize="11"
                      fontWeight="700"
                    >
                      {point.value}%
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {showLabels && (
        <div className="study-chart-labels">
          {series.map((point) => (
            <div key={point.day} className="study-chart-label-item" style={{ padding: '4px 2px' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: tokens.textMuted, marginBottom: 2 }}>
                {point.label}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: tokens.textPrimary }}>
                {point.value == null ? '--' : `${point.value}%`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


import { useEffect, useState } from 'react';

interface ScoreOverviewProps {
  acertos: number;
  total: number;
}

function useAnimatedCounter(target: number, duration: number = 1500, delay: number = 300) {
  const [count, setCount] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  
  useEffect(() => {
    const startTimeout = setTimeout(() => {
      setHasStarted(true);
    }, delay);
    
    return () => clearTimeout(startTimeout);
  }, [delay]);
  
  useEffect(() => {
    if (!hasStarted) return;
    
    const startTime = Date.now();
    const startValue = 0;
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const currentValue = Math.round(startValue + (target - startValue) * eased);
      setCount(currentValue);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  }, [target, duration, hasStarted]);
  
  return { count, hasStarted };
}

export function ScoreOverview({ acertos, total }: ScoreOverviewProps) {
  const percentage = Math.round((acertos / total) * 100);
  const { count: animatedPercentage } = useAnimatedCounter(percentage);
  
  const isPassed = percentage >= 70;
  const color = isPassed ? '#22c55e' : '#ef4444';
  const radius = 70;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (animatedPercentage / 100) * circumference;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      marginBottom: 32,
    }}>
      <div style={{ position: 'relative', width: 160, height: 160, marginBottom: 16 }}>
        <svg width={160} height={160} style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx={80}
            cy={80}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={10}
          />
          <circle
            cx={80}
            cy={80}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ 
              transition: 'stroke-dashoffset 0.1s linear',
            }}
          />
        </svg>
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <span style={{ fontSize: 36, fontWeight: 800, color: 'white' }}>
            {animatedPercentage}%
          </span>
          <span style={{ fontSize: 13, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Acertos
          </span>
        </div>
      </div>
      
      <div style={{
        fontSize: 24,
        fontWeight: 700,
        color: color,
        marginBottom: 8,
      }}>
        {isPassed ? 'Aprovado! 🎉' : 'Reprovado 📚'}
      </div>
      <p style={{ color: '#888' }}>
        Você acertou {acertos} de {total} questões
      </p>
    </div>
  );
}

'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

// ============================================================================
// TYPES
// ============================================================================

interface Questao {
  id: string;
  numero: number;
  enunciado: string;
  alternativa_a: string;
  alternativa_b: string;
  alternativa_c: string;
  alternativa_d: string;
  alternativa_e: string;
  resposta_correta: string;
  comentario: string;
}

interface RespostaComQuestao {
  id: string;
  questao_id: string;
  resposta_usuario: string | null;
  correta: boolean | null;
  questao: Questao;
}

interface Simulado {
  id: string;
  titulo: string;
  total_questoes: number;
  acertos: number;
  erros: number;
  status: string;
  iniciado_em: number | null;
  finalizado_em: number | null;
}

// ============================================================================
// ICONS
// ============================================================================

const Icons = {
  ArrowLeft: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12,19 5,12 12,5"/>
    </svg>
  ),
  Check: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20,6 9,17 4,12"/>
    </svg>
  ),
  X: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  Trophy: () => (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
      <path d="M4 22h16"/>
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
    </svg>
  ),
  Loader: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  ),
  ChevronDown: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  ),
};

// ============================================================================
// ANIMATED COUNTER HOOK
// ============================================================================

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
      
      // Easing function: easeOutExpo for dramatic reveal
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

// ============================================================================
// ANIMATED PROGRESS RING COMPONENT
// ============================================================================

function AnimatedProgressRing({ 
  percentage, 
  size = 160, 
  strokeWidth = 10,
  duration = 1500,
  delay = 300,
}: { 
  percentage: number; 
  size?: number; 
  strokeWidth?: number;
  duration?: number;
  delay?: number;
}) {
  const [animatedPercentage, setAnimatedPercentage] = useState(0);
  const [currentColor, setCurrentColor] = useState('#52525b');
  const [hasStarted, setHasStarted] = useState(false);
  
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (animatedPercentage / 100) * circumference;
  
  const isPassed = percentage >= 70;
  const finalColor = isPassed ? '#22c55e' : '#ef4444';
  
  useEffect(() => {
    const startTimeout = setTimeout(() => {
      setHasStarted(true);
    }, delay);
    
    return () => clearTimeout(startTimeout);
  }, [delay]);
  
  useEffect(() => {
    if (!hasStarted) return;
    
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing: easeOutExpo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      
      setAnimatedPercentage(percentage * eased);
      
      // Color transition: gray -> final color
      if (progress < 0.3) {
        setCurrentColor('#52525b');
      } else {
        // Interpolate from gray to final color
        const colorProgress = (progress - 0.3) / 0.7;
        if (colorProgress >= 1) {
          setCurrentColor(finalColor);
        } else {
          // Simple transition - snap to final color at ~50%
          setCurrentColor(colorProgress > 0.5 ? finalColor : '#71717a');
        }
      }
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  }, [percentage, duration, hasStarted, finalColor]);
  
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      {/* Glow effect */}
      <div style={{
        position: 'absolute',
        inset: -20,
        background: `radial-gradient(circle, ${finalColor}20 0%, transparent 70%)`,
        opacity: hasStarted ? 1 : 0,
        transition: 'opacity 0.5s ease',
        pointerEvents: 'none',
      }} />
      
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={currentColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ 
            filter: hasStarted ? `drop-shadow(0 0 8px ${currentColor})` : 'none',
            transition: 'filter 0.3s ease',
          }}
        />
      </svg>
    </div>
  );
}

// ============================================================================
// STRUCTURED COMMENT COMPONENT
// ============================================================================

interface ParsedComment {
  correctLetter: string;
  correctExplanation: string;
  wrongExplanations: { letter: string; explanation: string }[];
  source: string;
}

function parseStructuredComment(comentario: string): ParsedComment | null {
  // Try to parse the structured format: ##CORRETA: X## ... ##ERRADAS## ... ##FONTE## ...
  const correctMatch = comentario.match(/##CORRETA:\s*([A-E])##\s*([^#]*?)(?=##ERRADAS|##FONTE|$)/i);
  const wrongMatch = comentario.match(/##ERRADAS##\s*([^#]*?)(?=##FONTE|$)/i);
  const sourceMatch = comentario.match(/##FONTE##\s*(.*)$/i);
  
  if (!correctMatch) return null;
  
  const correctLetter = correctMatch[1].toUpperCase();
  const correctExplanation = correctMatch[2].trim();
  
  // Parse wrong explanations
  const wrongExplanations: { letter: string; explanation: string }[] = [];
  if (wrongMatch) {
    const wrongText = wrongMatch[1];
    // Match patterns like "A) explanation" or "A: explanation"
    const wrongPatterns = wrongText.matchAll(/([A-E])[):\s]+([^A-E]*?)(?=(?:[A-E][):\s])|$)/gi);
    for (const match of wrongPatterns) {
      const letter = match[1].toUpperCase();
      const explanation = match[2].trim();
      if (explanation && letter !== correctLetter) {
        wrongExplanations.push({ letter, explanation });
      }
    }
  }
  
  const source = sourceMatch ? sourceMatch[1].trim() : '';
  
  return {
    correctLetter,
    correctExplanation,
    wrongExplanations,
    source,
  };
}

function StructuredComment({ 
  comentario, 
  respostaUsuario,
  respostaCorreta,
}: { 
  comentario: string;
  respostaUsuario: string | null;
  respostaCorreta: string;
}) {
  const parsed = parseStructuredComment(comentario);
  const isUserWrong = respostaUsuario && respostaUsuario !== respostaCorreta;
  
  // Fallback to plain text if parsing fails
  if (!parsed) {
    return (
      <div style={{
        padding: 18,
        background: 'rgba(99, 102, 241, 0.08)',
        borderRadius: 14,
        borderLeft: '4px solid #6366f1',
      }}>
        <div style={{ 
          fontSize: 12, 
          fontWeight: 600, 
          color: '#818cf8', 
          marginBottom: 10,
          letterSpacing: '0.02em',
        }}>
          📚 COMENTÁRIO
        </div>
        <p style={{ 
          fontSize: 14, 
          lineHeight: 1.7, 
          color: '#a1a1aa',
          whiteSpace: 'pre-wrap',
        }}>
          {comentario}
        </p>
      </div>
    );
  }
  
  // Find the user's wrong explanation if they got it wrong
  const userWrongExplanation = isUserWrong 
    ? parsed.wrongExplanations.find(w => w.letter === respostaUsuario)
    : null;
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Why user was wrong (if applicable) */}
      {userWrongExplanation && (
        <div style={{
          padding: 16,
          background: 'rgba(239, 68, 68, 0.08)',
          borderRadius: 14,
          borderLeft: '4px solid #ef4444',
        }}>
          <div style={{ 
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12, 
            fontWeight: 700, 
            color: '#f87171', 
            marginBottom: 10,
            letterSpacing: '0.02em',
          }}>
            <span style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: '#ef4444',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 700,
            }}>
              {respostaUsuario}
            </span>
            POR QUE SUA RESPOSTA ESTÁ ERRADA
          </div>
          <p style={{ 
            fontSize: 14, 
            lineHeight: 1.6, 
            color: '#fca5a5',
          }}>
            {userWrongExplanation.explanation}
          </p>
        </div>
      )}
      
      {/* Correct Answer Explanation */}
      <div style={{
        padding: 16,
        background: 'rgba(34, 197, 94, 0.08)',
        borderRadius: 14,
        borderLeft: '4px solid #22c55e',
      }}>
        <div style={{ 
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12, 
          fontWeight: 700, 
          color: '#4ade80', 
          marginBottom: 10,
          letterSpacing: '0.02em',
        }}>
          <span style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: '#22c55e',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
          }}>
            {parsed.correctLetter}
          </span>
          RESPOSTA CORRETA
        </div>
        <p style={{ 
          fontSize: 14, 
          lineHeight: 1.6, 
          color: '#86efac',
        }}>
          {parsed.correctExplanation}
        </p>
      </div>
      
      {/* PDF Source */}
      {parsed.source && (
        <div style={{
          padding: 16,
          background: 'rgba(99, 102, 241, 0.08)',
          borderRadius: 14,
          borderLeft: '4px solid #6366f1',
        }}>
          <div style={{ 
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12, 
            fontWeight: 700, 
            color: '#818cf8', 
            marginBottom: 10,
            letterSpacing: '0.02em',
          }}>
            📄 FONTE DO PDF
          </div>
          <p style={{ 
            fontSize: 13, 
            lineHeight: 1.6, 
            color: '#a1a1aa',
            fontStyle: 'italic',
            paddingLeft: 12,
            borderLeft: '2px solid rgba(99, 102, 241, 0.3)',
          }}>
            "{parsed.source}"
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// EXPANDABLE QUESTION COMPONENT
// ============================================================================

function ExpandableQuestion({ 
  resposta, 
  isExpanded, 
  onToggle 
}: { 
  resposta: RespostaComQuestao;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  
  const isCorrect = resposta.correta;
  const questao = resposta.questao;
  
  const alternatives: Record<string, string> = {
    A: questao.alternativa_a,
    B: questao.alternativa_b,
    C: questao.alternativa_c,
    D: questao.alternativa_d,
    E: questao.alternativa_e,
  };
  
  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [isExpanded]);
  
  return (
    <div 
      style={{
        background: '#111111',
        borderRadius: 18,
        overflow: 'hidden',
        border: isCorrect 
          ? '1px solid rgba(34, 197, 94, 0.25)' 
          : resposta.resposta_usuario 
          ? '1px solid rgba(239, 68, 68, 0.25)'
          : '1px solid rgba(255,255,255,0.06)',
        transition: 'all 0.25s ease',
      }}
    >
      {/* Question Header */}
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 22,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: '#f4f4f5',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: isCorrect 
              ? 'rgba(34, 197, 94, 0.15)' 
              : resposta.resposta_usuario
              ? 'rgba(239, 68, 68, 0.15)'
              : 'rgba(255,255,255,0.05)',
            border: `1px solid ${isCorrect 
              ? 'rgba(34, 197, 94, 0.3)' 
              : resposta.resposta_usuario
              ? 'rgba(239, 68, 68, 0.3)'
              : 'rgba(255,255,255,0.08)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isCorrect ? '#4ade80' : resposta.resposta_usuario ? '#f87171' : '#71717a',
          }}>
            {isCorrect ? <Icons.Check /> : resposta.resposta_usuario ? <Icons.X /> : '?'}
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 600, fontSize: 15, letterSpacing: '-0.01em' }}>
              Questão {questao.numero}
            </div>
            <div style={{ fontSize: 13, color: '#71717a', marginTop: 2 }}>
              {resposta.resposta_usuario 
                ? `Sua resposta: ${resposta.resposta_usuario}` 
                : 'Não respondida'
              }
              {resposta.resposta_usuario && !isCorrect && (
                <span style={{ color: '#4ade80' }}> • Correta: {questao.resposta_correta}</span>
              )}
            </div>
          </div>
        </div>
        <div style={{
          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          color: '#52525b',
        }}>
          <Icons.ChevronDown />
        </div>
      </button>
      
      {/* Expandable Content with smooth animation */}
      <div style={{
        maxHeight: isExpanded ? contentHeight : 0,
        overflow: 'hidden',
        transition: 'max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        <div ref={contentRef} style={{
          padding: '0 22px 22px',
          borderTop: '1px solid rgba(255,255,255,0.05)',
        }}>
          {/* Enunciado */}
          <div style={{
            padding: '18px 0',
            fontSize: 14,
            lineHeight: 1.7,
            color: '#a1a1aa',
          }}>
            {questao.enunciado}
          </div>
          
          {/* Alternatives */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
            {['A', 'B', 'C', 'D', 'E'].map(letter => {
              const isUserAnswer = resposta.resposta_usuario === letter;
              const isCorrectAnswer = questao.resposta_correta === letter;
              
              let bgColor = 'rgba(255,255,255,0.03)';
              let borderColor = 'rgba(255,255,255,0.06)';
              
              if (isCorrectAnswer) {
                bgColor = 'rgba(34, 197, 94, 0.1)';
                borderColor = 'rgba(34, 197, 94, 0.3)';
              } else if (isUserAnswer && !isCorrect) {
                bgColor = 'rgba(239, 68, 68, 0.1)';
                borderColor = 'rgba(239, 68, 68, 0.3)';
              }
              
              return (
                <div
                  key={letter}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 14,
                    padding: 14,
                    background: bgColor,
                    border: `1px solid ${borderColor}`,
                    borderRadius: 12,
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    background: isCorrectAnswer ? '#22c55e' : isUserAnswer ? '#ef4444' : 'rgba(255,255,255,0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: 13,
                    flexShrink: 0,
                    color: isCorrectAnswer || isUserAnswer ? 'white' : '#71717a',
                    boxShadow: isCorrectAnswer 
                      ? '0 0 12px rgba(34, 197, 94, 0.4)' 
                      : isUserAnswer && !isCorrect 
                      ? '0 0 12px rgba(239, 68, 68, 0.4)' 
                      : 'none',
                  }}>
                    {letter}
                  </div>
                  <p style={{ fontSize: 14, lineHeight: 1.6, paddingTop: 4, color: '#e4e4e7' }}>
                    {alternatives[letter]}
                  </p>
                </div>
              );
            })}
          </div>
          
          {/* Comentário Estruturado */}
          {questao.comentario && (
            <StructuredComment 
              comentario={questao.comentario} 
              respostaUsuario={resposta.resposta_usuario}
              respostaCorreta={questao.resposta_correta}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ResultadoPage() {
  const router = useRouter();
  const params = useParams();
  const simuladoId = params.id as string;
  
  const [loading, setLoading] = useState(true);
  const [simulado, setSimulado] = useState<Simulado | null>(null);
  const [respostas, setRespostas] = useState<RespostaComQuestao[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const loadResultado = async () => {
      const supabase = createClient();
      
      // Get simulado
      const { data: sim, error: simError } = await supabase
        .from('simulados')
        .select('*')
        .eq('id', simuladoId)
        .single();
      
      if (simError || !sim) {
        console.error('Simulado not found:', simError);
        router.push('/dashboard');
        return;
      }
      
      // If not completed, redirect to simulado page
      if (sim.status !== 'concluido') {
        router.push(`/simulado/${simuladoId}`);
        return;
      }
      
      setSimulado(sim);
      
      // Get respostas with questoes
      const { data: rs, error: rsError } = await supabase
        .from('simulado_respostas')
        .select(`
          *,
          questao:simulado_questoes(*)
        `)
        .eq('simulado_id', simuladoId)
        .order('questao(numero)', { ascending: true });
      
      if (rsError) {
        console.error('Respostas not found:', rsError);
        return;
      }
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const formattedRespostas = rs?.map((r: any) => ({
        ...r,
        questao: r.questao,
      })) || [];
      
      // Sort by question number
      formattedRespostas.sort((a: RespostaComQuestao, b: RespostaComQuestao) => 
        a.questao.numero - b.questao.numero
      );
      
      setRespostas(formattedRespostas);
      setLoading(false);
    };
    
    loadResultado();
  }, [simuladoId, router]);

  // Use animated counter
  const percentage = simulado ? Math.round((simulado.acertos / simulado.total_questoes) * 100) : 0;
  const { count: animatedPercentage, hasStarted } = useAnimatedCounter(percentage, 1500, 500);
  
  const grade = percentage >= 70 ? 'Aprovado' : 'Reprovado';
  const gradeColor = percentage >= 70 ? '#22c55e' : '#ef4444';

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

  if (!simulado) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
        color: '#f4f4f5',
      }}>
        Resultado não encontrado
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#f4f4f5' }}>
      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.8);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>

      {/* Header with Glassmorphism */}
      <header style={{
        padding: '16px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        background: 'rgba(15, 15, 15, 0.8)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}>
        <Link
          href="/dashboard"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 42,
            height: 42,
            borderRadius: 12,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#71717a',
            textDecoration: 'none',
            transition: 'all 0.2s ease',
          }}
        >
          <Icons.ArrowLeft />
        </Link>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>Resultado do Simulado</h1>
          <p style={{ fontSize: 13, color: '#71717a', marginTop: 2 }}>{simulado.titulo}</p>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
        
        {/* Score Card with Animations */}
        <div style={{
          background: '#111111',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 28,
          padding: 40,
          textAlign: 'center',
          marginBottom: 40,
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Background glow */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 300,
            height: 300,
            background: `radial-gradient(circle, ${gradeColor}15 0%, transparent 70%)`,
            opacity: hasStarted ? 1 : 0,
            transition: 'opacity 1s ease',
            pointerEvents: 'none',
          }} />
          
          {/* Animated Progress Ring with Counter */}
          <div style={{
            position: 'relative',
            width: 160,
            height: 160,
            margin: '0 auto 28px',
            animation: 'scaleIn 0.6s ease forwards',
          }}>
            <AnimatedProgressRing 
              percentage={percentage}
              size={160}
              strokeWidth={10}
              duration={1500}
              delay={500}
            />
            
            {/* Counter in center */}
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <div style={{
                fontSize: 48,
                fontWeight: 800,
                color: hasStarted ? gradeColor : '#52525b',
                letterSpacing: '-0.04em',
                transition: 'color 0.5s ease',
                lineHeight: 1,
              }}>
                {animatedPercentage}%
              </div>
            </div>
          </div>
          
          {/* Grade Badge */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 24px',
            background: `${gradeColor}15`,
            border: `1px solid ${gradeColor}30`,
            color: gradeColor,
            borderRadius: 100,
            fontWeight: 700,
            fontSize: 14,
            marginBottom: 28,
            animation: 'fadeInUp 0.6s ease forwards',
            animationDelay: '1.5s',
            opacity: 0,
            letterSpacing: '0.02em',
          }}>
            {percentage >= 70 ? '🏆' : '📚'} {grade}
          </div>
          
          {/* Stats */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 40,
            animation: 'fadeInUp 0.6s ease forwards',
            animationDelay: '1.8s',
            opacity: 0,
          }}>
            <div>
              <div style={{ 
                fontSize: 32, 
                fontWeight: 700, 
                color: '#4ade80',
                letterSpacing: '-0.02em',
              }}>
                {simulado.acertos}
              </div>
              <div style={{ fontSize: 13, color: '#71717a', fontWeight: 500, marginTop: 4 }}>Acertos</div>
            </div>
            <div style={{ width: 1, background: 'rgba(255,255,255,0.08)' }} />
            <div>
              <div style={{ 
                fontSize: 32, 
                fontWeight: 700, 
                color: '#f87171',
                letterSpacing: '-0.02em',
              }}>
                {simulado.erros}
              </div>
              <div style={{ fontSize: 13, color: '#71717a', fontWeight: 500, marginTop: 4 }}>Erros</div>
            </div>
            <div style={{ width: 1, background: 'rgba(255,255,255,0.08)' }} />
            <div>
              <div style={{ 
                fontSize: 32, 
                fontWeight: 700, 
                color: '#52525b',
                letterSpacing: '-0.02em',
              }}>
                {simulado.total_questoes - simulado.acertos - simulado.erros}
              </div>
              <div style={{ fontSize: 13, color: '#71717a', fontWeight: 500, marginTop: 4 }}>Em branco</div>
            </div>
          </div>
        </div>

        {/* Questions Review */}
        <h2 style={{ 
          fontSize: 22, 
          fontWeight: 700, 
          marginBottom: 20,
          letterSpacing: '-0.02em',
        }}>
          Gabarito Comentado
        </h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {respostas.map((r) => (
            <ExpandableQuestion
              key={r.id}
              resposta={r}
              isExpanded={expandedId === r.id}
              onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
            />
          ))}
        </div>

        {/* Action Buttons */}
        <div style={{ 
          marginTop: 40,
          display: 'flex',
          gap: 16,
        }}>
          <Link
            href="/dashboard"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '18px 24px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 14,
              color: '#e4e4e7',
              fontSize: 15,
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'all 0.2s ease',
            }}
          >
            Voltar ao Dashboard
          </Link>
          <Link
            href="/dashboard/runs"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '18px 24px',
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              border: 'none',
              borderRadius: 14,
              color: 'white',
              fontSize: 15,
              fontWeight: 600,
              textDecoration: 'none',
              boxShadow: '0 0 24px rgba(99, 102, 241, 0.3)',
              transition: 'all 0.2s ease',
            }}
          >
            Novo Simulado
          </Link>
        </div>
      </main>
    </div>
  );
}

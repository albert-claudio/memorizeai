
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { simuladoService, type Simulado, type Questao } from '../services/simuladoService';

export function useSimuladoSession(simuladoId: string, userId: string | undefined) {
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [simulado, setSimulado] = useState<Simulado | null>(null);
  const [questoes, setQuestoes] = useState<Questao[]>([]);
  const [respostas, setRespostas] = useState<Map<string, string | null>>(new Map());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!userId) return;

    const loadSession = async () => {
      try {
        setLoading(true);
        const sim = await simuladoService.getSimulado(simuladoId, userId);
        if (!sim) {
          router.push('/dashboard');
          return;
        }
        setSimulado(sim);

        const qs = await simuladoService.getQuestoes(simuladoId);
        setQuestoes(qs);

        const rs = await simuladoService.getRespostas(simuladoId);
        if (rs) {
          const map = new Map<string, string | null>();
          rs.forEach((r) => map.set(r.questao_id, r.resposta_usuario));
          setRespostas(map);
        }

        if (sim.status === 'pendente') {
          await simuladoService.startSimulado(simuladoId);
        }
      } catch (err) {
        console.error('Error loading simulado:', err);
      } finally {
        setLoading(false);
      }
    };

    loadSession();
  }, [simuladoId, userId, router]);

  const handleSelectAlternative = useCallback(async (questionId: string, alternative: string) => {
    setRespostas(prev => new Map(prev).set(questionId, alternative));
    
    // Optimistic update, background save
    try {
      await simuladoService.submitAnswer(simuladoId, questionId, alternative);
    } catch (err) {
      console.error('Failed to save answer:', err);
    }
  }, [simuladoId]);

  const handleFinish = async () => {
    setSubmitting(true);
    
    let acertos = 0;
    let erros = 0;
    
    questoes.forEach(q => {
      const resposta = respostas.get(q.id);
      if (resposta === q.resposta_correta) acertos++;
      else erros++;
    });

    try {
      await simuladoService.finishSimulado(simuladoId, acertos, erros, respostas, questoes);
      router.push(`/simulado/${simuladoId}/resultado`);
    } catch (err) {
      console.error('Error finishing simulado:', err);
      setSubmitting(false);
    }
  };

  const nav = {
    next: () => setCurrentIndex(prev => Math.min(questoes.length - 1, prev + 1)),
    prev: () => setCurrentIndex(prev => Math.max(0, prev - 1)),
    jumpTo: (index: number) => setCurrentIndex(index),
    canNext: currentIndex < questoes.length - 1,
    canPrev: currentIndex > 0,
  };

  return {
    loading,
    simulado,
    questoes,
    respostas,
    currentQuestion: questoes[currentIndex],
    currentIndex,
    submitting,
    answeredCount: Array.from(respostas.values()).filter(Boolean).length,
    handlers: {
      selectAlternative: handleSelectAlternative,
      finish: handleFinish,
    },
    nav
  };
}

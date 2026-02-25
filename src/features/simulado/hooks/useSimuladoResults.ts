
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { simuladoService, type Simulado, type ValidatedRespostaComQuestao } from '../services/simuladoService';

// Re-export for backward compatibility — any consumer importing from this hook
// gets the same type as the service returns (questao guaranteed non-null).
export type RespostaComQuestao = ValidatedRespostaComQuestao;

export function useSimuladoResults(simuladoId: string, userId: string | undefined) {
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [simulado, setSimulado] = useState<Simulado | null>(null);
  const [respostas, setRespostas] = useState<ValidatedRespostaComQuestao[]>([]);

  useEffect(() => {
    if (!userId) return;

    const loadResults = async () => {
      try {
        setLoading(true);
        const sim = await simuladoService.getSimulado(simuladoId, userId);
        
        if (!sim) {
          router.push('/dashboard');
          return;
        }
        
        if (sim.status !== 'concluido') {
          router.push(`/simulado/${simuladoId}`);
          return;
        }
        
        setSimulado(sim);

        const rs = await simuladoService.getRespostasComQuestoes(simuladoId);
        setRespostas(rs);
        
      } catch (err) {
        console.error('Error loading results:', err);
      } finally {
        setLoading(false);
      }
    };

    loadResults();
  }, [simuladoId, userId, router]);

  return {
    loading,
    simulado,
    respostas,
  };
}

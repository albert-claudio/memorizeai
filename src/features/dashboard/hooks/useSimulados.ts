
import { useState, useEffect, useCallback } from 'react';
import type { Simulado } from '@/app/dashboard/components';
import { simuladoService } from '../services/simuladoService';

export function useSimulados(userId: string | undefined) {
  const [simulados, setSimulados] = useState<Simulado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSimulados = useCallback(async () => {
    if (!userId) return;
    
    try {
      setLoading(true);
      const data = await simuladoService.getSimulados(userId);
      setSimulados(data);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch simulados';
      console.error('Error fetching simulados:', err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchSimulados();
  }, [fetchSimulados]);

  return {
    simulados,
    loading,
    error,
    refreshSimulados: fetchSimulados
  };
}

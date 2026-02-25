
import { useState, useEffect, useCallback } from 'react';
import type { Source } from '@/lib/types';
import { sourceService } from '../services/sourceService';

export function useSources(userId: string | undefined) {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSources = useCallback(async () => {
    if (!userId) return;
    
    try {
      setLoading(true);
      const data = await sourceService.getSources(userId);
      setSources(data);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch sources';
      console.error('Error fetching sources:', err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  return {
    sources,
    loading,
    error,
    refreshSources: fetchSources
  };
}

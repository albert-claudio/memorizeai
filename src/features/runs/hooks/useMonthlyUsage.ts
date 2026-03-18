
import { useState, useEffect } from 'react';
import { getMonthlyUsage } from '@/app/actions/createRun';
import type { MonthlyUsage } from '@/lib/billing/run-entitlement';

export function useMonthlyUsage() {
  const [usage, setUsage] = useState<MonthlyUsage | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUsage = async () => {
    try {
      const data = await getMonthlyUsage();
      setUsage(data);
    } catch (err) {
      console.error('Failed to fetch monthly usage:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsage();
  }, []);

  return {
    usage,
    loading,
    refreshUsage: fetchUsage,
  };
}

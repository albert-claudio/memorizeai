/**
 * @deprecated Use useMonthlyUsage instead.
 * This file is kept for backwards compatibility but is no longer used.
 */

import { useState, useEffect } from 'react';
import { getMonthlyUsage } from '@/app/actions/createRun';
import type { MonthlyUsage } from '@/lib/billing/run-entitlement';

/** @deprecated Use useMonthlyUsage instead */
export function useCredits() {
  const [usage, setUsage] = useState<MonthlyUsage | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCredits = async () => {
    try {
      const data = await getMonthlyUsage();
      setUsage(data);
    } catch (err) {
      console.error('Failed to fetch usage:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCredits();
  }, []);

  // Shimmed credits interface for backwards compat
  const credits = usage ? {
    planRunsRemaining: 0,
    extraCredits: 0,
    totalCredits: 0,
  } : null;

  const deductCredit = () => {};

  return {
    credits,
    loading,
    deductCredit,
    refreshCredits: fetchCredits
  };
}


import { createClient } from '@/lib/supabase/client';
import type { Run } from '@/lib/types';

export const runService = {
  async getRun(runId: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('runs')
      .select('*')
      .eq('id', runId)
      .single();

    if (error) throw error;
    return data as Run;
  }
};


import { createClient } from '@/lib/supabase/client';
import type { Source } from '@/lib/types';

export const sourceService = {
  async getSources(userId: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('sources')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['concluido'])
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as Source[];
  }
};

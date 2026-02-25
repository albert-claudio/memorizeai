
import { createClient } from '@/lib/supabase/client';
import type { Simulado } from '@/app/dashboard/components'; // Assuming types are exported from here or can be moved to types.ts later

export const simuladoService = {
  async getSimulados(userId: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('simulados')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as Simulado[];
  }
};

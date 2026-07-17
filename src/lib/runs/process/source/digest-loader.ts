import type { SupabaseClient } from '@supabase/supabase-js';
import { formatDigestForFlashcards, type SourceDigestRow } from '@/lib/source-digest';
import type { AIProvider } from '@/lib/ai/types';

export async function loadSourceDigest(supabase: SupabaseClient, sourceId: string, provider: AIProvider): Promise<{ digest: SourceDigestRow; context: string } | null> {
  const { data } = await supabase.from('source_digests').select('*').eq('source_id', sourceId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  const digest = data as SourceDigestRow;
  const context = formatDigestForFlashcards(digest.content_json, provider, false);
  return context ? { digest, context } : null;
}


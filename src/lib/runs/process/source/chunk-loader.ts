import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChunkWithContext, ProcessLogger } from '../contracts';

const CHUNK_LOOKUP_RETRY_DELAYS_MS = [150, 500];

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchSourceChunksWithRetry(
  supabase: SupabaseClient,
  sourceId: string,
  sourceName: string,
  renewLease?: (context: string) => Promise<void>,
  log: ProcessLogger = () => {},
): Promise<ChunkWithContext[]> {
  for (let attempt = 0; attempt <= CHUNK_LOOKUP_RETRY_DELAYS_MS.length; attempt++) {
    await renewLease?.(`chunk-lookup-${attempt + 1}`);

    const { data: sourceChunks } = await supabase
      .from("source_chunks")
      .select(`
        position,
        chunks:chunk_id (
          id,
          content,
          page_number
        )
      `)
      .eq("source_id", sourceId)
      .order("position", { ascending: true });

    const sourceChunkCount = sourceChunks?.length ?? 0;
    const missingJoinedChunks = (sourceChunks ?? []).filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sc: any) => !sc.chunks || !sc.chunks.id || !sc.chunks.content,
    ).length;

    log(
      'Chunks',
      `Lookup attempt ${attempt + 1}: source_chunks=${sourceChunkCount}, missing_joins=${missingJoinedChunks}`,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chunks: ChunkWithContext[] = (sourceChunks ?? []).flatMap((sc: any) => {
      if (!sc.chunks?.id || !sc.chunks?.content) return [];
      return [{
        id: sc.chunks.id,
        content: sc.chunks.content,
        pageNumber: sc.chunks.page_number,
        sourceId,
        sourceName,
        position: sc.position,
      }];
    });

    if (chunks.length > 0) {
      if (missingJoinedChunks > 0) {
        log(
          'Chunks',
          `Proceeding with ${chunks.length} resolved chunks after ${missingJoinedChunks} null joins`,
        );
      }
      return chunks;
    }

    if (attempt < CHUNK_LOOKUP_RETRY_DELAYS_MS.length) {
      await sleep(CHUNK_LOOKUP_RETRY_DELAYS_MS[attempt]);
    }
  }

  throw new Error(`Transient chunk lookup: no chunks found for this source (${sourceId})`);
}

export async function fetchSourceChunksByIdsWithRetry(
  supabase: SupabaseClient,
  sourceId: string,
  sourceName: string,
  chunkIds: string[],
  renewLease?: (context: string) => Promise<void>,
  log: ProcessLogger = () => {},
): Promise<ChunkWithContext[]> {
  const uniqueChunkIds = Array.from(new Set(chunkIds.filter(Boolean)));
  if (uniqueChunkIds.length === 0) return [];

  for (let attempt = 0; attempt <= CHUNK_LOOKUP_RETRY_DELAYS_MS.length; attempt++) {
    await renewLease?.(`digest-chunk-lookup-${attempt + 1}`);

    const { data: sourceChunks } = await supabase
      .from("source_chunks")
      .select(`
        position,
        chunks:chunk_id (
          id,
          content,
          page_number
        )
      `)
      .eq("source_id", sourceId)
      .in("chunk_id", uniqueChunkIds)
      .order("position", { ascending: true });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chunks: ChunkWithContext[] = (sourceChunks ?? []).flatMap((sc: any) => {
      if (!sc.chunks?.id || !sc.chunks?.content) return [];
      return [{
        id: sc.chunks.id,
        content: sc.chunks.content,
        pageNumber: sc.chunks.page_number,
        sourceId,
        sourceName,
        position: sc.position,
      }];
    });

    if (chunks.length > 0) {
      log(
        'Chunks',
        `Digest lookup resolved ${chunks.length}/${uniqueChunkIds.length} referenced chunks`,
      );
      return chunks;
    }

    if (attempt < CHUNK_LOOKUP_RETRY_DELAYS_MS.length) {
      await sleep(CHUNK_LOOKUP_RETRY_DELAYS_MS[attempt]);
    }
  }

  return [];
}


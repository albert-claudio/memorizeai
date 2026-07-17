import type { ProcessLogger, SourceRef } from '../contracts';

export function validateGeneratedItems(
  items: unknown[],
  validChunkIds: Set<string>,
  chunkContentMap: Map<string, string>,
  log: ProcessLogger = () => {},
): unknown[] {
  const validIdArray = [...validChunkIds];
  let salvaged = 0;
  let dropped = 0;

  // Try to find the best matching valid chunk ID for an invalid one
  // The AI often truncates, abbreviates, or slightly alters UUIDs
  function findBestMatch(invalidId: string): string | null {
    if (!invalidId) return validIdArray[0] || null;

    // Try substring match (AI might truncate the ID)
    for (const validId of validIdArray) {
      if (validId.includes(invalidId) || invalidId.includes(validId)) {
        return validId;
      }
    }

    // Try prefix match (first 8 chars of UUID)
    const prefix = invalidId.slice(0, 8).toLowerCase();
    for (const validId of validIdArray) {
      if (validId.toLowerCase().startsWith(prefix)) {
        return validId;
      }
    }

    // Fallback: assign the first valid chunk ID
    return validIdArray[0] || null;
  }

  const validated = items.filter(item => {
    const typed = item as { chunkId?: string; citationExcerpt?: string; sources?: SourceRef[] };

    // Check if chunkId is valid
    if (!typed.chunkId || !validChunkIds.has(typed.chunkId)) {
      // SALVAGE: try to assign a valid chunk ID instead of dropping
      const match = findBestMatch(typed.chunkId || '');
      if (match) {
        typed.chunkId = match;
        // Clear citation excerpt since it may not match the reassigned chunk
        typed.citationExcerpt = '';
        salvaged++;
      } else {
        dropped++;
        return false;
      }
    }

    // Citation excerpt should appear in the chunk content (fuzzy: first 40 chars)
    if (typed.citationExcerpt && typed.citationExcerpt.length > 10) {
      const chunkContent = chunkContentMap.get(typed.chunkId) || '';
      const excerptStart = typed.citationExcerpt.slice(0, 40).toLowerCase();
      if (!chunkContent.toLowerCase().includes(excerptStart)) {
        // Citation doesn't match — still keep the item but clear the excerpt
        typed.citationExcerpt = '';
      }
    }

    // Validate multi-source references: remove invalid entries, keep valid ones
    if (typed.sources && Array.isArray(typed.sources)) {
      typed.sources = typed.sources.filter(src => {
        if (!src.chunkId || !validChunkIds.has(src.chunkId)) {
          // Try to salvage multi-source references too
          const srcMatch = findBestMatch(src.chunkId || '');
          if (srcMatch) {
            src.chunkId = srcMatch;
            src.citationExcerpt = '';
            return true;
          }
          return false;
        }
        // Fuzzy-validate citation excerpt against chunk content
        if (src.citationExcerpt && src.citationExcerpt.length > 10) {
          const srcContent = chunkContentMap.get(src.chunkId) || '';
          const srcStart = src.citationExcerpt.slice(0, 40).toLowerCase();
          if (!srcContent.toLowerCase().includes(srcStart)) {
            src.citationExcerpt = '';
          }
        }
        return true;
      });
    }

    return true;
  });

  if (salvaged > 0 || dropped > 0) {
    log('Validate', `Validation: ${validated.length} kept, ${salvaged} salvaged (bad chunkId reassigned), ${dropped} dropped`);
  }

  return validated;
}


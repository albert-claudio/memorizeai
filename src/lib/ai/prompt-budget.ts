export interface PromptBudgetChunk {
  content: string;
  position: number;
}

/**
 * Limit chunks to fit within a rough prompt token budget.
 * Uses a representative sample first, then fills remaining capacity.
 *
 * Rough estimate used by the app: 1 token ~= 4 chars, plus metadata overhead.
 */
export function selectChunksWithinTokenBudget<T extends PromptBudgetChunk>(
  chunks: T[],
  maxChars: number = 12000,
  metadataCharsPerChunk: number = 100,
): T[] {
  const selected: T[] = [];
  let totalChars = 0;

  if (chunks.length === 0 || maxChars <= 0) {
    return selected;
  }

  const step = Math.max(1, Math.floor(chunks.length / 10));
  const priorityIndices = new Set<number>();

  for (let i = 0; i < chunks.length; i += step) {
    priorityIndices.add(i);
  }

  for (const idx of priorityIndices) {
    const chunk = chunks[idx];
    if (!chunk) continue;

    const chunkSize = chunk.content.length + metadataCharsPerChunk;
    if (totalChars + chunkSize <= maxChars) {
      selected.push(chunk);
      totalChars += chunkSize;
    }
  }

  for (let i = 0; i < chunks.length && totalChars < maxChars; i++) {
    if (priorityIndices.has(i)) continue;

    const chunk = chunks[i];
    const chunkSize = chunk.content.length + metadataCharsPerChunk;
    if (totalChars + chunkSize <= maxChars) {
      selected.push(chunk);
      totalChars += chunkSize;
    }
  }

  selected.sort((a, b) => a.position - b.position);
  return selected;
}

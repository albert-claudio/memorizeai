/**
 * Chunk Ranker — BM25-lite relevance scoring for chunk selection.
 *
 * Instead of selecting evenly-spaced chunks (positional sampling), this module
 * scores each chunk against a set of topic keywords and returns the most
 * relevant ones. No external dependencies — pure term-frequency scoring.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ScoredChunk<T> {
  chunk: T;
  score: number;
}

// ============================================================================
// TEXT NORMALIZATION
// ============================================================================

/** Portuguese stop words to ignore during scoring */
const STOP_WORDS = new Set([
  'a', 'o', 'e', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos',
  'nas', 'um', 'uma', 'uns', 'umas', 'por', 'para', 'com', 'sem', 'que',
  'se', 'ou', 'ao', 'aos', 'não', 'mais', 'como', 'mas', 'são', 'sua',
  'seu', 'seus', 'suas', 'os', 'as', 'é', 'foi', 'ser', 'ter', 'está',
  'pelo', 'pela', 'entre', 'sobre', 'este', 'esta', 'esse', 'essa',
  'isso', 'isto', 'aquele', 'aquela', 'cada', 'todo', 'toda', 'todos',
]);

/**
 * Normalize text for scoring: lowercase, remove accents, split into tokens.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9\s]/g, ' ')   // remove punctuation
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

// ============================================================================
// SCORING
// ============================================================================

/**
 * IDF-like boost: keywords that appear in fewer chunks get higher weight.
 * Returns a map from keyword → boost factor.
 */
function computeIdfBoosts<T>(
  chunks: T[],
  keywords: string[],
  getContent: (chunk: T) => string,
): Map<string, number> {
  const N = chunks.length;
  const boosts = new Map<string, number>();

  for (const kw of keywords) {
    let docsWithTerm = 0;
    for (const chunk of chunks) {
      const content = getContent(chunk).toLowerCase();
      if (content.includes(kw)) {
        docsWithTerm++;
      }
    }
    // IDF = log(N / (1 + docsWithTerm))
    boosts.set(kw, Math.log((N + 1) / (1 + docsWithTerm)));
  }

  return boosts;
}

/**
 * Score a chunk using TF-IDF-lite against keyword set with IDF boosts.
 */
function tfidfScore(
  tokens: string[],
  keywordSet: Set<string>,
  idfBoosts: Map<string, number>,
): number {
  if (tokens.length === 0) return 0;

  let score = 0;
  for (const token of tokens) {
    if (keywordSet.has(token)) {
      const boost = idfBoosts.get(token) ?? 1;
      score += boost;
    }
  }

  return score / tokens.length;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Rank chunks by relevance to a set of keywords.
 * Returns the top `maxChunks` chunks sorted by score (highest first).
 *
 * @param chunks - Array of chunks to rank
 * @param keywords - Keywords/phrases to rank against (from topic extraction)
 * @param maxChunks - Maximum number of chunks to return
 * @param getContent - Function to extract text content from a chunk
 * @param maxChars - Optional character budget; stops adding chunks once exceeded
 */
export function rankChunksByRelevance<T>(
  chunks: T[],
  keywords: string[],
  maxChunks: number,
  getContent: (chunk: T) => string,
  maxChars?: number,
): T[] {
  if (chunks.length === 0 || keywords.length === 0) {
    return chunks.slice(0, maxChunks);
  }

  // Normalize keywords
  const normalizedKeywords = keywords.flatMap(kw => tokenize(kw));
  const keywordSet = new Set(normalizedKeywords);

  if (keywordSet.size === 0) {
    return chunks.slice(0, maxChunks);
  }

  // Compute IDF boosts
  const idfBoosts = computeIdfBoosts(chunks, normalizedKeywords, getContent);

  // Score each chunk
  const scored: ScoredChunk<T>[] = chunks.map(chunk => {
    const tokens = tokenize(getContent(chunk));
    const score = tfidfScore(tokens, keywordSet, idfBoosts);
    return { chunk, score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Select top chunks within budget
  const selected: T[] = [];
  let totalChars = 0;

  for (const { chunk, score } of scored) {
    if (selected.length >= maxChunks) break;
    if (score === 0 && selected.length > 0) break; // Don't include irrelevant chunks

    const contentLen = getContent(chunk).length;
    if (maxChars && totalChars + contentLen > maxChars) continue; // Skip but try next

    selected.push(chunk);
    totalChars += contentLen;
  }

  return selected;
}

/**
 * Simple text deduplication using Jaccard similarity on word sets.
 * Returns items from `texts` that are sufficiently unique (Jaccard < threshold).
 */
export function deduplicateByJaccard<T>(
  items: T[],
  getText: (item: T) => string,
  threshold: number = 0.8,
): T[] {
  const unique: T[] = [];
  const tokenSets: Set<string>[] = [];

  for (const item of items) {
    const tokens = new Set(tokenize(getText(item)));

    let isDuplicate = false;
    for (const existingSet of tokenSets) {
      const intersection = new Set([...tokens].filter(t => existingSet.has(t)));
      const union = new Set([...tokens, ...existingSet]);
      const jaccard = union.size > 0 ? intersection.size / union.size : 0;

      if (jaccard >= threshold) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      unique.push(item);
      tokenSets.push(tokens);
    }
  }

  return unique;
}

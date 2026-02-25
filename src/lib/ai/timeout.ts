/**
 * Fetch wrapper with an AbortSignal timeout.
 * Use this for every external AI API call to prevent serverless function hangs.
 *
 * Usage:
 *   const response = await fetchWithTimeout(url, options);          // 60 s default
 *   const response = await fetchWithTimeout(url, options, 30_000);  // custom
 */

export const AI_TIMEOUT_MS = 60_000; // 60 seconds — adjust per SLO

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = AI_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`AI call timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

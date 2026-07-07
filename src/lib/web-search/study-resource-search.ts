import { load } from 'cheerio';
import type { StudyResource } from '@/features/simulado/types/studyRecommendations';
import { sanitizePlainText } from '@/lib/security/xss';

const MAX_RESULTS_PER_TOPIC = 3;
const SEARCH_TIMEOUT_MS = 6500;
const SEARCH_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
];

type SearchProvider = 'brave' | 'tavily' | 'serpapi' | 'bing' | 'duckduckgo';

interface SearchEnv {
  [key: string]: string | undefined;
  BRAVE_SEARCH_API_KEY?: string;
  TAVILY_API_KEY?: string;
  SERPAPI_API_KEY?: string;
  BING_SEARCH_API_KEY?: string;
  STUDY_WEB_SEARCH_PROVIDER?: string;
  WEB_SEARCH_PROVIDER?: string;
  STUDY_WEB_SEARCH_ALLOW_SCRAPE?: string;
}

interface SearchOptions {
  env?: SearchEnv;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

interface ProviderAttempt {
  provider: SearchProvider;
  search: () => Promise<StudyResource[]>;
}

export async function searchStudyResources(
  query: string,
  options: SearchOptions = {},
): Promise<StudyResource[]> {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) {
    return [];
  }

  const attempts = buildProviderAttempts(normalizedQuery, options);

  for (const attempt of attempts) {
    try {
      const resources = await attempt.search();
      if (resources.length > 0) {
        return supplementWithFallback(resources, normalizedQuery);
      }
    } catch (error) {
      console.warn(`[study-resource-search] ${attempt.provider} fallback:`, error);
    }
  }

  return buildFallbackResources(normalizedQuery);
}

function buildProviderAttempts(query: string, options: SearchOptions): ProviderAttempt[] {
  const env = options.env ?? process.env;
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? SEARCH_TIMEOUT_MS;
  const providerOrder = getProviderOrder(env);

  return providerOrder
    .map((provider): ProviderAttempt | null => {
      if (provider === 'brave' && env.BRAVE_SEARCH_API_KEY) {
        return {
          provider,
          search: () => searchBrave(query, env.BRAVE_SEARCH_API_KEY!, fetchFn, timeoutMs),
        };
      }

      if (provider === 'tavily' && env.TAVILY_API_KEY) {
        return {
          provider,
          search: () => searchTavily(query, env.TAVILY_API_KEY!, fetchFn, timeoutMs),
        };
      }

      if (provider === 'serpapi' && env.SERPAPI_API_KEY) {
        return {
          provider,
          search: () => searchSerpApi(query, env.SERPAPI_API_KEY!, fetchFn, timeoutMs),
        };
      }

      if (provider === 'bing' && env.BING_SEARCH_API_KEY) {
        return {
          provider,
          search: () => searchBing(query, env.BING_SEARCH_API_KEY!, fetchFn, timeoutMs),
        };
      }

      if (provider === 'duckduckgo' && allowDuckDuckGoScrape(env)) {
        return {
          provider,
          search: () => scrapeDuckDuckGo(query, fetchFn, timeoutMs),
        };
      }

      return null;
    })
    .filter((attempt): attempt is ProviderAttempt => Boolean(attempt));
}

function getProviderOrder(env: SearchEnv): SearchProvider[] {
  const requested = normalizeProvider(env.STUDY_WEB_SEARCH_PROVIDER ?? env.WEB_SEARCH_PROVIDER);
  const ordered: SearchProvider[] = [];

  if (requested) {
    ordered.push(requested);
  } else {
    if (env.BRAVE_SEARCH_API_KEY) ordered.push('brave');
    if (env.TAVILY_API_KEY) ordered.push('tavily');
    if (env.SERPAPI_API_KEY) ordered.push('serpapi');
    if (env.BING_SEARCH_API_KEY) ordered.push('bing');
  }

  if (allowDuckDuckGoScrape(env)) {
    ordered.push('duckduckgo');
  }

  return [...new Set(ordered)];
}

function normalizeProvider(value: string | undefined): SearchProvider | null {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === 'brave' ||
    normalized === 'tavily' ||
    normalized === 'serpapi' ||
    normalized === 'bing' ||
    normalized === 'duckduckgo'
  ) {
    return normalized;
  }

  return null;
}

function allowDuckDuckGoScrape(env: SearchEnv): boolean {
  return ['1', 'true', 'yes'].includes(env.STUDY_WEB_SEARCH_ALLOW_SCRAPE?.trim().toLowerCase() ?? '');
}

async function searchBrave(
  query: string,
  apiKey: string,
  fetchFn: typeof fetch,
  timeoutMs: number,
): Promise<StudyResource[]> {
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(MAX_RESULTS_PER_TOPIC));
  url.searchParams.set('country', 'br');
  url.searchParams.set('search_lang', 'pt-br');
  url.searchParams.set('safesearch', 'moderate');

  const payload = await fetchJson<{
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  }>(url.toString(), {
    fetchFn,
    timeoutMs,
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': apiKey,
    },
  });

  return normalizeApiResults(
    payload.web?.results?.map((item) => ({
      title: item.title,
      url: item.url,
      snippet: item.description,
    })) ?? [],
  );
}

async function searchTavily(
  query: string,
  apiKey: string,
  fetchFn: typeof fetch,
  timeoutMs: number,
): Promise<StudyResource[]> {
  const payload = await fetchJson<{
    results?: Array<{ title?: string; url?: string; content?: string; snippet?: string }>;
  }>('https://api.tavily.com/search', {
    fetchFn,
    timeoutMs,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: MAX_RESULTS_PER_TOPIC,
      search_depth: 'basic',
      include_answer: false,
      include_raw_content: false,
    }),
  });

  return normalizeApiResults(
    payload.results?.map((item) => ({
      title: item.title,
      url: item.url,
      snippet: item.content ?? item.snippet,
    })) ?? [],
  );
}

async function searchSerpApi(
  query: string,
  apiKey: string,
  fetchFn: typeof fetch,
  timeoutMs: number,
): Promise<StudyResource[]> {
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google');
  url.searchParams.set('q', query);
  url.searchParams.set('hl', 'pt-br');
  url.searchParams.set('gl', 'br');
  url.searchParams.set('num', String(MAX_RESULTS_PER_TOPIC));
  url.searchParams.set('api_key', apiKey);

  const payload = await fetchJson<{
    organic_results?: Array<{ title?: string; link?: string; snippet?: string }>;
  }>(url.toString(), { fetchFn, timeoutMs });

  return normalizeApiResults(
    payload.organic_results?.map((item) => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet,
    })) ?? [],
  );
}

async function searchBing(
  query: string,
  apiKey: string,
  fetchFn: typeof fetch,
  timeoutMs: number,
): Promise<StudyResource[]> {
  const url = new URL('https://api.bing.microsoft.com/v7.0/search');
  url.searchParams.set('q', query);
  url.searchParams.set('mkt', 'pt-BR');
  url.searchParams.set('count', String(MAX_RESULTS_PER_TOPIC));
  url.searchParams.set('safeSearch', 'Moderate');

  const payload = await fetchJson<{
    webPages?: { value?: Array<{ name?: string; url?: string; snippet?: string }> };
  }>(url.toString(), {
    fetchFn,
    timeoutMs,
    headers: {
      Accept: 'application/json',
      'Ocp-Apim-Subscription-Key': apiKey,
    },
  });

  return normalizeApiResults(
    payload.webPages?.value?.map((item) => ({
      title: item.name,
      url: item.url,
      snippet: item.snippet,
    })) ?? [],
  );
}

async function scrapeDuckDuckGo(
  query: string,
  fetchFn: typeof fetch,
  timeoutMs: number,
): Promise<StudyResource[]> {
  const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=br-pt`;
  const response = await fetchWithTimeout(searchUrl, {
    fetchFn,
    timeoutMs,
    cache: 'no-store',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.7',
      'User-Agent': pickSearchUserAgent(),
    },
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo search failed with status ${response.status}`);
  }

  return parseDuckDuckGoResults(await response.text()).slice(0, MAX_RESULTS_PER_TOPIC);
}

async function fetchJson<T>(
  url: string,
  options: RequestInit & { fetchFn: typeof fetch; timeoutMs: number },
): Promise<T> {
  const { fetchFn, timeoutMs, ...init } = options;
  const response = await fetchWithTimeout(url, { ...init, fetchFn, timeoutMs });

  if (!response.ok) {
    throw new Error(`Search provider failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit & { fetchFn: typeof fetch; timeoutMs: number },
): Promise<Response> {
  const { fetchFn, timeoutMs, signal, ...init } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    if (signal.aborted) controller.abort();
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    return await fetchFn(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function normalizeApiResults(
  items: Array<{ title?: string; url?: string; snippet?: string }>,
): StudyResource[] {
  const resources: StudyResource[] = [];
  const seenUrls = new Set<string>();

  for (const item of items) {
    if (resources.length >= MAX_RESULTS_PER_TOPIC) break;

    const url = normalizeResultUrl(item.url ?? '');
    if (!url || seenUrls.has(url)) continue;

    const title = cleanSearchText(item.title ?? '');
    if (!title) continue;

    const source = getHostname(url);
    if (!source) continue;

    seenUrls.add(url);
    resources.push({
      title: trimText(title, 110),
      url,
      snippet: trimText(cleanSearchText(item.snippet ?? '') || 'Material encontrado na busca para revisar este ponto.', 180),
      source,
    });
  }

  return resources;
}

export function parseDuckDuckGoResults(html: string): StudyResource[] {
  const $ = load(html);
  const resources: StudyResource[] = [];
  const seenUrls = new Set<string>();

  const pushResource = (rawHref: string | undefined, rawTitle: string, rawSnippet?: string) => {
    if (resources.length >= MAX_RESULTS_PER_TOPIC) return;

    const url = normalizeResultUrl(rawHref ?? '');
    if (!url || seenUrls.has(url)) return;

    const title = cleanSearchText(rawTitle);
    if (!title) return;

    const snippet = cleanSearchText(rawSnippet ?? '') || 'Material encontrado na busca para revisar este ponto.';
    const source = getHostname(url);

    if (!source || source.includes('duckduckgo.com')) return;

    seenUrls.add(url);
    resources.push({
      title: trimText(title, 110),
      url,
      snippet: trimText(snippet, 180),
      source,
    });
  };

  $('.result, .web-result, .results_links, article').each((_, element) => {
    if (resources.length >= MAX_RESULTS_PER_TOPIC) return false;

    const block = $(element);
    const blockClass = block.attr('class') ?? '';
    const badgeText = cleanSearchText(block.find('.badge--ad, .result__badge, [data-testid*="ad"]').text());

    if (blockClass.includes('result--ad') || /\b(anuncio|ad|ads)\b/i.test(badgeText)) {
      return undefined;
    }

    const anchor = block
      .find('a.result__a, a[data-testid="result-title-a"], h2 a, a[href*="uddg="]')
      .filter((_, candidate) => Boolean(cleanSearchText($(candidate).text())))
      .first();

    if (anchor.length === 0) return undefined;

    const snippet = block
      .find('.result__snippet, [data-result="snippet"], .snippet, .result-snippet')
      .first()
      .text();

    pushResource(anchor.attr('href'), anchor.text(), snippet);
    return undefined;
  });

  if (resources.length < MAX_RESULTS_PER_TOPIC) {
    $('a.result__a, a[href*="uddg="]').each((_, anchorElement) => {
      if (resources.length >= MAX_RESULTS_PER_TOPIC) return false;

      const anchor = $(anchorElement);
      pushResource(anchor.attr('href'), anchor.text());
      return undefined;
    });
  }

  return resources;
}

function normalizeResultUrl(rawHref: string): string | null {
  try {
    const decodedHref = decodeHtml(rawHref);
    const normalizedHref = decodedHref.toLowerCase();

    if (
      normalizedHref.includes('/y.js') ||
      normalizedHref.includes('ad_domain=') ||
      normalizedHref.includes('ad_provider=') ||
      normalizedHref.includes('devex,')
    ) {
      return null;
    }

    let parsed = new URL(decodedHref, 'https://duckduckgo.com');
    const redirectedUrl = parsed.searchParams.get('uddg');

    if (parsed.hostname.endsWith('duckduckgo.com') && redirectedUrl) {
      parsed = new URL(redirectedUrl);
    }

    if (!isAllowedPublicHttpUrl(parsed)) {
      return null;
    }

    if (parsed.hostname.endsWith('duckduckgo.com') && !redirectedUrl) {
      return null;
    }

    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

export function buildFallbackResources(query: string): StudyResource[] {
  const safeQuery = normalizeSearchQuery(query);
  const compactQuery = trimText(safeQuery || 'estudo dirigido', 90);

  return [
    {
      title: `Revisar: ${compactQuery}`,
      url: `https://duckduckgo.com/?q=${encodeURIComponent(safeQuery)}`,
      snippet: 'Pesquisa pronta com os termos extraidos das questoes erradas deste simulado.',
      source: 'duckduckgo.com',
    },
    {
      title: `Videoaulas: ${compactQuery}`,
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${safeQuery} aula`)}`,
      snippet: 'Busca focada em explicacoes em video para revisar rapidamente antes de refazer questoes.',
      source: 'youtube.com',
    },
    {
      title: `Exercicios: ${compactQuery}`,
      url: `https://www.google.com/search?q=${encodeURIComponent(`${safeQuery} exercicios resolvidos`)}`,
      snippet: 'Busca focada em listas, exercicios resolvidos e exemplos praticos sobre este ponto fraco.',
      source: 'google.com',
    },
  ];
}

function supplementWithFallback(resources: StudyResource[], query: string): StudyResource[] {
  const result: StudyResource[] = [];
  const seenUrls = new Set<string>();

  for (const resource of [...resources, ...buildFallbackResources(query)]) {
    if (result.length >= MAX_RESULTS_PER_TOPIC) break;

    const url = normalizeSupplementUrl(resource.url);
    if (!url || seenUrls.has(url)) continue;

    seenUrls.add(url);
    result.push({
      ...resource,
      url,
    });
  }

  return result;
}

function normalizeSupplementUrl(rawHref: string): string | null {
  try {
    const parsed = new URL(decodeHtml(rawHref));
    if (!isAllowedPublicHttpUrl(parsed)) {
      return null;
    }

    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeSearchQuery(query: string): string {
  return sanitizePlainText(query, 180).replace(/\s+/g, ' ').trim();
}

function isAllowedPublicHttpUrl(parsed: URL): boolean {
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (
    hostname === 'localhost' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local')
  ) {
    return false;
  }

  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    const [a, b] = hostname.split('.').map((part) => Number(part));
    if (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) {
      return false;
    }
  }

  return true;
}

function pickSearchUserAgent(): string {
  return SEARCH_USER_AGENTS[Math.floor(Math.random() * SEARCH_USER_AGENTS.length)];
}

function cleanSearchText(value: string): string {
  return sanitizePlainText(decodeHtml(value), 1000);
}

function decodeHtml(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    quot: '"',
  };

  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (_, entity: string) => namedEntities[entity] ?? `&${entity};`);
}

function trimText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}...`;
}

function getHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

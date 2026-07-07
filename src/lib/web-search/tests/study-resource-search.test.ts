import { describe, expect, it, vi } from 'vitest';
import {
  buildFallbackResources,
  parseDuckDuckGoResults,
  searchStudyResources,
} from '../study-resource-search';

function jsonResponse(payload: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('study resource cloud search', () => {
  it('uses a configured API provider before scraping fallback', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      web: {
        results: [
          {
            title: 'Direito administrativo - atos administrativos',
            url: 'https://example.edu/atos-administrativos',
            description: 'Resumo objetivo com exemplos.',
          },
        ],
      },
    }));
    const fetchFn = fetchMock as unknown as typeof fetch;

    const resources = await searchStudyResources('atos administrativos exemplos', {
      env: {
        STUDY_WEB_SEARCH_PROVIDER: 'brave',
        BRAVE_SEARCH_API_KEY: 'brave_test_key',
        STUDY_WEB_SEARCH_ALLOW_SCRAPE: 'false',
      },
      fetchFn,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const fetchCalls = fetchMock.mock.calls as unknown as Array<[unknown, unknown?]>;
    expect(String(fetchCalls[0][0])).toContain('api.search.brave.com');
    expect(resources).toHaveLength(3);
    expect(resources[0]).toEqual(expect.objectContaining({
      title: 'Direito administrativo - atos administrativos',
      url: 'https://example.edu/atos-administrativos',
      source: 'example.edu',
    }));
    expect(resources.slice(1).map((resource) => resource.source)).toEqual([
      'duckduckgo.com',
      'youtube.com',
    ]);
  });

  it('supplements sparse provider results with deterministic study links', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      results: [
        {
          title: 'Resumo de competencia no processo civil',
          url: 'https://example.org/processo-civil',
          content: 'Competencia, exemplos e exercicios comentados.',
        },
      ],
    }));
    const fetchFn = fetchMock as unknown as typeof fetch;

    const resources = await searchStudyResources('competencia processo civil', {
      env: {
        STUDY_WEB_SEARCH_PROVIDER: 'tavily',
        TAVILY_API_KEY: 'tavily_test_key',
        STUDY_WEB_SEARCH_ALLOW_SCRAPE: 'false',
      },
      fetchFn,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resources).toHaveLength(3);
    expect(resources[0]).toMatchObject({
      title: 'Resumo de competencia no processo civil',
      source: 'example.org',
    });
    expect(resources[1]).toMatchObject({
      title: 'Revisar: competencia processo civil',
      source: 'duckduckgo.com',
    });
    expect(resources[2]).toMatchObject({
      title: 'Videoaulas: competencia processo civil',
      source: 'youtube.com',
    });
  });

  it('returns deterministic fallback resources when every cloud provider fails', async () => {
    const fetchMock = vi.fn(async () => new Response('rate limited', { status: 429 }));
    const fetchFn = fetchMock as unknown as typeof fetch;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      const resources = await searchStudyResources('competencia processo civil', {
        env: {
          STUDY_WEB_SEARCH_PROVIDER: 'brave',
          BRAVE_SEARCH_API_KEY: 'brave_test_key',
          STUDY_WEB_SEARCH_ALLOW_SCRAPE: 'false',
        },
        fetchFn,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('brave fallback'),
        expect.any(Error),
      );
      expect(resources).toHaveLength(3);
      expect(resources[0]).toMatchObject({
        title: 'Revisar: competencia processo civil',
        source: 'duckduckgo.com',
      });
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('does not scrape DuckDuckGo unless explicitly enabled', async () => {
    const fetchMock = vi.fn(async () => new Response('<html></html>'));
    const fetchFn = fetchMock as unknown as typeof fetch;

    const resources = await searchStudyResources('competencia processo civil', {
      env: {},
      fetchFn,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(resources.map((resource) => resource.source)).toEqual([
      'duckduckgo.com',
      'youtube.com',
      'google.com',
    ]);
  });

  it('can parse DuckDuckGo HTML results without exposing DuckDuckGo redirect URLs', () => {
    const html = `
      <div class="result">
        <a class="result__a" href="/l/?uddg=${encodeURIComponent('https://material.test/topico?x=1#frag')}">
          Aula de direito constitucional
        </a>
        <a class="result__snippet">Resumo com jurisprudencia e exemplos.</a>
      </div>
    `;

    const resources = parseDuckDuckGoResults(html);

    expect(resources).toEqual([
      {
        title: 'Aula de direito constitucional',
        url: 'https://material.test/topico?x=1',
        snippet: 'Resumo com jurisprudencia e exemplos.',
        source: 'material.test',
      },
    ]);
  });

  it('strips HTML-like payloads from third-party search text', () => {
    const html = `
      <div class="result">
        <a class="result__a" href="/l/?uddg=${encodeURIComponent('https://material.test/xss')}">
          &lt;script&gt;alert('hack')&lt;/script&gt; Direito administrativo
        </a>
        <a class="result__snippet">Resumo &lt;img src=x onerror=alert(1)&gt; com exemplos.</a>
      </div>
    `;

    const resources = parseDuckDuckGoResults(html);

    expect(resources[0]).toMatchObject({
      title: "alert('hack') Direito administrativo",
      snippet: 'Resumo com exemplos.',
      source: 'material.test',
    });
    expect(resources[0].title).not.toContain('<script>');
    expect(resources[0].snippet).not.toContain('<img');
  });

  it('drops unsafe result URLs from third-party HTML', () => {
    const html = `
      <div class="result">
        <a class="result__a" href="/l/?uddg=${encodeURIComponent('javascript:alert(1)')}">Bad scheme</a>
      </div>
      <div class="result">
        <a class="result__a" href="/l/?uddg=${encodeURIComponent('http://127.0.0.1/admin')}">Localhost</a>
      </div>
      <div class="result">
        <a class="result__a" href="/l/?uddg=${encodeURIComponent('https://safe.example/a#secret')}">Safe material</a>
      </div>
    `;

    const resources = parseDuckDuckGoResults(html);

    expect(resources).toEqual([
      {
        title: 'Safe material',
        url: 'https://safe.example/a',
        snippet: 'Material encontrado na busca para revisar este ponto.',
        source: 'safe.example',
      },
    ]);
  });

  it('keeps manual fallback links available even with an empty query helper call', () => {
    const resources = buildFallbackResources('<script>alert(1)</script> excecoes responsabilidade civil');

    expect(resources.map((resource) => resource.source)).toEqual([
      'duckduckgo.com',
      'youtube.com',
      'google.com',
    ]);
    expect(resources[0].title).not.toContain('<script>');
  });
});

'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icons } from '@/features/deck/components/Icons';
import type { RespostaComQuestao } from '@/features/simulado/hooks/useSimuladoResults';
import type {
  ReinforcementFlashcardsResponse,
  StudyResource,
  StudyRecommendation,
  StudyRecommendationsResponse,
} from '@/features/simulado/types/studyRecommendations';
import { buildWeakTopicSummaries } from '@/features/simulado/utils/resultAnalysis';

interface StudyRecommendationsProps {
  simuladoId: string;
  acertos: number;
  totalQuestoes: number;
  respostas: RespostaComQuestao[];
}

type LoadStatus = 'idle' | 'loading' | 'success' | 'error';
type GenerationStatus = 'idle' | 'loading' | 'success' | 'error';

export function StudyRecommendations({ simuladoId, acertos, totalQuestoes, respostas }: StudyRecommendationsProps) {
  const weakTopics = useMemo(() => buildWeakTopicSummaries(respostas), [respostas]);
  const reviewTotal = Math.max(0, totalQuestoes - acertos);
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [recommendations, setRecommendations] = useState<StudyRecommendation[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (reviewTotal === 0) {
      setStatus('success');
      setRecommendations([]);
      return;
    }

    let cancelled = false;

    async function loadRecommendations() {
      setStatus('loading');
      setErrorMessage(null);

      try {
        const response = await fetch('/api/simulado/study-recommendations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ simuladoId }),
        });
        const payload = await response.json().catch(() => null) as StudyRecommendationsResponse | { error?: string } | null;

        if (!response.ok) {
          throw new Error(payload && 'error' in payload && payload.error ? payload.error : 'Falha ao buscar recomendacoes');
        }

        if (!isStudyRecommendationsResponse(payload)) {
          throw new Error('Resposta invalida ao buscar recomendacoes');
        }

        if (!cancelled) {
          setRecommendations(normalizeRecommendations(payload.recommendations));
          setStatus('success');
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Falha ao buscar recomendacoes');
          setStatus('error');
        }
      }
    }

    loadRecommendations();

    return () => {
      cancelled = true;
    };
  }, [simuladoId, reviewTotal, reloadKey]);

  if (reviewTotal === 0) {
    return (
      <section style={sectionStyle}>
        <Header status="Dominado" />
        <p style={{ fontSize: 14, color: '#a1a1aa', lineHeight: 1.55 }}>
          Nenhum ponto fraco foi detectado neste simulado. Para continuar evoluindo, gere um simulado mais dificil ou com outra banca.
        </p>
      </section>
    );
  }

  return (
    <section style={sectionStyle}>
      <Header status={status === 'loading' ? 'Buscando' : status === 'error' ? 'Fallback' : 'Web'} />

      {status === 'loading' && (
        <div style={{ display: 'grid', gap: 12 }}>
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="skeleton"
              style={{
                height: 118,
                borderRadius: 14,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.05)',
              }}
            />
          ))}
        </div>
      )}

      {status === 'error' && (
        <div style={{ marginBottom: 14, padding: 14, borderRadius: 14, background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
          <p style={{ fontSize: 13, color: '#fde68a', lineHeight: 1.45, marginBottom: 10 }}>
            {errorMessage || 'Nao foi possivel buscar links agora.'} Use os atalhos de pesquisa abaixo enquanto a busca automatica nao responde.
          </p>
          <button
            onClick={() => setReloadKey((current) => current + 1)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 10,
              border: '1px solid rgba(245, 158, 11, 0.25)',
              background: 'rgba(245, 158, 11, 0.12)',
              color: '#fde68a',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            <Icons.Rotate />
            Tentar de novo
          </button>
        </div>
      )}

      {status !== 'loading' && (
        <div style={{ display: 'grid', gap: 14 }}>
          {(recommendations.length > 0 ? recommendations : weakTopics.map((topic) => ({
            topic: topic.topic,
            errorType: topic.errorType,
            errorCount: topic.count,
            questionNumbers: topic.questionNumbers,
            keywords: topic.keywords,
            query: topic.query,
            resources: [],
          }))).map((recommendation) => (
            <RecommendationCard
              key={`${recommendation.topic}-${recommendation.questionNumbers.join('-')}`}
              simuladoId={simuladoId}
              recommendation={recommendation}
            />
          ))}
          {recommendations.length === 0 && weakTopics.length === 0 && (
            <div style={{ padding: 14, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#a1a1aa', fontSize: 14, lineHeight: 1.5 }}>
              Ainda nao consegui montar links especificos porque os detalhes das questoes nao carregaram. Reabra o resultado em instantes ou use o gabarito detalhado para revisar as {reviewTotal} questoes erradas.
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Header({ status }: { status: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
      <div>
        <p style={{ fontSize: 12, fontWeight: 800, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
          Reforco na web
        </p>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#f4f4f5' }}>
          Conteudos para os pontos errados
        </h2>
      </div>
      <span style={{
        padding: '6px 10px',
        borderRadius: 999,
        background: 'rgba(99, 102, 241, 0.12)',
        border: '1px solid rgba(99, 102, 241, 0.24)',
        color: '#c4b5fd',
        fontSize: 12,
        fontWeight: 800,
      }}>
        {status}
      </span>
    </div>
  );
}

function RecommendationCard({
  simuladoId,
  recommendation,
}: {
  simuladoId: string;
  recommendation: StudyRecommendation;
}) {
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>('idle');
  const [generationMessage, setGenerationMessage] = useState<string | null>(null);
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const isGenerating = generationStatus === 'loading';
  const hasGeneratedDeck = generationStatus === 'success' && Boolean(reviewUrl);

  async function handleGenerateFlashcards() {
    setGenerationStatus('loading');
    setGenerationMessage(null);
    setReviewUrl(null);

    try {
      const response = await fetch('/api/simulado/reinforcement-flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          simuladoId,
          topic: recommendation.topic,
          errorType: recommendation.errorType,
          questionNumbers: recommendation.questionNumbers,
        }),
      });
      const payload = await response.json().catch(() => null) as ReinforcementFlashcardsResponse | null;

      if (!response.ok || !payload?.success || !Number.isInteger(payload.cardsCreated) || payload.cardsCreated <= 0) {
        throw new Error(payload?.error || 'Nao foi possivel gerar os flashcards agora.');
      }

      setGenerationStatus('success');
      setGenerationMessage(payload.reusedDeck
        ? `Este reforco ja existia com ${payload.cardsCreated} flashcard${payload.cardsCreated > 1 ? 's' : ''}.`
        : `${payload.cardsCreated} flashcard${payload.cardsCreated > 1 ? 's' : ''} criado${payload.cardsCreated > 1 ? 's' : ''} e enviado${payload.cardsCreated > 1 ? 's' : ''} para a fila FSRS.`);
      setReviewUrl(safeReviewUrl(payload.reviewUrl));
    } catch (error) {
      setGenerationStatus('error');
      setGenerationMessage(error instanceof Error ? error.message : 'Nao foi possivel gerar os flashcards agora.');
    }
  }

  return (
    <div style={{
      padding: 16,
      borderRadius: 16,
      background: 'rgba(255,255,255,0.035)',
      border: '1px solid rgba(255,255,255,0.07)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: '#f4f4f5', marginBottom: 4 }}>
            {recommendation.topic}
          </h3>
          <p style={{ fontSize: 13, color: '#a1a1aa' }}>
            {recommendation.errorType} em Q{recommendation.questionNumbers.join(', Q')}
          </p>
        </div>
        <div style={{ fontSize: 12, color: '#fca5a5', fontWeight: 800 }}>
          {recommendation.errorCount} erro{recommendation.errorCount > 1 ? 's' : ''}
        </div>
      </div>

      {recommendation.keywords.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {recommendation.keywords.slice(0, 5).map((keyword) => (
            <span
              key={keyword}
              style={{
                padding: '5px 8px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.07)',
                color: '#d4d4d8',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {keyword}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <button
          type="button"
          onClick={handleGenerateFlashcards}
          disabled={isGenerating || hasGeneratedDeck}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            flex: '1 1 280px',
            maxWidth: '100%',
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid rgba(34, 197, 94, 0.32)',
            background: isGenerating || hasGeneratedDeck ? 'rgba(34, 197, 94, 0.08)' : 'rgba(34, 197, 94, 0.14)',
            color: '#bbf7d0',
            fontSize: 13,
            fontWeight: 900,
            lineHeight: 1.25,
            textAlign: 'left',
            whiteSpace: 'normal',
            cursor: isGenerating ? 'wait' : hasGeneratedDeck ? 'default' : 'pointer',
            opacity: isGenerating || hasGeneratedDeck ? 0.72 : 1,
          }}
        >
          {isGenerating ? <Icons.Loader /> : hasGeneratedDeck ? <Icons.Check /> : <Icons.Brain />}
          {isGenerating
            ? 'Gerando flashcards...'
            : hasGeneratedDeck
              ? 'Flashcards prontos para revisar'
              : `Gerar flashcards com IA sobre ${recommendation.topic}`}
        </button>

        {generationStatus === 'success' && reviewUrl && (
          <a
            href={reviewUrl}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              flex: '0 0 auto',
              padding: '10px 12px',
              borderRadius: 12,
              background: '#f4f4f5',
              color: '#111827',
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 900,
            }}
          >
            Revisar agora
            <Icons.ArrowRight />
          </a>
        )}
      </div>

      {generationMessage && (
        <p style={{
          marginBottom: 12,
          color: generationStatus === 'error' ? '#fca5a5' : '#86efac',
          fontSize: 13,
          lineHeight: 1.45,
          fontWeight: 700,
        }}>
          {generationMessage}
        </p>
      )}

      {recommendation.resources.length > 0 ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {recommendation.resources.map((resource) => (
            <a
              key={resource.url}
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block',
                padding: 12,
                borderRadius: 12,
                background: 'rgba(0,0,0,0.22)',
                border: '1px solid rgba(255,255,255,0.06)',
                textDecoration: 'none',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
                <span style={{ color: '#f4f4f5', fontSize: 14, fontWeight: 800 }}>{resource.title}</span>
                <span style={{ color: '#818cf8', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{resource.source}</span>
              </div>
              <p style={{ color: '#a1a1aa', fontSize: 13, lineHeight: 1.45 }}>
                {resource.snippet}
              </p>
            </a>
          ))}
        </div>
      ) : (
        <a
          href={`https://duckduckgo.com/?q=${encodeURIComponent(recommendation.query)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px',
            borderRadius: 12,
            background: 'rgba(99, 102, 241, 0.12)',
            border: '1px solid rgba(99, 102, 241, 0.24)',
            color: '#c4b5fd',
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          Pesquisar materiais
          <Icons.ArrowRight />
        </a>
      )}
    </div>
  );
}

const sectionStyle = {
  marginTop: 24,
  padding: 20,
  borderRadius: 18,
  background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(17,17,17,0.86))',
  border: '1px solid rgba(99,102,241,0.22)',
} as const;

function isStudyRecommendationsResponse(payload: unknown): payload is StudyRecommendationsResponse {
  return Boolean(
    payload &&
    typeof payload === 'object' &&
    Array.isArray((payload as StudyRecommendationsResponse).recommendations) &&
    typeof (payload as StudyRecommendationsResponse).generatedAt === 'number'
  );
}

function normalizeRecommendations(recommendations: StudyRecommendation[]): StudyRecommendation[] {
  return recommendations
    .filter((recommendation) => recommendation && typeof recommendation === 'object')
    .slice(0, 3)
    .map((recommendation) => ({
      topic: safeDisplayText(recommendation.topic, 120) || 'Ponto fraco',
      errorType: safeDisplayText(recommendation.errorType, 100) || 'Lacuna conceitual',
      errorCount: clampInteger(recommendation.errorCount, 1, 500),
      questionNumbers: Array.isArray(recommendation.questionNumbers)
        ? recommendation.questionNumbers
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0 && value <= 500)
            .slice(0, 20)
        : [],
      keywords: Array.isArray(recommendation.keywords)
        ? recommendation.keywords
            .map((keyword) => safeDisplayText(keyword, 40))
            .filter(Boolean)
            .slice(0, 6)
        : [],
      query: safeDisplayText(recommendation.query, 180) || 'estudo dirigido',
      resources: normalizeResources(recommendation.resources),
    }));
}

function normalizeResources(resources: StudyResource[]): StudyResource[] {
  if (!Array.isArray(resources)) return [];

  return resources
    .map((resource) => {
      const url = safeExternalUrl(resource?.url);
      if (!url) return null;

      return {
        title: safeDisplayText(resource.title, 110) || 'Material de estudo',
        url,
        snippet: safeDisplayText(resource.snippet, 180) || 'Material encontrado para revisar este ponto.',
        source: safeDisplayText(resource.source, 80) || new URL(url).hostname,
      };
    })
    .filter((resource): resource is StudyResource => Boolean(resource))
    .slice(0, 3);
}

function safeDisplayText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  const normalized = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (parsed.hostname === 'localhost' || parsed.hostname.endsWith('.localhost')) return null;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function safeReviewUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return /^\/estudar\/[A-Za-z0-9_-]{1,128}$/.test(value) ? value : null;
}

function clampInteger(value: unknown, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

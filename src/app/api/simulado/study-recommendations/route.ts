import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAuthSuccess, requireAuthAndOwnership } from '@/lib/auth/auth-guard';
import { isSafeEntityId } from '@/lib/security/input-validation';
import { applyRateLimit, getRateLimitError } from '@/lib/security/rate-limiter';
import type { StudyRecommendation } from '@/features/simulado/types/studyRecommendations';
import { buildWeakTopicSummaries, type ResultAnswerLike } from '@/features/simulado/utils/resultAnalysis';
import { buildFallbackResources, searchStudyResources } from '@/lib/web-search/study-resource-search';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 20;

const MAX_REQUEST_BODY_BYTES = 2048;

interface RawQuestao {
  numero: number;
  enunciado: string | null;
  resposta_correta: string | null;
  comentario: string | null;
  citation_excerpt: string | null;
}

interface RawResposta {
  id: string;
  questao_id: string;
  resposta_usuario: string | null;
  correta: boolean | null;
  questao: RawQuestao | RawQuestao[] | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    const simuladoId = typeof body?.simuladoId === 'string' ? body.simuladoId : '';

    if (!isSafeEntityId(simuladoId)) {
      return NextResponse.json({ error: 'simuladoId invalido' }, { status: 400 });
    }

    const authResult = await requireAuthAndOwnership(simuladoId, 'simulados', request);
    if (!isAuthSuccess(authResult)) {
      return authResult;
    }

    const rateLimitResult = await applyRateLimit('/api/simulado/study-recommendations', `user:${authResult.user.id}`);
    if (rateLimitResult && !rateLimitResult.success) {
      const { error, retryAfter } = getRateLimitError(rateLimitResult.reset);
      return NextResponse.json(
        { error, retryAfter },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': rateLimitResult.limit.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimitResult.reset.toString(),
            'X-RateLimit-Mode': rateLimitResult.mode,
            'Retry-After': retryAfter.toString(),
          },
        },
      );
    }

    const supabase = await createClient();
    const { data: simulado, error: simuladoError } = await supabase
      .from('simulados')
      .select('id, titulo, user_id')
      .eq('id', simuladoId)
      .eq('user_id', authResult.user.id)
      .single();

    if (simuladoError || !simulado) {
      return NextResponse.json({ error: 'Simulado nao encontrado' }, { status: 404 });
    }

    const [{ data: questoes, error: questoesError }, { data: respostasRows, error: respostasError }] = await Promise.all([
      supabase
        .from('simulado_questoes')
        .select('id, numero, enunciado, resposta_correta, comentario, citation_excerpt')
        .eq('simulado_id', simuladoId)
        .order('numero', { ascending: true }),
      supabase
        .from('simulado_respostas')
        .select('questao_id, resposta_usuario, correta')
        .eq('simulado_id', simuladoId),
    ]);

    if (questoesError || respostasError) {
      console.error('[study-recommendations] failed to load result details:', questoesError ?? respostasError);
      return NextResponse.json({ error: 'Erro ao carregar respostas' }, { status: 500 });
    }

    const respostasByQuestionId = new Map(
      ((respostasRows ?? []) as Pick<RawResposta, 'questao_id' | 'resposta_usuario' | 'correta'>[])
        .map((row) => [row.questao_id, row])
    );

    const respostas = ((questoes ?? []) as Array<RawQuestao & { id: string }>)
      .map((questao): ResultAnswerLike => {
        const resposta = respostasByQuestionId.get(questao.id);
        const respostaUsuario = resposta?.resposta_usuario ?? null;

        return {
          resposta_usuario: respostaUsuario,
          correta: respostaUsuario
            ? resposta?.correta ?? respostaUsuario === questao.resposta_correta
            : false,
          questao: {
            numero: questao.numero,
            enunciado: questao.enunciado,
            comentario: questao.comentario,
            citation_excerpt: questao.citation_excerpt,
          },
        };
      });

    const weakTopics = buildWeakTopicSummaries(respostas, simulado.titulo, 3);
    if (weakTopics.length === 0) {
      return NextResponse.json({
        recommendations: [],
        generatedAt: Date.now(),
        message: 'Nenhuma questao errada encontrada para recomendar estudos',
      });
    }

    const recommendations = await Promise.all(
      weakTopics.map(async (topic): Promise<StudyRecommendation> => ({
        topic: topic.topic,
        errorType: topic.errorType,
        errorCount: topic.count,
        questionNumbers: topic.questionNumbers,
        keywords: topic.keywords,
        query: topic.query,
        resources: await loadResourcesForTopic(topic.query),
      })),
    );

    return NextResponse.json({
      recommendations,
      generatedAt: Date.now(),
    });
  } catch (error) {
    console.error('[study-recommendations] unexpected error:', error);
    return NextResponse.json({ error: 'Erro ao buscar recomendacoes' }, { status: 500 });
  }
}

async function readJsonBody(request: NextRequest): Promise<{ simuladoId?: unknown } | null> {
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES) {
    return null;
  }

  const rawBody = await request.text().catch(() => '');
  if (!rawBody || rawBody.length > MAX_REQUEST_BODY_BYTES) {
    return null;
  }

  try {
    return JSON.parse(rawBody) as { simuladoId?: unknown };
  } catch {
    return null;
  }
}

async function loadResourcesForTopic(query: string) {
  try {
    const resources = await searchStudyResources(query);
    return resources.length > 0 ? resources : buildFallbackResources(query);
  } catch (error) {
    console.warn('[study-recommendations] search failed, using fallback links:', error);
    return buildFallbackResources(query);
  }
}

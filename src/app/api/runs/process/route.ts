import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';
import { fetchWithTimeout } from '@/lib/ai/timeout';
import {
  checkDailyRunQuota,
  checkCircuitBreaker,
  recordAISuccess,
  recordAIFailure,
} from '@/lib/ai/cost-guard';
import { hasProAccess } from '@/lib/billing/pro-access';

// Generate cryptographically secure random ID
function generateId(): string {
  return crypto.randomUUID();
}

// Legacy shim — callers inside the file still use log(). After each major
// refactor pass this can be replaced with the typed logger directly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _log: (stage: string, message: string, ctx?: Record<string, any>) => void =
  (stage, message) => console.log(`[${new Date().toISOString()}] [Run:${stage}] ${message}`);

function log(stage: string, message: string) {
  _log(stage, message);
}

// Types
interface ChunkWithContext {
  id: string;
  content: string;
  pageNumber: number | null;
  sourceId: string;
  sourceName: string;
  position: number;
}

interface GeneratedFlashcard {
  front: string;
  back: string;
  category?: string;
  chunkId: string;
  citationExcerpt: string;
}

interface GeneratedQuestion {
  // New format for questoes_banca
  enunciado?: string;
  alternativas?: string[];
  respostaCorreta?: string;
  comentario?: string;
  // Legacy/other formats
  type?: 'cespe_certo_errado' | 'multipla_escolha' | 'v_ou_f' | 'comparacao' | 'silogismo' | 'caso_pratico';
  statement?: string;
  options?: string[] | null;
  correctAnswer?: string;
  explanation?: string;
  // Common fields
  chunkId: string;
  citationExcerpt: string;
}

type RunObjective = 'flashcards' | 'questoes_banca' | 'logica_juridica';

// ============================================================================
// PROMPTS
// ============================================================================

const PROMPTS = {
  flashcards: {
    system: `Você é um professor de Direito com 20 anos de experiência, especialista em criar flashcards para concursos públicos e OAB.

REGRAS ABSOLUTAS:
1. CRIE FLASHCARDS APENAS com informações do texto fornecido
2. NUNCA invente informações que não estejam no texto
3. SEMPRE cite o trecho de origem usando o ID fornecido
4. Para cada card, indique qual TRECHO usou como fonte
5. Inclua um RECORTE CURTO (1-2 frases) que comprova a resposta
6. Respostas devem ser completas mas objetivas (máximo 4 frases)
7. Perguntas devem ser específicas e testar compreensão

CATEGORIAS VÁLIDAS:
- "conceito": Definições e princípios jurídicos
- "artigo": Artigos de lei específicos  
- "jurisprudencia": Súmulas e entendimentos de tribunais
- "procedimento": Ritos e procedimentos processuais
- "prazo": Prazos processuais e prescricionais
- "geral": Outros conteúdos relevantes

Responda APENAS com JSON válido, nada mais.`,
    
    user: (chunks: string, targetCount: number) => `Leia os trechos de um documento jurídico abaixo e crie ${targetCount} flashcards de estudo.
Cada trecho tem um ID único que você DEVE usar para citar a fonte.

TRECHOS DO DOCUMENTO:
${chunks}

FORMATO DE RESPOSTA (JSON array):
[{"front": "pergunta", "back": "resposta", "category": "conceito", "chunkId": "ID-DO-TRECHO", "citationExcerpt": "Frase do texto..."}]

JSON:`
  },
  
  questoes_banca: {
    system: `Voce e um EXAMINADOR SENIOR de bancas de concursos publicos (FGV, CESPE/CEBRASPE, FCC, VUNESP) com 20 anos de experiencia criando provas para cargos de alto nivel.

SUA MISSAO: Criar questoes de MULTIPLA ESCOLHA que testam o conhecimento profundo do candidato.

ESTRUTURA OBRIGATORIA DE CADA QUESTAO:

1. ENUNCIADO: 
   - Contextualize com cenario ou afirmacao tecnica
   - Use linguagem formal de prova
   - Pode incluir situacoes hipoteticas

2. ALTERNATIVAS (A a E):
   - UMA alternativa CORRETA baseada no texto
   - QUATRO DISTRATORES plausíveis mas errados

3. COMENTARIO ESTRUTURADO (OBRIGATORIO):
   Use EXATAMENTE este formato com os marcadores:
   
   "##CORRETA: [LETRA]## [Explicacao de 1-2 frases do porque esta certa] ##ERRADAS## A) [erro em 1 frase] B) [erro] C) [erro] D) [erro] E) [erro] ##FONTE## [Citacao do PDF]"
   
   Pule a letra correta na secao ##ERRADAS##.
   A secao ##FONTE## deve conter o trecho EXATO do PDF que fundamenta.

REGRAS:
- NUNCA invente - use APENAS o conteudo fornecido
- Distribua a posicao da resposta correta
- Comentario DEVE seguir o formato estruturado

Responda APENAS com JSON valido.`,
    
    user: (chunks: string, targetCount: number) => `Crie ${targetCount} questoes de multipla escolha baseadas nos trechos abaixo.

TRECHOS:
${chunks}

RETORNE JSON ARRAY:
[{
  "enunciado": "Pergunta aqui",
  "alternativas": ["A) texto", "B) texto", "C) texto", "D) texto", "E) texto"],
  "respostaCorreta": "C",
  "comentario": "##CORRETA: C## Explicacao aqui. ##ERRADAS## A) Erro. B) Erro. D) Erro. E) Erro. ##FONTE## Trecho do PDF aqui.",
  "chunkId": "ID_DO_TRECHO",
  "citationExcerpt": "Trecho fonte"
}]

REGRAS:
- Varie a posicao da resposta correta
- comentario DEVE usar ##CORRETA##, ##ERRADAS##, ##FONTE##
- Use ASCII simples

JSON:`
  },

  
  logica_juridica: {
    system: `Você é um professor de lógica jurídica especializado em raciocínio comparativo e silogismos.

MISSÃO: Criar exercícios de "A vs B" e raciocínio jurídico.

TIPOS DE EXERCÍCIO:
1. Comparação A vs B: "Qual a diferença entre X e Y?"
2. Silogismo: Premissa maior + Premissa menor = Conclusão
3. Análise de caso: Situação hipotética para aplicar o conceito

REGRAS:
- Baseie-se APENAS no texto fornecido
- Cite sempre a fonte (chunkId)
- Explicações claras e didáticas

Responda APENAS com JSON válido.`,
    
    user: (chunks: string, targetCount: number) => `Crie ${targetCount} exercícios de lógica jurídica baseados nos trechos abaixo.

TRECHOS:
${chunks}

FORMATO:
[{
  "type": "comparacao" | "silogismo" | "caso_pratico",
  "statement": "Questão ou cenário",
  "options": null,
  "correctAnswer": "Resposta completa",
  "explanation": "Explicação do raciocínio",
  "chunkId": "ID",
  "citationExcerpt": "Trecho fonte"
}]

JSON:`
  }
};

// ============================================================================
// AI CLIENTS
// ============================================================================

interface AICallResult {
  text: string;
  totalTokens: number;
  durationMs: number;
}

async function callGemini(
  systemPrompt: string,
  userPrompt: string
): Promise<AICallResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  log('Gemini', 'Calling Gemini 2.5 Flash-lite API...');
  const startTime = Date.now();

  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 16000,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    log('Gemini', `API Error: ${response.status} - ${error}`);
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const durationMs = Date.now() - startTime;
  const totalTokens: number = data.usageMetadata?.totalTokenCount ?? 0;
  log('Gemini', `API responded in ${durationMs}ms, ${totalTokens} tokens`);

  return { text: data.candidates?.[0]?.content?.parts?.[0]?.text || "[]", totalTokens, durationMs };
}

async function callGroq(
  systemPrompt: string,
  userPrompt: string
): Promise<AICallResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not configured");

  log('Groq', 'Calling Groq Llama 3.3 API...');
  const startTime = Date.now();

  const response = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 8000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    log('Groq', `API Error: ${response.status} - ${error}`);
    throw new Error(`Groq API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const durationMs = Date.now() - startTime;
  const totalTokens: number = data.usage?.total_tokens ?? 0;
  log('Groq', `API responded in ${durationMs}ms, ${totalTokens} tokens`);

  return { text: data.choices[0]?.message?.content || "[]", totalTokens, durationMs };
}

// ============================================================================
// CONTENT PROCESSING
// ============================================================================

function formatChunksForPrompt(chunks: ChunkWithContext[]): string {
  return chunks.map(chunk => {
    const pageInfo = chunk.pageNumber ? ` (Página ${chunk.pageNumber})` : '';
    return `=== TRECHO ID: ${chunk.id}${pageInfo} ===
Fonte: ${chunk.sourceName}

${chunk.content}

=== FIM DO TRECHO ${chunk.id} ===`;
  }).join('\n\n');
}

// Limit chunks to fit within token budget
// Groq limit: ~12k tokens, we use ~8k for content to leave room for prompt + response
// Rough estimate: 1 token ≈ 4 chars
function selectChunksWithinTokenBudget(
  chunks: ChunkWithContext[],
  maxChars: number = 32000 // ~8k tokens
): ChunkWithContext[] {
  const selected: ChunkWithContext[] = [];
  let totalChars = 0;
  
  // Prioritize chunks evenly distributed across the document
  // to get a representative sample from all sections
  const step = Math.max(1, Math.floor(chunks.length / 10)); // Take ~10 samples
  const priorityIndices = new Set<number>();
  
  for (let i = 0; i < chunks.length; i += step) {
    priorityIndices.add(i);
  }
  
  // First pass: add priority chunks
  for (const idx of priorityIndices) {
    const chunk = chunks[idx];
    const chunkSize = chunk.content.length + 100; // +100 for metadata
    if (totalChars + chunkSize <= maxChars) {
      selected.push(chunk);
      totalChars += chunkSize;
    }
  }
  
  // Second pass: fill remaining budget with other chunks
  for (let i = 0; i < chunks.length && totalChars < maxChars; i++) {
    if (!priorityIndices.has(i)) {
      const chunk = chunks[i];
      const chunkSize = chunk.content.length + 100;
      if (totalChars + chunkSize <= maxChars) {
        selected.push(chunk);
        totalChars += chunkSize;
      }
    }
  }
  
  // Sort by position to maintain document order
  selected.sort((a, b) => a.position - b.position);
  
  log('Truncate', `Selected ${selected.length}/${chunks.length} chunks (${totalChars} chars, ~${Math.round(totalChars/4)} tokens)`);
  
  return selected;
}

function parseAIResponse(content: string): unknown[] {
  log('Parse', `Parsing AI response (${content.length} chars)`);
  
  // Clean markdown code blocks
  let cleaned = content
    .replace(/```json\n?/gi, '')
    .replace(/```\n?/g, '')
    .trim();
  
  // Extract JSON array if present
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }
  
  // Attempt 1: Direct JSON.parse
  try {
    const result = JSON.parse(cleaned);
    if (Array.isArray(result) && result.length > 0) {
      log('Parse', 'Success with direct JSON.parse');
      return result;
    }
  } catch (e) {
    log('Parse', `Direct parse failed: ${e instanceof Error ? e.message : 'unknown'}`);
  }
  
  // Attempt 2: Fix common issues and try again
  try {
    const fixed = cleaned
      .replace(/,\s*]/g, ']')
      .replace(/,\s*}/g, '}')
      .replace(/[\x00-\x1f]/g, ' ') // Remove control characters
      .replace(/\n/g, ' ')
      .replace(/\r/g, ' ')
      .replace(/\t/g, ' ');
    
    const result = JSON.parse(fixed);
    if (Array.isArray(result) && result.length > 0) {
      log('Parse', 'Success with fixed JSON');
      return result;
    }
  } catch (e) {
    log('Parse', `Fixed parse failed: ${e instanceof Error ? e.message : 'unknown'}`);
  }
  
  // Attempt 3: Extract questions using regex (FALLBACK)
  log('Parse', 'Falling back to regex extraction...');
  
  const questions: unknown[] = [];
  
  // Match individual question objects by looking for "enunciado" pattern
  const questionPattern = /"enunciado"\s*:\s*"([^"]+)"/g;
  const alternativasPattern = /"alternativas"\s*:\s*\[([\s\S]*?)\]/g;
  const respostaPattern = /"respostaCorreta"\s*:\s*"([A-E])"/g;
  const comentarioPattern = /"comentario"\s*:\s*"([^"]*)"/g;
  const chunkIdPattern = /"chunkId"\s*:\s*"([^"]+)"/g;
  
  const enunciados = [...cleaned.matchAll(questionPattern)];
  const alternativasMatches = [...cleaned.matchAll(alternativasPattern)];
  const respostas = [...cleaned.matchAll(respostaPattern)];
  const comentarios = [...cleaned.matchAll(comentarioPattern)];
  const chunkIds = [...cleaned.matchAll(chunkIdPattern)];
  
  log('Parse', `Found ${enunciados.length} enunciados, ${alternativasMatches.length} alternativas sets`);
  
  for (let i = 0; i < enunciados.length; i++) {
    try {
      const enunciado = enunciados[i]?.[1] || '';
      const respostaCorreta = respostas[i]?.[1] || 'A';
      const comentario = comentarios[i]?.[1] || '';
      const chunkId = chunkIds[i]?.[1] || '';
      
      // Parse alternativas array
      let alternativas: string[] = [];
      if (alternativasMatches[i]) {
        const altStr = alternativasMatches[i][1];
        const altMatches = altStr.match(/"([^"]+)"/g);
        if (altMatches) {
          alternativas = altMatches.map(a => a.replace(/^"|"$/g, ''));
        }
      }
      
      // Ensure we have 5 alternatives
      while (alternativas.length < 5) {
        alternativas.push(`${String.fromCharCode(65 + alternativas.length)}) -`);
      }
      
      if (enunciado && alternativas.length >= 5) {
        questions.push({
          enunciado,
          alternativas,
          respostaCorreta,
          comentario,
          chunkId,
          citationExcerpt: '',
        });
      }
    } catch (e) {
      log('Parse', `Error extracting question ${i}: ${e}`);
    }
  }
  
  if (questions.length > 0) {
    log('Parse', `Regex extraction found ${questions.length} questions`);
    return questions;
  }
  
  throw new Error(`Failed to parse AI response - no valid questions found`);
}

function selectModel(objective: RunObjective, preference: string): 'groq' | 'gemini' {
  // If user has a preference, use it
  if (preference === 'groq') return 'groq';
  if (preference === 'gemini') return 'gemini';
  
  // Auto-routing based on objective
  switch (objective) {
    case 'flashcards':
      return 'groq'; // Fast, good for simple content
    case 'questoes_banca':
    case 'logica_juridica':
      return 'gemini'; // Better reasoning for complex questions
    default:
      return 'groq';
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  const overallStart = Date.now();

  try {
    const { runId } = await request.json();

    if (!runId) {
      return NextResponse.json({ error: "runId is required" }, { status: 400 });
    }

    // ========================================================================
    // SECURITY: Internal API secret check
    // ========================================================================
    const internalSecret = request.headers.get('x-internal-secret');
    const expectedSecret = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!internalSecret || internalSecret !== expectedSecret) {
      console.warn(JSON.stringify({ level: 'warn', event: 'auth_failed', runId }));
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Set up structured logger — runId is always included in every log line
    const logger = createLogger({ runId });
    _log = (stage, message, ctx) =>
      logger.info(`run_${stage.toLowerCase()}`, { message, ...ctx });

    logger.info('run_start', { message: `Processing run ${runId}` });

    // Create Supabase admin client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ========================================================================
    // 1. GET RUN AND VALIDATE
    // ========================================================================
    
    const { data: run, error: runError } = await supabase
      .from("runs")
      .select("*")
      .eq("id", runId)
      .single();

    if (runError || !run) {
      log('Error', `Run not found: ${runId}`);
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    // Check if already processing or completed
    if (run.status !== 'pendente') {
      log('Skip', `Run already ${run.status}`);
      return NextResponse.json({ error: `Run already ${run.status}` }, { status: 400 });
    }

    log('Validate', `Run validated - Objective: ${run.objective}, Target: ${run.target_count}`);

    // ========================================================================
    // 2. UPDATE STATUS TO PROCESSING
    // ========================================================================
    
    await supabase
      .from("runs")
      .update({ 
        status: "processando", 
        started_at: Date.now(),
        updated_at: Date.now() 
      })
      .eq("id", runId);

    log('Status', 'Updated to "processando"');

    try {
      // ======================================================================
      // 3. FETCH AND VALIDATE SOURCE OWNERSHIP
      // ======================================================================
      
      const { data: source } = await supabase
        .from("sources")
        .select("id, filename, user_id")
        .eq("id", run.source_id)
        .single();

      if (!source) {
        throw new Error("Source not found");
      }

      // SECURITY: Verify source belongs to the user who owns the run
      if (source.user_id !== run.user_id) {
        throw new Error("Source ownership mismatch - access denied");
      }

      log('Source', `Found source: ${source.filename}`);

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
        .eq("source_id", run.source_id)
        .order("position", { ascending: true });

      if (!sourceChunks || sourceChunks.length === 0) {
        throw new Error("No chunks found for this source");
      }

      // Format chunks with context
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chunks: ChunkWithContext[] = sourceChunks.map((sc: any) => ({
        id: sc.chunks.id,
        content: sc.chunks.content,
        pageNumber: sc.chunks.page_number,
        sourceId: run.source_id,
        sourceName: source.filename,
        position: sc.position,
      }));

      log('Chunks', `Found ${chunks.length} chunks for processing`);

      // ======================================================================
      // 4. SELECT MODEL AND EXECUTE
      // ======================================================================

      const currentModel = selectModel(run.objective, run.model_preference);
      log('Model', `Selected model: ${currentModel}`);

      // ── Cost guard: daily quota ─────────────────────────────────────────
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_pro, subscription_status, subscription_period_end')
        .eq('id', run.user_id)
        .single();

      const quotaCheck = await checkDailyRunQuota(
        run.user_id,
        hasProAccess(profile)
      );
      if (!quotaCheck.allowed) {
        log('CostGuard', `Daily quota exceeded for user ${run.user_id}`);
        await supabase
          .from('runs')
          .update({ status: 'erro', error_message: quotaCheck.reason, updated_at: Date.now() })
          .eq('id', runId);
        return NextResponse.json({ error: quotaCheck.reason }, { status: 429 });
      }

      // ── Cost guard: circuit breaker ─────────────────────────────────────
      const circuitCheck = await checkCircuitBreaker(currentModel);
      if (!circuitCheck.allowed) {
        log('CostGuard', `Circuit breaker open for ${currentModel}`);
        await supabase
          .from('runs')
          .update({ status: 'erro', error_message: circuitCheck.reason, updated_at: Date.now() })
          .eq('id', runId);
        return NextResponse.json({ error: circuitCheck.reason }, { status: 503 });
      }

      await supabase
        .from("runs")
        .update({ attempt_count: 1, model_used: currentModel, updated_at: Date.now() })
        .eq("id", runId);

      // Select chunks that fit within token budget
      const maxChars = currentModel === 'groq' ? 32000 : 80000;
      const selectedChunks = selectChunksWithinTokenBudget(chunks, maxChars);

      const formattedChunks = formatChunksForPrompt(selectedChunks);
      const promptConfig = PROMPTS[run.objective as keyof typeof PROMPTS];

      log('AI', `Calling ${currentModel} to generate ${run.target_count} items...`);
      const aiStart = Date.now();

      let aiResult: AICallResult;
      try {
        const aiCall = currentModel === 'groq' ? callGroq : callGemini;
        aiResult = await aiCall(
          promptConfig.system,
          promptConfig.user(formattedChunks, run.target_count)
        );
        await recordAISuccess(currentModel);
      } catch (aiErr) {
        await recordAIFailure(currentModel);
        throw aiErr;
      }

      const aiDurationMs = Date.now() - aiStart;
      log('AI', `AI responded in ${aiDurationMs}ms, tokens: ${aiResult.totalTokens}`);

      await supabase
        .from('runs')
        .update({ token_count: aiResult.totalTokens, updated_at: Date.now() })
        .eq('id', runId);

      const result = parseAIResponse(aiResult.text);

      if (!Array.isArray(result) || result.length === 0) {
        throw new Error("Empty or invalid response from AI");
      }

      log('AI', `Generated ${result.length} items successfully`);

      // ======================================================================
      // 5. PROCESS RESULTS - Branch by objective type
      // ======================================================================
      
      const validChunkIds = new Set(chunks.map(c => c.id));
      let savedCount = 0;

      if (run.objective === 'questoes_banca') {
        // ====================================================================
        // SIMULADO PATH - Save as interactive exam
        // ====================================================================
        
        log('Simulado', `Creating simulado with ${result.length} questions...`);
        
        const now = Date.now();
        const simuladoId = generateId();
        
        // Create simulado record
        const { error: simuladoError } = await supabase
          .from('simulados')
          .insert({
            id: simuladoId,
            run_id: runId,
            user_id: run.user_id,
            source_id: run.source_id,
            titulo: `Simulado - ${source.filename}`,
            total_questoes: result.length,
            status: 'pendente',
            created_at: now,
            updated_at: now,
          });
        
        if (simuladoError) {
          log('Error', `Failed to create simulado: ${simuladoError.message}`);
          throw new Error('Failed to create simulado');
        }
        
        log('Simulado', `Created simulado: ${simuladoId}`);
        
        // Accumulate all valid questions and their blank answer records in memory,
        // then INSERT each table in a single round-trip.
        const questoesRows: Record<string, unknown>[] = [];
        const respostasRows: Record<string, unknown>[] = [];
        let questionNumber = 0;

        for (const item of result) {
          const question = item as GeneratedQuestion;

          if (!question.chunkId || !validChunkIds.has(question.chunkId)) {
            log('Skip', `Question with invalid chunkId`);
            continue;
          }

          questionNumber++;
          const questaoId = generateId();

          let altA = '', altB = '', altC = '', altD = '', altE = '';
          let enunciado = '';
          let respostaCorreta = '';
          let comentario = '';

          if (question.enunciado && question.alternativas) {
            enunciado = question.enunciado;
            altA = question.alternativas[0]?.replace(/^A\)\s*/, '') || '';
            altB = question.alternativas[1]?.replace(/^B\)\s*/, '') || '';
            altC = question.alternativas[2]?.replace(/^C\)\s*/, '') || '';
            altD = question.alternativas[3]?.replace(/^D\)\s*/, '') || '';
            altE = question.alternativas[4]?.replace(/^E\)\s*/, '') || '';
            respostaCorreta = question.respostaCorreta || 'A';
            comentario = question.comentario || '';
          } else if (question.statement && question.options) {
            enunciado = question.statement;
            altA = question.options[0]?.replace(/^A\)\s*/, '') || '';
            altB = question.options[1]?.replace(/^B\)\s*/, '') || '';
            altC = question.options[2]?.replace(/^C\)\s*/, '') || '';
            altD = question.options[3]?.replace(/^D\)\s*/, '') || '';
            altE = question.options[4]?.replace(/^E\)\s*/, '') || '';
            respostaCorreta = question.correctAnswer || 'A';
            comentario = question.explanation || '';
          } else {
            log('Skip', `Question ${questionNumber} missing required fields`);
            questionNumber--;
            continue;
          }

          questoesRows.push({
            id: questaoId,
            simulado_id: simuladoId,
            numero: questionNumber,
            enunciado,
            alternativa_a: altA,
            alternativa_b: altB,
            alternativa_c: altC,
            alternativa_d: altD,
            alternativa_e: altE,
            resposta_correta: respostaCorreta,
            comentario,
            chunk_id: question.chunkId,
            citation_excerpt: question.citationExcerpt || '',
            created_at: now,
          });

          respostasRows.push({
            id: generateId(),
            simulado_id: simuladoId,
            questao_id: questaoId,
            resposta_usuario: null,
            correta: null,
            created_at: now,
          });
        }

        // Bulk insert — two round-trips regardless of how many questions were generated
        if (questoesRows.length > 0) {
          const { error: questoesError } = await supabase
            .from('simulado_questoes')
            .insert(questoesRows);
          if (questoesError) {
            log('Error', `Bulk insert questoes failed: ${questoesError.message}`);
          } else {
            const { error: respostasError } = await supabase
              .from('simulado_respostas')
              .insert(respostasRows);
            if (respostasError) {
              log('Error', `Bulk insert respostas failed: ${respostasError.message}`);
            } else {
              savedCount += questoesRows.length;
            }
          }
        }

        
        // Update simulado with actual question count
        await supabase
          .from('simulados')
          .update({ total_questoes: savedCount, updated_at: Date.now() })
          .eq('id', simuladoId);
        
        // Update run with simulado reference (use NEW simulado_id column, not deck_id which has FK to decks)
        const { error: runUpdateError } = await supabase
          .from('runs')
          .update({ simulado_id: simuladoId, updated_at: Date.now() })
          .eq('id', runId);
        
        if (runUpdateError) {
          log('Error', `Failed to update run.simulado_id: ${runUpdateError.message}`);
        } else {
          log('Simulado', `Updated run.simulado_id: ${simuladoId}`);
        }
        
        log('Simulado', `Saved ${savedCount}/${result.length} questions to simulado`);
        
      } else {
        // ====================================================================
        // FLASHCARD/OTHER PATH - Save as cards in deck
        // ====================================================================
        
        let deckId = run.deck_id;
        
        // SECURITY: If deck_id is provided, verify ownership before using
        if (deckId) {
          const { data: existingDeck } = await supabase
            .from('decks')
            .select('id, user_id')
            .eq('id', deckId)
            .single();

          if (!existingDeck || existingDeck.user_id !== run.user_id) {
            throw new Error("Deck ownership mismatch - access denied");
          }
        }
        
        if (!deckId) {
          const now = Date.now();
          const objectiveNames: Record<string, string> = {
            flashcards: 'Flashcards',
            logica_juridica: 'Lógica Jurídica'
          };
          
          const newDeck = {
            id: generateId(),
            user_id: run.user_id,
            title: `${objectiveNames[run.objective] || 'Cards'} - ${source.filename}`,
            description: `Gerado automaticamente via IA (${currentModel})`,
            created_at: now,
            updated_at: now,
          };
          
          const { data: createdDeck, error: deckError } = await supabase
            .from('decks')
            .insert(newDeck)
            .select()
            .single();
          
          if (deckError) {
            log('Error', `Failed to create deck: ${deckError.message}`);
            throw new Error('Failed to create deck for results');
          }
          
          deckId = createdDeck.id;
          log('Deck', `Created new deck: ${deckId}`);
          
          await supabase
            .from('runs')
            .update({ deck_id: deckId, updated_at: Date.now() })
            .eq('id', runId);
        }

        const chunkMetadata = new Map(chunks.map(c => [c.id, { pageNumber: c.pageNumber }]));
        const batchNow = Date.now();

        log('Save', `Saving ${result.length} cards to deck...`);

        // Accumulate all valid cards and their references in memory,
        // then INSERT each table in a single round-trip.
        const cardsRows: Record<string, unknown>[] = [];
        const refsRows: Record<string, unknown>[] = [];

        for (const item of result) {
          const typedItem = item as GeneratedFlashcard | GeneratedQuestion;

          if (!typedItem.chunkId || !validChunkIds.has(typedItem.chunkId)) {
            log('Skip', `Item with invalid chunkId`);
            continue;
          }

          const cardId = generateId();
          let front: string;
          let back: string;

          if (run.objective === 'flashcards') {
            const flashcard = typedItem as GeneratedFlashcard;
            front = flashcard.front;
            back = flashcard.back;
          } else {
            // logica_juridica and other formats
            const question = typedItem as GeneratedQuestion;
            front = question.statement || '';
            if (question.options) {
              front += '\n\n' + question.options.join('\n');
            }
            back = `Resposta: ${question.correctAnswer || ''}\n\n${question.explanation || ''}`;
          }

          cardsRows.push({
            id: cardId,
            deck_id: deckId,
            front,
            back,
            step: 0,
            source_id: run.source_id,
            citation_text: typedItem.citationExcerpt,
            created_at: batchNow,
            updated_at: batchNow,
          });

          refsRows.push({
            id: generateId(),
            card_id: cardId,
            chunk_id: typedItem.chunkId,
            source_id: run.source_id,
            page_number: chunkMetadata.get(typedItem.chunkId)?.pageNumber,
            excerpt: typedItem.citationExcerpt || '',
            created_at: batchNow,
          });
        }

        // Bulk insert — two round-trips regardless of how many cards were generated
        if (cardsRows.length > 0) {
          const { error: cardsError } = await supabase
            .from('cards')
            .insert(cardsRows);

          if (cardsError) {
            log('Error', `Bulk insert cards failed: ${cardsError.message}`);
          } else {
            const { error: refsError } = await supabase
              .from('card_references')
              .insert(refsRows);

            if (refsError) {
              log('Error', `Bulk insert card_references failed: ${refsError.message}`);
            } else {
              savedCount += cardsRows.length;
            }
          }
        }

        log('Save', `Saved ${savedCount}/${result.length} cards successfully`);

      }

      log('Total', `Saved ${savedCount} items`);

      // ======================================================================
      // 6. DEDUCT CREDIT AND COMPLETE
      // ======================================================================
      
      if (savedCount > 0) {
        const { data: creditDeducted } = await supabase.rpc('deduct_user_credit', {
          p_user_id: run.user_id
        });
        
        log('Credit', `Credit deducted: ${creditDeducted}`);
      }

      // Mark run as completed
      await supabase
        .from("runs")
        .update({
          status: "concluido",
          items_generated: savedCount,
          completed_at: Date.now(),
          updated_at: Date.now(),
        })
        .eq("id", runId);

      const totalElapsed = Date.now() - overallStart;
      log('Complete', `Run completed in ${totalElapsed}ms - ${savedCount} items saved`);

      return NextResponse.json({
        success: true,
        runId,
        itemsGenerated: savedCount,
        // deck_id in runs table contains simuladoId for questoes_banca, deckId for others
        resultId: run.objective === 'questoes_banca' ? undefined : undefined, // Already set in run.deck_id
        modelUsed: currentModel,
        elapsedMs: totalElapsed,
      });

    } catch (processingError) {
      const errorMessage = processingError instanceof Error 
        ? processingError.message 
        : "Erro desconhecido no processamento";
      
      log('Error', `Run failed: ${errorMessage}`);

      await supabase
        .from("runs")
        .update({
          status: "erro",
          error_message: errorMessage,
          completed_at: Date.now(),
          updated_at: Date.now(),
        })
        .eq("id", runId);

      return NextResponse.json(
        { error: errorMessage, runId },
        { status: 500 }
      );
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    log('Fatal', `Fatal error: ${message}`);
    
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

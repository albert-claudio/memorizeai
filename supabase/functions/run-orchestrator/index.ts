// Supabase Edge Function: run-orchestrator
// The "Maestro" - Orchestrates AI content generation with Groq and Gemini

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Generate cryptographically secure random ID (Deno compatible)
function generateId(): string {
  return crypto.randomUUID();
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
  type: 'cespe_certo_errado' | 'multipla_escolha' | 'v_ou_f';
  statement: string;
  options: string[] | null;
  correctAnswer: string;
  explanation: string;
  chunkId: string;
  citationExcerpt: string;
}

type RunObjective = 'flashcards' | 'questoes_banca' | 'logica_juridica';
type ModelType = 'groq' | 'gemini';

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
    system: `Você é um examinador de concursos com 15 anos de experiência criando provas para bancas como FCC, CESPE, VUNESP e FGV.

MISSÃO: Criar questões no estilo exato das bancas examinadoras.

INSTRUÇÕES:
1. Analise profundamente o material jurídico fornecido
2. Identifique os pontos que bancas costumam cobrar
3. Crie questões no formato Certo/Errado (CESPE) ou múltipla escolha
4. NUNCA copie literalmente - reformule usando linguagem de prova
5. Inclua pegadinhas sutis que as bancas costumam usar
6. Garanta que cada questão tenha fundamentação no texto

ESTILOS DE QUESTÃO:
- cespe_certo_errado: Afirmação que é CERTO ou ERRADO
- multipla_escolha: Pergunta com 5 alternativas (A a E)

Responda APENAS com JSON válido, nada mais.`,
    
    user: (chunks: string, targetCount: number) => `Analise os trechos jurídicos abaixo e crie ${targetCount} questões no estilo de bancas de concurso.

TRECHOS DO DOCUMENTO:
${chunks}

FORMATO DE RESPOSTA (JSON array):
[{
  "type": "cespe_certo_errado",
  "statement": "Afirmação para julgar",
  "options": null,
  "correctAnswer": "CERTO",
  "explanation": "Breve explicação",
  "chunkId": "ID-DO-TRECHO",
  "citationExcerpt": "Trecho que fundamenta"
}]

Para múltipla escolha:
[{
  "type": "multipla_escolha",
  "statement": "Pergunta da questão",
  "options": ["A) opção A", "B) opção B", "C) opção C", "D) opção D", "E) opção E"],
  "correctAnswer": "C",
  "explanation": "Explicação",
  "chunkId": "ID-DO-TRECHO",
  "citationExcerpt": "Trecho fonte"
}]

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

async function callGroq(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) throw new Error("GROQ_API_KEY not configured");
  
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
    throw new Error(`Groq API error: ${response.status} - ${error}`);
  }
  
  const data = await response.json();
  return data.choices[0]?.message?.content || "[]";
}

async function callGemini(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
  
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: `${systemPrompt}\n\n${userPrompt}` }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8000,
        },
      }),
    }
  );
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }
  
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
}

// ============================================================================
// ROUTING LOGIC
// ============================================================================

function selectModel(objective: RunObjective, preference: string): ModelType {
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

function getFallbackModel(current: ModelType): ModelType {
  return current === 'groq' ? 'gemini' : 'groq';
}

function hasProAccess(profile: {
  is_pro?: boolean | null;
  subscription_status?: string | null;
  subscription_period_end?: number | null;
} | null | undefined): boolean {
  if (!profile?.is_pro) return false;

  const status = profile.subscription_status ?? 'free';
  if (status !== 'active' && status !== 'past_due') return false;

  const periodEnd = profile.subscription_period_end;
  if (typeof periodEnd === 'number') {
    return periodEnd > Date.now();
  }

  return status === 'active';
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

function parseAIResponse(content: string): unknown[] {
  // Clean markdown code blocks
  let cleaned = content
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
  
  // Extract JSON array
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }
  
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try fixing common issues
    cleaned = cleaned.replace(/,\s*]/g, ']').replace(/,\s*}/g, '}');
    return JSON.parse(cleaned);
  }
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { runId } = await req.json();
    
    if (!runId) {
      return new Response(
        JSON.stringify({ error: "runId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ================================================================
    // SECURITY: Validate caller authorization
    // ================================================================
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Check if caller is using service role (internal call from /api/runs)
    const isServiceRole = authHeader === `Bearer ${supabaseServiceKey}`;
    
    // Create service role client for processing
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ========================================================================
    // 1. GET RUN AND VALIDATE
    // ========================================================================
    
    const { data: run, error: runError } = await supabase
      .from("runs")
      .select("*")
      .eq("id", runId)
      .single();

    if (runError || !run) {
      return new Response(
        JSON.stringify({ error: "Run not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If NOT service role, validate user owns this run
    if (!isServiceRole) {
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      });
      
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: "Invalid token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify user owns this run
      if (run.user_id !== user.id) {
        return new Response(
          JSON.stringify({ error: "Forbidden - you do not own this run" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ================================================================
    // PRO TIER VALIDATION - AI generation requires Pro subscription
    // ================================================================
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_pro, subscription_status, subscription_period_end")
      .eq("id", run.user_id)
      .single();

    const isPro = hasProAccess(profile);

    if (!isPro) {
      return new Response(
        JSON.stringify({ error: "AI generation requires Pro subscription" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ================================================================
    // DECK OWNERSHIP VALIDATION (if deck_id is provided)
    // Prevents cross-tenant writes via foreign deck_id
    // ================================================================
    if (run.deck_id) {
      const { data: deck, error: deckError } = await supabase
        .from("decks")
        .select("id, user_id")
        .eq("id", run.deck_id)
        .single();

      if (deckError || !deck || deck.user_id !== run.user_id) {
        return new Response(
          JSON.stringify({ error: "Invalid deck - access denied" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Check if already processing or completed
    if (run.status !== 'pendente') {
      return new Response(
        JSON.stringify({ error: `Run already ${run.status}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Orchestrator] Starting run ${runId} - Objective: ${run.objective}`);

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
      const chunks: ChunkWithContext[] = sourceChunks.map((sc: { position: number; chunks: { id: string; content: string; page_number: number | null } }) => ({
        id: sc.chunks.id,
        content: sc.chunks.content,
        pageNumber: sc.chunks.page_number,
        sourceId: run.source_id,
        sourceName: source.filename,
        position: sc.position,
      }));

      console.log(`[Orchestrator] Found ${chunks.length} chunks for source`);

      // ======================================================================
      // 4. SELECT MODEL AND EXECUTE WITH FALLBACK
      // ======================================================================
      
      let currentModel = selectModel(run.objective, run.model_preference);
      let result: unknown[] | null = null;
      let attempts = 0;
      const maxAttempts = 3;

      const formattedChunks = formatChunksForPrompt(chunks);
      const promptConfig = PROMPTS[run.objective as keyof typeof PROMPTS];

      while (!result && attempts < maxAttempts) {
        attempts++;
        
        console.log(`[Orchestrator] Attempt ${attempts}/${maxAttempts} with ${currentModel}`);
        
        await supabase
          .from("runs")
          .update({ 
            attempt_count: attempts,
            model_used: currentModel,
            updated_at: Date.now() 
          })
          .eq("id", runId);

        try {
          const aiCall = currentModel === 'groq' ? callGroq : callGemini;
          const response = await aiCall(
            promptConfig.system,
            promptConfig.user(formattedChunks, run.target_count)
          );
          
          result = parseAIResponse(response);
          
          if (!Array.isArray(result) || result.length === 0) {
            throw new Error("Empty or invalid response from AI");
          }
          
          console.log(`[Orchestrator] Successfully generated ${result.length} items with ${currentModel}`);
          
        } catch (error) {
          console.error(`[Orchestrator] ${currentModel} failed:`, error);
          
          if (attempts < maxAttempts) {
            currentModel = getFallbackModel(currentModel);
            console.log(`[Orchestrator] Falling back to ${currentModel}`);
          }
        }
      }

      // ======================================================================
      // 5. PROCESS RESULTS
      // ======================================================================
      
      if (!result || result.length === 0) {
        throw new Error("All AI attempts failed");
      }

      // Get or create deck for this run
      let deckId = run.deck_id;
      
      if (!deckId) {
        // Create a new deck for this run
        const now = Date.now();
        const objectiveNames: Record<string, string> = {
          flashcards: 'Flashcards',
          questoes_banca: 'Questões de Banca',
          logica_juridica: 'Lógica Jurídica'
        };
        
        const newDeck = {
          id: generateId(),
          user_id: run.user_id,
          title: `${objectiveNames[run.objective]} - ${source.filename}`,
          description: `Gerado automaticamente via IA (${currentModel})`,
          created_at: now,
          updated_at: now,
        };
        
        const { data: createdDeck, error: deckError } = await supabase
          .from("decks")
          .insert(newDeck)
          .select()
          .single();
        
        if (deckError) {
          console.error("[Orchestrator] Failed to create deck:", deckError);
          throw new Error("Failed to create deck for results");
        }
        
        deckId = createdDeck.id;
        
        // Update run with deck_id
        await supabase
          .from("runs")
          .update({ deck_id: deckId, updated_at: Date.now() })
          .eq("id", runId);
      }

      // Save generated items as cards
      const validChunkIds = new Set(chunks.map(c => c.id));
      const chunkMetadata = new Map(chunks.map(c => [c.id, { pageNumber: c.pageNumber }]));
      let savedCount = 0;

      for (const item of result) {
        try {
          // Validate item has required fields
          const typedItem = item as GeneratedFlashcard | GeneratedQuestion;
          
          if (!typedItem.chunkId || !validChunkIds.has(typedItem.chunkId)) {
            console.log("[Orchestrator] Skipping item with invalid chunkId");
            continue;
          }

          const now = Date.now();
          const cardId = generateId();
          
          // Create card based on objective type
          let front: string;
          let back: string;
          
          if (run.objective === 'flashcards') {
            const flashcard = typedItem as GeneratedFlashcard;
            front = flashcard.front;
            back = flashcard.back;
          } else {
            const question = typedItem as GeneratedQuestion;
            front = question.statement;
            if (question.options) {
              front += '\n\n' + question.options.join('\n');
            }
            back = `Resposta: ${question.correctAnswer}\n\n${question.explanation}`;
          }

          // Insert card
          const { error: cardError } = await supabase
            .from("cards")
            .insert({
              id: cardId,
              deck_id: deckId,
              front,
              back,
              step: 0,
              source_id: run.source_id,
              citation_text: typedItem.citationExcerpt,
              created_at: now,
              updated_at: now,
            });

          if (cardError) {
            console.error("[Orchestrator] Failed to insert card:", cardError);
            continue;
          }

          // Create card reference for citation
          const pageNumber = chunkMetadata.get(typedItem.chunkId)?.pageNumber;
          
          await supabase
            .from("card_references")
            .insert({
              id: generateId(),
              card_id: cardId,
              chunk_id: typedItem.chunkId,
              source_id: run.source_id,
              page_number: pageNumber,
              excerpt: typedItem.citationExcerpt || '',
              created_at: now,
            });

          savedCount++;
        } catch (itemError) {
          console.error("[Orchestrator] Error processing item:", itemError);
        }
      }

      console.log(`[Orchestrator] Saved ${savedCount}/${result.length} items`);

      // ======================================================================
      // 6. DEDUCT CREDIT AND COMPLETE
      // ======================================================================
      
      // Only deduct credits for paid objectives (simulados)
      // Flashcards are FREE - never deduct credits
      const paidObjectives: RunObjective[] = ['questoes_banca', 'logica_juridica'];
      const requiresCredit = paidObjectives.includes(run.objective as RunObjective);
      
      if (savedCount > 0 && requiresCredit) {
        const { data: creditDeducted } = await supabase.rpc('deduct_user_credit', {
          p_user_id: run.user_id
        });
        
        console.log(`[Orchestrator] Credit deducted: ${creditDeducted}`);
      } else if (savedCount > 0) {
        console.log(`[Orchestrator] Flashcards are free - no credit deducted`);
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

      return new Response(
        JSON.stringify({
          success: true,
          runId,
          itemsGenerated: savedCount,
          deckId,
          modelUsed: currentModel,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } catch (processingError) {
      // ======================================================================
      // ERROR HANDLING - No credit deduction
      // ======================================================================
      
      const errorMessage = processingError instanceof Error 
        ? processingError.message 
        : "Erro desconhecido no processamento";
      
      console.error(`[Orchestrator] Run failed:`, processingError);

      await supabase
        .from("runs")
        .update({
          status: "erro",
          error_message: errorMessage,
          completed_at: Date.now(),
          updated_at: Date.now(),
        })
        .eq("id", runId);

      return new Response(
        JSON.stringify({ error: errorMessage, runId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Orchestrator] Fatal error:", error);
    
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

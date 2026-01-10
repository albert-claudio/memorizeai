'use server';

import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

/**
 * Chunk with context for citation
 */
export interface ChunkWithContext {
  id: string;
  content: string;
  pageNumber: number | null;
  sourceId: string;
  sourceName: string;
  position: number;
}

/**
 * Flashcard with citation information
 */
export interface FlashcardWithCitation {
  front: string;
  back: string;
  category: 'conceito' | 'artigo' | 'jurisprudencia' | 'procedimento' | 'prazo' | 'geral';
  chunkId: string;
  pageNumber: number | null;
  citationExcerpt: string;
}

// System message with citation requirement
const SYSTEM_MESSAGE_WITH_CITATIONS = `Você é um professor de Direito com 20 anos de experiência, especialista em criar flashcards para concursos públicos e OAB.

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

FORMATO DE RESPOSTA OBRIGATÓRIO (JSON):
[{
  "front": "pergunta sobre o texto",
  "back": "resposta baseada no texto",
  "category": "conceito",
  "chunkId": "ID do trecho usado",
  "citationExcerpt": "Frase curta do texto original que comprova a resposta"
}]

Responda APENAS com JSON válido, nada mais.`;

/**
 * Format chunks with context for the AI prompt
 */
function formatChunksForPrompt(chunks: ChunkWithContext[]): string {
  return chunks.map(chunk => {
    const pageInfo = chunk.pageNumber ? ` (Página ${chunk.pageNumber})` : '';
    return `=== TRECHO ID: ${chunk.id}${pageInfo} ===
Fonte: ${chunk.sourceName}

${chunk.content}

=== FIM DO TRECHO ${chunk.id} ===`;
  }).join('\n\n');
}

/**
 * Detect content type for better prompt context
 */
function detectContentType(text: string): string {
  const patterns = {
    constitucional: /constituição|constitucional|art\.\s*5|direitos fundamentais|cf\/88/gi,
    civil: /código civil|cc\/2002|obrigações|contratos|responsabilidade civil/gi,
    penal: /código penal|cp|crime|pena|tipicidade|antijuridicidade/gi,
    trabalhista: /clt|trabalhista|empregado|empregador|súmula.*tst/gi,
    processual: /cpc|cpp|processo|recurso|ação|petição|contestação/gi,
    administrativo: /administração pública|ato administrativo|licitação|servidor/gi,
    tributario: /tributo|imposto|taxa|contribuição|crédito tributário/gi,
  };
  
  const matches: Record<string, number> = {};
  
  for (const [area, regex] of Object.entries(patterns)) {
    const found = text.match(regex);
    matches[area] = found ? found.length : 0;
  }
  
  const bestMatch = Object.entries(matches).sort((a, b) => b[1] - a[1])[0];
  return bestMatch && bestMatch[1] > 2 ? bestMatch[0] : 'geral';
}

/**
 * Validate flashcard with citation
 */
function validateFlashcardWithCitation(
  card: FlashcardWithCitation,
  validChunkIds: Set<string>
): { valid: boolean; reason?: string } {
  if (card.front.length < 15) {
    return { valid: false, reason: 'Pergunta muito curta' };
  }
  
  if (card.back.length < 20) {
    return { valid: false, reason: 'Resposta muito curta' };
  }
  
  if (card.front.length > 350) {
    return { valid: false, reason: 'Pergunta muito longa' };
  }
  
  if (card.back.length > 700) {
    return { valid: false, reason: 'Resposta muito longa' };
  }
  
  if (!card.chunkId || !validChunkIds.has(card.chunkId)) {
    return { valid: false, reason: 'Chunk ID inválido' };
  }
  
  if (!card.citationExcerpt || card.citationExcerpt.length < 10) {
    return { valid: false, reason: 'Citação muito curta' };
  }
  
  const isQuestion = card.front.includes('?') || 
    /^(qual|quais|o que|como|quando|onde|por que|defina|explique|cite|diferencie|segundo|de acordo|conforme)/i.test(card.front);
  if (!isQuestion) {
    return { valid: false, reason: 'Front não é uma pergunta válida' };
  }
  
  return { valid: true };
}

/**
 * Generate flashcards with citation information
 * @param chunks Array of chunks with context (id, content, pageNumber, sourceId, sourceName)
 * @returns Array of flashcards with citation data
 */
export async function generateFlashcardsWithCitations(
  chunks: ChunkWithContext[]
): Promise<FlashcardWithCitation[]> {
  if (chunks.length === 0) {
    throw new Error('Nenhum chunk fornecido para geração');
  }
  
  const fullText = chunks.map(c => c.content).join('\n');
  const contentType = detectContentType(fullText);
  const formattedChunks = formatChunksForPrompt(chunks);
  const validChunkIds = new Set(chunks.map(c => c.id));
  
  // Build chunk ID to metadata map
  const chunkMetadata = new Map(chunks.map(c => [c.id, { pageNumber: c.pageNumber }]));
  
  console.log(`[AI-Citations] Gerando flashcards com citações - ${chunks.length} chunks, Área: ${contentType}`);
  
  const userPrompt = `Leia os trechos de um documento jurídico abaixo e crie flashcards de estudo.
Cada trecho tem um ID único que você DEVE usar para citar a fonte.

ÁREA DO DIREITO: ${contentType.toUpperCase()}

INSTRUÇÕES:
- Crie entre 10 e 20 flashcards
- Para cada card, indique o ID do TRECHO que usou como fonte (campo "chunkId")
- Inclua um RECORTE CURTO do texto original que comprova a resposta (campo "citationExcerpt")
- O recorte deve ser exatamente como está no texto, sem modificações
- Use APENAS informações dos trechos fornecidos

TRECHOS DO DOCUMENTO:
${formattedChunks}

FORMATO DE RESPOSTA:
[{"front": "...", "back": "...", "category": "...", "chunkId": "ID-DO-TRECHO", "citationExcerpt": "Frase do texto..."}]

JSON:`;

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_MESSAGE_WITH_CITATIONS },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 8000,
      top_p: 0.85,
    });

    const content = completion.choices[0]?.message?.content || '[]';
    
    console.log('[AI-Citations] Resposta recebida, tamanho:', content.length);
    
    // Clean response
    let cleanedContent = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    
    // Extract JSON array
    const jsonMatch = cleanedContent.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      cleanedContent = jsonMatch[0];
    }
    
    let flashcards: FlashcardWithCitation[];
    
    try {
      flashcards = JSON.parse(cleanedContent);
    } catch {
      console.warn('[AI-Citations] JSON malformado, tentando recuperar...');
      cleanedContent = cleanedContent.replace(/,\s*]/g, ']').replace(/,\s*}/g, '}');
      flashcards = JSON.parse(cleanedContent);
    }
    
    if (!Array.isArray(flashcards)) {
      throw new Error('Resposta não é um array');
    }
    
    console.log(`[AI-Citations] Parseados ${flashcards.length} flashcards`);
    
    // Validate and enrich with page numbers
    const validatedCards: FlashcardWithCitation[] = [];
    
    for (const card of flashcards) {
      if (!card || typeof card.front !== 'string' || typeof card.back !== 'string') {
        console.log('[AI-Citations] Card inválido: estrutura incorreta');
        continue;
      }
      
      card.front = card.front.trim();
      card.back = card.back.trim();
      card.chunkId = card.chunkId?.trim() || '';
      card.citationExcerpt = card.citationExcerpt?.trim() || '';
      
      // Validate
      const validation = validateFlashcardWithCitation(card, validChunkIds);
      if (!validation.valid) {
        console.log(`[AI-Citations] Card rejeitado: ${validation.reason}`);
        continue;
      }
      
      // Enrich with page number from chunk metadata
      const metadata = chunkMetadata.get(card.chunkId);
      card.pageNumber = metadata?.pageNumber ?? null;
      
      // Normalize category
      const validCategories = ['conceito', 'artigo', 'jurisprudencia', 'procedimento', 'prazo', 'geral'];
      if (!card.category || !validCategories.includes(card.category)) {
        card.category = 'geral';
      }
      
      validatedCards.push(card);
    }
    
    console.log(`[AI-Citations] Final: ${flashcards.length} gerados -> ${validatedCards.length} válidos com citação`);
    
    if (validatedCards.length === 0) {
      throw new Error('Nenhum flashcard válido com citação foi gerado.');
    }
    
    return validatedCards;
    
  } catch (error) {
    console.error('[AI-Citations] Erro na geração:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    throw new Error(`Falha ao gerar flashcards com citações: ${errorMessage}`);
  }
}

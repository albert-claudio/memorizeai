'use server';

import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

interface Flashcard {
  front: string;
  back: string;
  category?: 'conceito' | 'artigo' | 'jurisprudencia' | 'procedimento' | 'prazo' | 'geral';
}

// System message especializado em Direito brasileiro
const SYSTEM_MESSAGE = `Você é um professor de Direito com 20 anos de experiência, especialista em criar flashcards para concursos públicos e OAB.

REGRAS ABSOLUTAS:
1. CRIE FLASHCARDS APENAS com informações do texto fornecido pelo usuário
2. NUNCA invente informações que não estejam no texto
3. NUNCA use exemplos genéricos - tudo deve vir do texto
4. SEMPRE inclua referência legal quando mencionar artigos/leis do texto
5. Respostas devem ser completas mas objetivas (máximo 4 frases)
6. Perguntas devem ser específicas e testar compreensão

CATEGORIAS VÁLIDAS:
- "conceito": Definições e princípios jurídicos
- "artigo": Artigos de lei específicos  
- "jurisprudencia": Súmulas e entendimentos de tribunais
- "procedimento": Ritos e procedimentos processuais
- "prazo": Prazos processuais e prescricionais
- "geral": Outros conteúdos relevantes

Responda APENAS com JSON válido, nada mais.`;

/**
 * Pré-processa o texto para melhorar a extração
 */
function smartTruncate(text: string, maxChars: number = 20000): string {
  if (text.length <= maxChars) return text;
  
  const truncated = text.slice(0, maxChars);
  const lastParagraph = truncated.lastIndexOf('\n\n');
  
  if (lastParagraph > maxChars * 0.8) {
    return truncated.slice(0, lastParagraph);
  }
  
  const lastSentence = truncated.lastIndexOf('.');
  if (lastSentence > maxChars * 0.9) {
    return truncated.slice(0, lastSentence + 1);
  }
  
  return truncated;
}

/**
 * Detecta o tipo de conteúdo jurídico
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
 * Valida a qualidade de um flashcard
 */
function validateFlashcardQuality(card: Flashcard): { valid: boolean; reason?: string } {
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
  
  const isQuestion = card.front.includes('?') || 
                     /^(qual|quais|o que|como|quando|onde|por que|defina|explique|cite|diferencie|segundo|de acordo|conforme)/i.test(card.front);
  if (!isQuestion) {
    return { valid: false, reason: 'Front não é uma pergunta válida' };
  }
  
  return { valid: true };
}

/**
 * Remove flashcards duplicados
 */
function deduplicateFlashcards(cards: Flashcard[]): Flashcard[] {
  const seen = new Set<string>();
  const unique: Flashcard[] = [];
  
  for (const card of cards) {
    const normalizedFront = card.front.toLowerCase().replace(/[^\w\s]/g, '').trim();
    
    let isDuplicate = false;
    for (const seenFront of seen) {
      const similarity = calculateSimilarity(normalizedFront, seenFront);
      if (similarity > 0.75) {
        isDuplicate = true;
        break;
      }
    }
    
    if (!isDuplicate) {
      seen.add(normalizedFront);
      unique.push(card);
    }
  }
  
  return unique;
}

/**
 * Calcula similaridade (Jaccard)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const set1 = new Set(str1.split(/\s+/));
  const set2 = new Set(str2.split(/\s+/));
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

/**
 * Extrai palavras-chave do texto para validação
 */
function extractKeywords(text: string): Set<string> {
  const words = text.toLowerCase()
    .replace(/[^\w\sáéíóúàèìòùâêîôûãõçñ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 4);
  return new Set(words);
}

/**
 * Verifica se o flashcard contém conteúdo do texto original
 */
function flashcardMatchesText(card: Flashcard, textKeywords: Set<string>): boolean {
  const cardText = `${card.front} ${card.back}`.toLowerCase();
  const cardWords = cardText.split(/\s+/).filter(w => w.length > 3);
  
  if (cardWords.length === 0) return true; // Evita divisão por zero
  
  let matchCount = 0;
  for (const word of cardWords) {
    if (textKeywords.has(word)) {
      matchCount++;
    }
  }
  
  const ratio = matchCount / cardWords.length;
  console.log(`[AI] Card match: ${matchCount}/${cardWords.length} = ${(ratio * 100).toFixed(1)}%`);
  
  // Pelo menos 15% das palavras devem estar no texto original (menos restritivo)
  return ratio >= 0.15;
}

export async function generateFlashcards(text: string): Promise<Flashcard[]> {
  const truncatedText = smartTruncate(text);
  const contentType = detectContentType(text);
  const textKeywords = extractKeywords(text);
  
  console.log(`[AI] Gerando flashcards - Área: ${contentType}, Texto: ${truncatedText.length} chars, Keywords: ${textKeywords.size}`);
  
  // Log das primeiras palavras do texto para debug
  console.log(`[AI] Início do texto: "${truncatedText.slice(0, 200)}..."`);
  
  const userPrompt = `Leia o texto jurídico abaixo e crie flashcards de estudo.

ÁREA DO DIREITO: ${contentType.toUpperCase()}

REGRAS OBRIGATÓRIAS:
- Crie entre 15 e 25 flashcards
- Use APENAS informações presentes no texto abaixo
- NÃO invente informações que não estejam no texto
- Cada pergunta deve ser específica sobre o conteúdo
- Cada resposta deve ser objetiva (2-4 frases)

TEXTO DO DOCUMENTO:
"""
${truncatedText}
"""

Retorne APENAS um array JSON com os flashcards no formato:
[{"front": "pergunta sobre o texto", "back": "resposta baseada no texto", "category": "conceito"}]

JSON:`;

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: SYSTEM_MESSAGE,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      temperature: 0.2, // Ainda mais baixa para mais precisão
      max_tokens: 8000,
      top_p: 0.85,
    });

    const content = completion.choices[0]?.message?.content || '[]';
    
    console.log('[AI] Resposta recebida, tamanho:', content.length);
    console.log('[AI] Primeiros 300 chars:', content.slice(0, 300));
    
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
    
    let flashcards: Flashcard[];
    
    try {
      flashcards = JSON.parse(cleanedContent);
    } catch {
      console.warn('[AI] JSON malformado, tentando recuperar...');
      cleanedContent = cleanedContent.replace(/,\s*]/g, ']').replace(/,\s*}/g, '}');
      flashcards = JSON.parse(cleanedContent);
    }
    
    if (!Array.isArray(flashcards)) {
      throw new Error('Resposta não é um array');
    }
    
    console.log(`[AI] Parseados ${flashcards.length} flashcards`);
    
    // Validação rigorosa
    const validatedCards: Flashcard[] = [];
    
    for (const card of flashcards) {
      if (!card || typeof card.front !== 'string' || typeof card.back !== 'string') {
        console.log('[AI] Card inválido: estrutura incorreta');
        continue;
      }
      
      card.front = card.front.trim();
      card.back = card.back.trim();
      
      // Valida qualidade
      const validation = validateFlashcardQuality(card);
      if (!validation.valid) {
        console.log(`[AI] Card rejeitado: ${validation.reason}`);
        continue;
      }
      
      // Valida que o card tem relação com o texto original (menos restritivo se temos poucas keywords)
      const shouldValidateMatch = textKeywords.size > 50;
      if (shouldValidateMatch && !flashcardMatchesText(card, textKeywords)) {
        console.log(`[AI] Card rejeitado: não corresponde ao texto - "${card.front.slice(0, 50)}..."`);
        continue;
      }
      
      // Normaliza categoria
      const validCategories = ['conceito', 'artigo', 'jurisprudencia', 'procedimento', 'prazo', 'geral'];
      if (!card.category || !validCategories.includes(card.category)) {
        card.category = 'geral';
      }
      
      validatedCards.push(card);
    }
    
    // Remove duplicados
    const uniqueCards = deduplicateFlashcards(validatedCards);
    
    console.log(`[AI] Final: ${flashcards.length} gerados -> ${validatedCards.length} válidos -> ${uniqueCards.length} únicos`);
    
    // Se todos foram rejeitados mas temos cards parseados, usa os cards básicos (com validação de qualidade apenas)
    if (uniqueCards.length === 0 && flashcards.length > 0) {
      console.log('[AI] Usando fallback: retornando cards sem validação de keywords');
      const fallbackCards = flashcards
        .filter(c => c && typeof c.front === 'string' && typeof c.back === 'string' && c.front.length > 10 && c.back.length > 10)
        .map(c => ({ front: c.front.trim(), back: c.back.trim(), category: 'geral' as const }));
      
      if (fallbackCards.length > 0) {
        return deduplicateFlashcards(fallbackCards);
      }
    }
    
    if (uniqueCards.length === 0) {
      throw new Error('Nenhum flashcard válido foi gerado a partir do texto.');
    }
    
    return uniqueCards;
    
  } catch (error) {
    console.error('[AI] Erro na geração:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    throw new Error(`Falha ao gerar flashcards: ${errorMessage}`);
  }
}

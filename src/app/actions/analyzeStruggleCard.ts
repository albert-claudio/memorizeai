'use server';

import Groq from 'groq-sdk';
import { createClient } from '@/lib/supabase/server';
import { getEffectiveProAccess } from '@/lib/billing/effective-pro-access';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

interface StruggleCard {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  lapses: number;
}

interface SimplifiedCard {
  front: string;
  back: string;
  type: 'simplified' | 'example' | 'context';
}

// System message otimizado para análise de cards com dificuldade
const SYSTEM_MESSAGE = `Você é um especialista em aprendizado e memória para estudantes de Direito.

O aluno está tendo dificuldade com este flashcard (errou 3 vezes). Sua tarefa é ajudá-lo com:

1. **Análise Breve**: Por que este card pode estar difícil? (1-2 frases)
2. **Dica de Memorização**: Uma técnica para lembrar (mnemônico, associação, etc.)
3. **Cards Simplificados**: 2-3 variações mais simples do mesmo conceito

REGRAS PARA DIREITO:
- Se for termo jurídico abstrato, crie um EXEMPLO PRÁTICO do dia a dia
- Se for definição longa, divida em partes menores
- Se for exceção/regra, compare com regra geral
- Use linguagem simples, evite juridiquês desnecessário

EXEMPLO de "Mudança de Contexto":
Card difícil: "O que é usucapião?"
→ Exemplo prático: "João mora há 15 anos em uma casa abandonada. Ele cuida do terreno, paga impostos e ninguém reclama. João pode se tornar dono? Isso é usucapião."

Responda APENAS com JSON válido.`;

/**
 * Analisa um card que o usuário está tendo dificuldade (3 erros)
 * Sugere simplificações e exemplos práticos antes de virar leech
 */
export async function analyzeStruggleCard(
  card: StruggleCard
): Promise<{ 
  success: boolean; 
  analysis: string;
  memoryTip: string;
  simplifiedCards: SimplifiedCard[];
  error?: string;
}> {
  // SECURITY: Auth check — prevent unauthenticated API abuse
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, analysis: '', memoryTip: '', simplifiedCards: [], error: 'Usuário não autenticado' };
  }

  const isPro = await getEffectiveProAccess(supabase, user.id);
  if (!isPro) {
    return { success: false, analysis: '', memoryTip: '', simplifiedCards: [], error: 'Recurso exclusivo para assinantes Pro.' };
  }

  const { data: ownedCard, error: ownershipError } = await supabase
    .from('cards')
    .select('id, deck:decks!inner(id, user_id)')
    .eq('id', card.id)
    .eq('deck_id', card.deck_id)
    .eq('deck.user_id', user.id)
    .is('deleted_at', null)
    .single();

  if (ownershipError || !ownedCard) {
    return { success: false, analysis: '', memoryTip: '', simplifiedCards: [], error: 'Card não encontrado ou acesso negado' };
  }
  
  console.log(`[Struggle] Analisando card com dificuldade: "${card.front.substring(0, 50)}..." (${card.lapses} erros)`);

  const userPrompt = `O aluno errou este flashcard ${card.lapses} vezes:

**Pergunta:** ${card.front}

**Resposta:** ${card.back}

Analise e crie variações mais simples.

Responda com JSON:
{
  "analysis": "Por que está difícil (1-2 frases)",
  "memory_tip": "Dica de memorização (mnemônico, associação, etc.)",
  "simplified_cards": [
    {"front": "pergunta simplificada", "back": "resposta curta", "type": "simplified"},
    {"front": "exemplo prático do dia a dia", "back": "explicação", "type": "example"}
  ]
}

JSON:`;

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_MESSAGE },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 2500,
    });

    const content = completion.choices[0]?.message?.content || '{}';
    
    console.log('[Struggle] Resposta recebida, processando...');
    
    // Parse JSON
    let cleanedContent = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    
    const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanedContent = jsonMatch[0];
    }
    
    let parsed: { 
      analysis: string; 
      memory_tip: string;
      simplified_cards: SimplifiedCard[];
    };
    
    try {
      parsed = JSON.parse(cleanedContent);
    } catch {
      cleanedContent = cleanedContent.replace(/,\s*]/g, ']').replace(/,\s*}/g, '}');
      parsed = JSON.parse(cleanedContent);
    }
    
    // Filtra cards válidos
    const validCards = (parsed.simplified_cards || []).filter(c => 
      c && 
      typeof c.front === 'string' && 
      typeof c.back === 'string' &&
      c.front.length > 5 &&
      c.back.length > 2
    ).map(c => ({
      ...c,
      type: c.type || 'simplified' as const,
    }));
    
    console.log(`[Struggle] ${validCards.length} sugestões geradas`);
    
    return {
      success: true,
      analysis: parsed.analysis || 'Este card pode precisar de uma abordagem diferente.',
      memoryTip: parsed.memory_tip || 'Tente criar uma associação visual ou história.',
      simplifiedCards: validCards,
    };
    
  } catch (error) {
    console.error('[Struggle] Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return { 
      success: false, 
      analysis: '',
      memoryTip: '',
      simplifiedCards: [],
      error: errorMessage,
    };
  }
}

/**
 * Aplica as sugestões de simplificação: cria novos cards no mesmo deck
 * O card original NÃO é deletado (usuário pode continuar estudando)
 */
export async function applyStruggleSuggestions(
  originalCard: StruggleCard,
  simplifiedCards: SimplifiedCard[]
): Promise<{ success: boolean; cardsCreated: number; error?: string }> {
  
  if (simplifiedCards.length === 0) {
    return { success: false, cardsCreated: 0, error: 'Nenhum card para criar' };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { success: false, cardsCreated: 0, error: 'Usuário não autenticado' };
  }

  // SECURITY: Validate deck ownership — prevent IDOR
  const isPro = await getEffectiveProAccess(supabase, user.id);
  if (!isPro) {
    return { success: false, cardsCreated: 0, error: 'Recurso exclusivo para assinantes Pro.' };
  }

  const { data: deck, error: deckError } = await supabase
    .from('decks')
    .select('id')
    .eq('id', originalCard.deck_id)
    .eq('user_id', user.id)
    .single();

  if (deckError || !deck) {
    return { success: false, cardsCreated: 0, error: 'Deck não encontrado ou acesso negado' };
  }
  
  const now = Date.now();
  
  try {
    // Cria os novos cards simplificados no MESMO deck
    const cardsToInsert = simplifiedCards.map(card => ({
      id: `${now}-${Math.random().toString(36).substr(2, 9)}`,
      deck_id: originalCard.deck_id,
      front: card.front.trim(),
      back: card.back.trim(),
      step: 0,
      difficulty: 4.0, // Dificuldade mais baixa que o padrão (são cards simplificados)
      stability: 0,
      ease_factor: 2.5,
      lapses: 0,
      is_leech: false,
      created_at: now,
      updated_at: now,
    }));
    
    const { error: insertError } = await supabase
      .from('cards')
      .insert(cardsToInsert);
    
    if (insertError) {
      throw insertError;
    }
    
    console.log(`[Struggle] ${cardsToInsert.length} cards simplificados criados`);
    
    return { success: true, cardsCreated: cardsToInsert.length };
    
  } catch (error) {
    console.error('[Struggle] Erro ao aplicar sugestões:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return { success: false, cardsCreated: 0, error: errorMessage };
  }
}

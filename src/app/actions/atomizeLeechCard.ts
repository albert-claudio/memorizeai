'use server';

import Groq from 'groq-sdk';
import { createClient } from '@/lib/supabase/server';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

interface LeechCard {
  id: string;
  deck_id: string;
  front: string;
  back: string;
}

interface AtomicCard {
  front: string;
  back: string;
}

// System message para atomização de leeches com contexto jurídico
const SYSTEM_MESSAGE = `Você é um especialista em aprendizado e memória para estudantes de Direito.

Sua tarefa é analisar um flashcard que o aluno está tendo MUITA dificuldade (errou mais de 8 vezes) e dividí-lo em cards menores e mais simples ("Atomic Cards").

REGRAS DE ATOMIZAÇÃO:
1. O card original está muito complexo ou com informação demais
2. Divida em 2-4 cards menores, cada um com UMA única informação
3. Use a técnica do "Minimum Information Principle"
4. Cada card atômico deve testar apenas UMA coisa
5. Mantenha as perguntas objetivas e respostas curtas

REGRAS ESPECIAIS PARA DIREITO:
6. Para termos abstratos, crie um card com EXEMPLO PRÁTICO do dia a dia (Mudança de Contexto)
7. Para definições longas, separe: conceito, requisitos, efeitos, exceções
8. Para prazos/números, isole cada prazo em um card separado
9. Para exceções, compare sempre com a regra geral
10. Use linguagem simples - evite juridiquês quando possível

EXEMPLO de Atomização:
Card complexo: "Quais são os requisitos da usucapião extraordinária?"
→ Dividir em:
- "Qual o prazo da usucapião extraordinária?" → "15 anos (ou 10 anos com moradia)"
- "A usucapião extraordinária exige justo título?" → "Não, dispensa justo título e boa-fé"
- "A usucapião extraordinária exige boa-fé?" → "Não, dispensa boa-fé"
- [CONTEXTO] "João mora há 15 anos em casa abandonada, cuida do terreno e ninguém reclama. Ele pode virar dono?" → "Sim, por usucapião extraordinária"

Responda APENAS com JSON válido no formato sugerido.`;


/**
 * Analisa um card "leech" e sugere divisão em cards atômicos usando IA
 */
export async function atomizeLeechCard(
  card: LeechCard
): Promise<{ 
  success: boolean; 
  suggestion: string;
  atomicCards: AtomicCard[];
  error?: string;
}> {
  // SECURITY: Auth check — prevent unauthenticated API abuse
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, suggestion: '', atomicCards: [], error: 'Usuário não autenticado' };
  }
  
  console.log(`[Leech] Analisando card leech: "${card.front.substring(0, 50)}..."`);

  const userPrompt = `Analise este flashcard que o aluno está tendo muita dificuldade:

**Pergunta:** ${card.front}

**Resposta:** ${card.back}

Primeiro, explique brevemente por que este card pode estar difícil (1-2 frases).

Depois, divida-o em 2-4 cards atômicos menores.

Responda com JSON no formato:
{
  "analysis": "Explicação breve do problema",
  "atomic_cards": [
    {"front": "pergunta simples 1", "back": "resposta curta 1"},
    {"front": "pergunta simples 2", "back": "resposta curta 2"}
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
      temperature: 0.3,
      max_tokens: 2000,
    });

    const content = completion.choices[0]?.message?.content || '{}';
    
    console.log('[Leech] Resposta recebida, processando...');
    
    // Parse JSON
    let cleanedContent = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    
    const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanedContent = jsonMatch[0];
    }
    
    let parsed: { analysis: string; atomic_cards: AtomicCard[] };
    
    try {
      parsed = JSON.parse(cleanedContent);
    } catch {
      cleanedContent = cleanedContent.replace(/,\s*]/g, ']').replace(/,\s*}/g, '}');
      parsed = JSON.parse(cleanedContent);
    }
    
    if (!parsed.atomic_cards || !Array.isArray(parsed.atomic_cards)) {
      throw new Error('Formato inválido');
    }
    
    // Filtra cards válidos
    const validCards = parsed.atomic_cards.filter(c => 
      c && 
      typeof c.front === 'string' && 
      typeof c.back === 'string' &&
      c.front.length > 5 &&
      c.back.length > 2
    );
    
    console.log(`[Leech] ${validCards.length} cards atômicos sugeridos`);
    
    return {
      success: true,
      suggestion: parsed.analysis || 'Este card pode ser dividido em partes menores.',
      atomicCards: validCards,
    };
    
  } catch (error) {
    console.error('[Leech] Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return { 
      success: false, 
      suggestion: '', 
      atomicCards: [],
      error: errorMessage,
    };
  }
}

/**
 * Aplica a atomização: deleta o card original (soft delete) e cria os novos cards atômicos
 */
export async function applyAtomization(
  originalCard: LeechCard,
  atomicCards: AtomicCard[]
): Promise<{ success: boolean; cardsCreated: number; error?: string }> {
  
  if (atomicCards.length === 0) {
    return { success: false, cardsCreated: 0, error: 'Nenhum card para criar' };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { success: false, cardsCreated: 0, error: 'Usuário não autenticado' };
  }

  // SECURITY: Validate deck ownership — prevent IDOR
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
    // SECURITY: Soft delete with ownership check — only delete card if it belongs to user's deck
    const { error: deleteError } = await supabase
      .from('cards')
      .update({ deleted_at: now, updated_at: now })
      .eq('id', originalCard.id)
      .eq('deck_id', deck.id);
    
    if (deleteError) {
      throw deleteError;
    }
    
    // Cria os novos cards atômicos no mesmo deck
    const cardsToInsert = atomicCards.map(card => ({
      id: `${now}-${Math.random().toString(36).substr(2, 9)}`,
      deck_id: originalCard.deck_id,
      front: card.front.trim(),
      back: card.back.trim(),
      step: 0,
      difficulty: 5.0, // Dificuldade inicial padrão
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
    
    console.log(`[Leech] Card original arquivado, ${cardsToInsert.length} cards atômicos criados`);
    
    return { success: true, cardsCreated: cardsToInsert.length };
    
  } catch (error) {
    console.error('[Leech] Erro ao aplicar atomização:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return { success: false, cardsCreated: 0, error: errorMessage };
  }
}

'use server';

import Groq from 'groq-sdk';
import { createClient } from '@/lib/supabase/server';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

interface WrongCard {
  id: string;
  front: string;
  back: string;
}

interface GeneratedCard {
  front: string;
  back: string;
}

// System message para geração de reforço
const SYSTEM_MESSAGE = `Você é um professor de Direito especialista em criar flashcards de reforço.

Sua tarefa é criar NOVOS flashcards para reforçar conceitos que o aluno errou.

REGRAS:
1. Analise os flashcards que o aluno errou
2. Crie novos flashcards que abordam os MESMOS temas de formas diferentes
3. Use perguntas variadas: definição, exemplo, comparação, aplicação prática
4. NÃO repita as perguntas originais - crie novas abordagens
5. Foque em ajudar o aluno a entender melhor o conceito

Responda APENAS com JSON válido.`;

/**
 * Gera flashcards de reforço baseado nos cards que o usuário errou
 * Cria um NOVO deck de revisão separado
 */
export async function generateReinforcementCards(
  originalDeckId: string,
  originalDeckTitle: string,
  wrongCards: WrongCard[]
): Promise<{ success: boolean; cardsCreated: number; newDeckId?: string; newDeckTitle?: string; error?: string }> {
  
  if (wrongCards.length === 0) {
    return { success: false, cardsCreated: 0, error: 'Nenhum card para reforço' };
  }

  console.log(`[Reforço] Gerando reforço para ${wrongCards.length} cards errados do deck "${originalDeckTitle}"`);

  // Formata os cards errados para o prompt
  const cardsContext = wrongCards.map((card, i) => 
    `${i + 1}. Pergunta: "${card.front}"\n   Resposta: "${card.back}"`
  ).join('\n\n');

  const userPrompt = `O aluno errou os seguintes flashcards durante o estudo:

${cardsContext}

Crie ${Math.min(wrongCards.length * 2, 10)} NOVOS flashcards que reforçam esses mesmos conceitos de formas diferentes.

Para cada conceito errado, crie:
- 1 pergunta de "definição diferente" (pergunte de outro ângulo)
- 1 pergunta de "aplicação prática" ou "exemplo concreto"

Responda apenas com JSON no formato:
[{"front": "nova pergunta", "back": "resposta"}]

JSON:`;

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_MESSAGE },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 4000,
    });

    const content = completion.choices[0]?.message?.content || '[]';
    
    console.log('[Reforço] Resposta recebida, processando...');
    
    // Parse JSON
    let cleanedContent = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    
    const jsonMatch = cleanedContent.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      cleanedContent = jsonMatch[0];
    }
    
    let generatedCards: GeneratedCard[];
    
    try {
      generatedCards = JSON.parse(cleanedContent);
    } catch {
      cleanedContent = cleanedContent.replace(/,\s*]/g, ']').replace(/,\s*}/g, '}');
      generatedCards = JSON.parse(cleanedContent);
    }
    
    if (!Array.isArray(generatedCards) || generatedCards.length === 0) {
      throw new Error('Nenhum card gerado');
    }
    
    // Filtra cards válidos
    const validCards = generatedCards.filter(card => 
      card && 
      typeof card.front === 'string' && 
      typeof card.back === 'string' &&
      card.front.length > 10 &&
      card.back.length > 10
    );
    
    console.log(`[Reforço] ${validCards.length} cards válidos gerados`);
    
    if (validCards.length === 0) {
      throw new Error('Nenhum card válido gerado');
    }
    
    // Salva no banco
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('Usuário não autenticado');
    }
    
    const now = Date.now();
    
    // Cria NOVO deck de revisão
    const newDeckTitle = `📚 Revisão: ${originalDeckTitle}`;
    const newDeckId = `${now}-${Math.random().toString(36).substr(2, 9)}`;
    
    const { error: deckError } = await supabase
      .from('decks')
      .insert({
        id: newDeckId,
        user_id: user.id,
        title: newDeckTitle,
        description: `Flashcards de reforço gerados automaticamente com IA após sessão de estudo. Baseado em ${wrongCards.length} cards que precisam de revisão.`,
        created_at: now,
        updated_at: now,
      });
    
    if (deckError) {
      throw deckError;
    }
    
    console.log(`[Reforço] Novo deck criado: "${newDeckTitle}" (${newDeckId})`);
    
    // Insere os cards no novo deck
    const cardsToInsert = validCards.map(card => ({
      id: `${now}-${Math.random().toString(36).substr(2, 9)}`,
      deck_id: newDeckId,
      front: card.front.trim(),
      back: card.back.trim(),
      step: 0,
      created_at: now,
      updated_at: now,
    }));
    
    const { error: insertError } = await supabase
      .from('cards')
      .insert(cardsToInsert);
    
    if (insertError) {
      throw insertError;
    }
    
    console.log(`[Reforço] ${cardsToInsert.length} cards salvos no novo deck de revisão`);
    
    return { 
      success: true, 
      cardsCreated: cardsToInsert.length,
      newDeckId,
      newDeckTitle,
    };
    
  } catch (error) {
    console.error('[Reforço] Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return { success: false, cardsCreated: 0, error: errorMessage };
  }
}


import { normalizeCompactFlashcards } from '@/lib/ai/flashcards';
import type { ProcessLogger } from '../contracts';

export function checkBaseInsuficiente(rawText: string): { detected: true; motivo: string } | { detected: false } {
  const cleaned = rawText
    .replace(/```json\n?/gi, '')
    .replace(/```\n?/g, '')
    .trim();

  // Try parsing as a single object first (not array)
  try {
    const obj = JSON.parse(cleaned);
    if (obj && typeof obj === 'object' && !Array.isArray(obj) && obj.base_insuficiente === true) {
      return { detected: true, motivo: obj.motivo || 'Base do documento insuficiente para gerar questoes de alta fidelidade.' };
    }
  } catch {
    // Not a valid JSON object — check with regex as fallback
  }

  // Regex fallback: look for the pattern even inside malformed JSON
  if (/"base_insuficiente"\s*:\s*true/i.test(cleaned)) {
    const motivoMatch = cleaned.match(/"motivo"\s*:\s*"([^"]+)"/);
    return { detected: true, motivo: motivoMatch?.[1] || 'Base do documento insuficiente para gerar questoes de alta fidelidade.' };
  }

  return { detected: false };
}

// ============================================================================
// AI CLIENTS
// ============================================================================

export function parseAIResponse(content: string, log: ProcessLogger = () => {}): unknown[] {
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

export function normalizeParsedItems(objective: string, items: unknown[]): unknown[] {
  if (objective === 'flashcards') {
    return normalizeCompactFlashcards(items);
  }

  return items;
}


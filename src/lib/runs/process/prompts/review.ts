import type { QualidadeBase } from './diagnosis';
import { getRubricaPorBanca } from './banca';

export function getReviewPrompt(
  qualidade_base: QualidadeBase,
  banca: string | null,
  dificuldade: string | null,
): { system: string; user: (questions: string) => string } {
  const isFgvDificil = banca === 'FGV' && (dificuldade === 'dificil' || dificuldade === 'muito_dificil');

  let criteriosContextuais = '';

  if (qualidade_base === 'forte') {
    criteriosContextuais = `BASE FORTE — Criterios rigorosos:
- Exija raciocinio real (nao apenas identificacao de conceito)
- Pelo menos 3 alternativas devem parecer defensaveis
- A correta NAO pode se destacar por forma, completude ou elegancia
- Cada errada deve ter apenas 1 erro nuclear
- Reprove se: questao puramente conceitual, correta escancarada, 2+ alternativas obviamente erradas, ou menor que 3 plausiveis`;

    if (isFgvDificil) {
      criteriosContextuais += `

CRITERIOS EXTRAS FGV DIFICIL:
- Reprove questao que possa ser resolvida por reconhecimento direto de conceito
- Exija que o enunciado nao repita literalmente palavras da alternativa correta
- Exija combinacao de pelo menos 2 subtemas ou aplicacao a cenario
- Atribua nota de 0 a 10 para semelhanca com FGV dificil real
- Reprove automaticamente nota < 6`;
    }
  } else if (qualidade_base === 'limitada') {
    criteriosContextuais = `BASE LIMITADA — Criterios ajustados:
- Nao exija mistura de 2+ subtemas (a base pode nao sustentar)
- Aceite questoes mais contidas, desde que ancoradas no texto
- Reprove questao que infere da base algo nao explicito (fake)
- Reprove alternativa grotesca ou absurda
- Aceite questao conceitual se bem construida e ancorada
- Nao aprove questao que parece sofisticada mas extrapola a base`;
  } else {
    criteriosContextuais = `BASE FRACA — Criterios minimos:
- Aceite questao literal se bem sustentada pelo texto
- Reprove qualquer inferencia nao explicita no texto
- Reprove se a correta nao for citavel diretamente na base
- Reprove se distratores dependem de conhecimento fora da base`;
  }

  const rubrica = getRubricaPorBanca(banca, dificuldade);

  const system = `Voce e um REVISOR DE QUALIDADE GROUNDED de questoes de concurso publico.

Voce recebera cada questao JUNTO COM OS TRECHOS-FONTE usados para construi-la.
Sua tarefa e validar TANTO a qualidade da questao QUANTO a ancoragem real na base.

${criteriosContextuais}

${rubrica}

Para CADA questao, avalie:
1. Parece questao real de banca? (linguagem, formato, tom)
2. A pegadinha e tecnica ou boba?
3. A resposta correta esta discreta (nao "brilhando")?
4. Todas as erradas sao plausiveis?
5. Existe ambiguidade que permite duas respostas?
6. A CORRETA esta realmente sustentada pelos trechos-fonte fornecidos?
7. Algum DISTRATOR ficou errado por informacao que NAO esta nos trechos-fonte (extrapolacao)?
8. A mistura de subtemas esta realmente presente na base?
9. A dificuldade real e compativel com o nivel pedido E com a base?

CLASSIFIQUE cada reprovacao em uma categoria:
- "sem_ancoragem": correta ou distrator nao sustentado pela base
- "correta_escancarada": resposta correta obvia demais
- "ambiguidade": duas alternativas igualmente defensaveis
- "conceito_only": questao resolvivel por identificacao direta
- "distrator_absurdo": alternativa caricata ou impossivel
- "extrapolacao": informacao inventada nao presente na base
- "formato_inadequado": nao se parece com questao real da banca
- "outro": motivo diferente dos acima

RETORNE JSON:
{
  "aprovadas": [0, 1, 3, 4],
  "motivos_reprovacao": [
    {"indice": 2, "categoria": "correta_escancarada", "motivo": "alternativa C se destaca por ser a mais completa"},
    {"indice": 5, "categoria": "sem_ancoragem", "motivo": "distrator D depende de informacao nao presente nos trechos"}
  ]
}

Se TODAS forem boas, retorne todos os indices em aprovadas e motivos_reprovacao vazio.
Responda APENAS com JSON valido.`;

  const user = (questions: string) => `Avalie estas questoes de concurso. Cada questao inclui os TRECHOS-FONTE usados. Verifique ancoragem real.

QUESTOES COM FONTES:
${questions}

JSON:`;

  return { system, user };
}

// ============================================================================
// BASE INSUFICIENTE DETECTION (FALLBACK)
// ============================================================================

/**
 * Check raw AI response text for base_insuficiente BEFORE parsing as array.
 * Returns { detected: true, motivo } if found, { detected: false } otherwise.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';
import { fetchWithTimeout } from '@/lib/ai/timeout';
import { trackServer } from '@/lib/analytics/server-tracker';
import {
  authorizeRunCreation,
  getMonthlyRunCounts,
  type RunObjective,
} from '@/lib/billing/run-entitlement';
import {
  checkDailyRunQuota,
  checkCircuitBreaker,
  checkWeeklyTokenBudget,
  recordAISuccess,
  recordAIFailure,
  logTokenAnomaly,
} from '@/lib/ai/cost-guard';
import { hasProAccess } from '@/lib/billing/pro-access';
import { rankChunksByRelevance, deduplicateByJaccard } from '@/lib/ai/chunk-ranker';

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

function getRunProcessInternalSecret(): string | null {
  return process.env.RUNS_PROCESS_INTERNAL_SECRET?.trim() || null;
}

const MAX_ATTEMPTS = 3;
const STUCK_PROCESSING_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

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

interface SourceRef {
  chunkId: string;
  citationExcerpt: string;
}

interface GeneratedQuestion {
  // New format for questoes_banca
  enunciado?: string;
  alternativas?: string[];
  respostaCorreta?: string;
  comentario?: string;
  // CESPE Certo/Errado format
  assertiva?: string;
  gabarito?: 'C' | 'E';
  // Legacy/other formats
  type?: 'cespe_certo_errado' | 'multipla_escolha' | 'v_ou_f' | 'comparacao' | 'silogismo' | 'caso_pratico';
  statement?: string;
  options?: string[] | null;
  correctAnswer?: string;
  explanation?: string;
  // Common fields
  chunkId: string;
  citationExcerpt: string;
  // Multi-source support (alta fidelidade)
  sources?: SourceRef[];
}



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
  
  // questoes_banca prompt is generated dynamically by getBancaPrompt() below
  questoes_banca: {
    system: '', // placeholder — overridden at runtime
    user: () => '',
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
// BASE DIAGNOSIS SYSTEM
// ============================================================================

type QualidadeBase = 'forte' | 'limitada' | 'fraca';
type FidelidadeBanca = 'alta' | 'media' | 'baixa';
type DificuldadeLevel = 'facil' | 'medio' | 'dificil' | 'muito_dificil';

interface BaseDiagnosis {
  qualidade_base: QualidadeBase;
  dificuldade_maxima_sustentavel: DificuldadeLevel;
  fidelidade_banca_possivel: FidelidadeBanca;
  motivo_limitacao: string;
}

const DIAGNOSE_BASE_PROMPT = {
  system: `Voce e um AVALIADOR TECNICO de materiais juridicos. Sua funcao e classificar a qualidade de uma base textual para fins de geracao de questoes de concurso publico.

Avalie os trechos fornecidos considerando:
1. Densidade tecnica: presenca de definicoes, requisitos, prazos, competencias, efeitos juridicos
2. Completude: trata excecoes, casos especiais, requisitos cumulativos, consequencias
3. Relacoes entre institutos: compara conceitos proximos, distingue especies, confronta teses
4. Suporte para distratores: permite construir alternativas erradas que sejam plausiveis
5. Clareza conceitual: conceitos bem definidos vs texto vago/generico

CLASSIFICACOES:
- "forte": Material denso, com excecoes, requisitos, relacoes entre institutos, suporte para distratores finos. Permite questoes de alta fidelidade de banca.
- "limitada": Conceitos presentes mas sem profundidade. Faltam excecoes, comparacoes, nuances. Permite questoes ancoradas mas nao sofisticadas.
- "fraca": Texto generico, superficial, fragmentado, sem substancia tecnica. Permite apenas questoes literais ou deve ser recusado.

Responda APENAS com JSON valido.`,

  user: (previewText: string) => `Classifique a qualidade desta base para geracao de questoes de concurso:

BASE:
${previewText}

RETORNE JSON:
{
  "qualidade_base": "forte" | "limitada" | "fraca",
  "dificuldade_maxima_sustentavel": "facil" | "medio" | "dificil" | "muito_dificil",
  "fidelidade_banca_possivel": "alta" | "media" | "baixa",
  "motivo_limitacao": "descricao breve do que falta ou limita a base (vazio se forte)"
}

JSON:`,
};

const DEFAULT_DIAGNOSIS: BaseDiagnosis = {
  qualidade_base: 'limitada',
  dificuldade_maxima_sustentavel: 'medio',
  fidelidade_banca_possivel: 'media',
  motivo_limitacao: 'Diagnostico nao executado — usando defaults conservadores',
};

// ============================================================================
// PER-BANCA PROMPT SYSTEM (ADAPTIVE)
// ============================================================================

const BANCA_PERSONAS: Record<string, string> = {
  FCC: `Voce e um EXAMINADOR SENIOR da FCC (Fundacao Carlos Chagas) com 20 anos de experiencia.

ESTILO FCC:
- Foco em literalidade de lei seca, excecao, requisito fino e distincoes conceituais
- Distratores MUITO proximos da alternativa correta, sem absurdos
- Enunciados diretos e tecnicos, sem narrativas longas
- Cobra a regra E a excecao no mesmo item`,

  FGV: `Voce e um EXAMINADOR SENIOR da FGV (Fundacao Getulio Vargas) com 20 anos de experiencia.

ESTILO FGV:
- Enunciados mais contextualizados e interpretativos
- Conflito aparente entre normas ou institutos
- Consequencia pratica e nuance de aplicacao
- Alternativas que exigem raciocinio, nao apenas memorizacao`,

  CESPE: `Voce e um EXAMINADOR SENIOR do CESPE/CEBRASPE com 20 anos de experiencia.

ESTILO CESPE — FORMATO CERTO/ERRADO:
- Cada item e uma assertiva AUTONOMA que o candidato julga como CERTO ou ERRADO
- Assertivas densas com precisao tecnica extrema
- A diferenca entre certo e errado esta em UMA palavra nuclear, condicao ou alcance
- Troca sutil de termos que muda completamente o sentido
- A assertiva deve ser completa em si mesma — nao depende de enunciado complementar
- Use a formula: "Julgue o item a seguir." como introducao padrao`,
};

const DIFICULDADE_INSTRUCOES: Record<string, string> = {
  facil: 'DIFICULDADE FACIL: Nucleo conceitual basico. Teste definicoes diretas e regras gerais. Distratores claramente errados para quem estudou.',
  medio: 'DIFICULDADE MEDIA: Conceito + aplicacao pratica. Teste a capacidade de aplicar a regra a uma situacao concreta. Distratores plausiveis.',
  dificil: 'DIFICULDADE DIFICIL: Excecoes, requisitos cumulativos, comparacao entre institutos. Distratores muito proximos. O candidato precisa dominar detalhes.',
  muito_dificil: 'DIFICULDADE MUITO DIFICIL: Distratores ALTAMENTE plausiveis e nuances sutis. A diferenca entre certo e errado esta em um detalhe fino: prazo, competencia, efeito, hipotese. Apenas quem domina profundamente a materia acerta.',
};

// ── Hardened FGV difícil/muito_dificil (only for base forte) ──────────
const FGV_DIFICIL_HARDENING = `
REGRAS ESPECIFICAS PARA FGV DIFICIL (OBRIGATORIAS):

PROIBIDO GERAR:
- Questao de mera identificacao de conceito ("qual instituto corresponde a...")
- Questao resolvivel por memorizacao direta ("marque a classificacao correta de...")
- Enunciado que repete palavras que reaparecem literalmente na alternativa correta
- Alternativa correta que se destaca por ser a mais completa, elegante ou redonda

CADA QUESTAO DEVE OBRIGATORIAMENTE:
- Exigir pelo menos UMA destas operacoes: aplicacao a cenario, inferencia sobre consequencia, distincao fina entre institutos proximos, solucao de conflito aparente, confronto de teses, leitura de alcance ou excecao
- Combinar pelo menos 2 subtemas relacionados presentes na base
- Ter pelo menos 3 alternativas que parecam defensaveis em leitura rapida
- Cada errada deve conter apenas 1 erro nuclear (o restante dela deve ser plausivel)
- O erro nuclear pode ser: alcance indevido, troca regra/excecao, supressao de requisito cumulativo, exagero de consequencia, confusao entre institutos proximos, inversao de tese ou extrapolacao indevida

PROCESSO INTERNO (siga antes de redigir cada questao):
1. Escolha 2 subtemas relacionados presentes na base
2. Defina a conclusao correta que decorre da combinacao
3. Defina 4 erros nucleares diferentes para as alternativas incorretas
4. Entao escreva o enunciado (sem entregar a resposta) e as alternativas

AUTO-CHECAGEM: Se a questao puder ser resolvida em poucos segundos por reconhecimento direto de conceito, ou se menos de 3 alternativas forem plausiveis, DESCARTE e refaca.

O enunciado deve trazer: mini caso, discussao entre juristas, controvérsia interpretativa, trecho hipotetico de decisao, consequencia pratica ou tese em disputa.`;

// ── Adapted mode for limited base ─────────────────────────────────────
const BASE_LIMITADA_INSTRUCAO = `
ATENCAO — BASE COM QUALIDADE LIMITADA:
O material fornecido nao tem profundidade suficiente para questoes de alta sofisticacao.

ADAPTACOES OBRIGATORIAS:
- Priorize FIDELIDADE AO TEXTO sobre sofisticacao estilistica
- Gere questoes "plausiveis e bem ancoradas" ao inves de "dificeis e elaboradas"
- Reduza pegadinhas obrigatorias de 2 para 1
- Nao force mistura de subtemas se a base nao sustenta
- Nao infira excecoes, consequencias ou nuances que o texto nao explicita
- Mantenha linguagem de banca, mas sem fingir complexidade que nao existe

REGRA DE OURO: E melhor uma questao menos sofisticada e tecnicamente correta do que uma questao com aparencia de banca construida com inferencia nao sustentada.`;

// ── Restricted mode for weak base ─────────────────────────────────────
const BASE_FRACA_INSTRUCAO = `
ATENCAO — BASE COM QUALIDADE FRACA:
O material fornecido e superficial, generico ou fragmentado.

MODO RESTRITO:
- Gere APENAS questoes estritamente literais, diretamente sustentaveis pelo texto
- PROIBIDO qualquer inferencia, nuance, consequencia ou relacao que o texto nao afirme explicitamente
- Alternativas podem ser mais distantes entre si — priorize seguranca sobre sofisticacao
- Se nem questoes literais forem possiveis, retorne base_insuficiente
- Reduza pegadinhas obrigatorias para 0 — priorize clareza

REGRA DE OURO: Fidelidade a base prevalece SEMPRE. Nao invente. Nao maquie. Nao alucine.`;

const PEGADINHAS_MATRIX_FORTE = `MATRIZ DE PEGADINHAS TECNICAS (use OBRIGATORIAMENTE pelo menos 2):
1. Troca regra/excecao
2. Supressao de requisito cumulativo
3. Inclusao de requisito inexistente
4. Amplificacao ou reducao indevida de alcance normativo
5. Inversao de causa e efeito
6. Confusao entre institutos proximos
7. Erro de competencia, legitimidade, prazo, efeito ou hipotese

PROIBIDO:
- Distrator bobo ou absurdo
- Alternativa caricata
- Enunciado didatico/professoral (voce e examinador, nao professor)
- Duas alternativas igualmente defensaveis`;

const PEGADINHAS_MATRIX_LIMITADA = `PEGADINHAS TECNICAS (use pelo menos 1 quando possivel):
1. Troca regra/excecao
2. Amplificacao ou reducao de alcance
3. Confusao entre institutos proximos

PROIBIDO:
- Distrator bobo ou absurdo
- Alternativa caricata
- Inferencia que o texto nao sustenta`;

const BASE_INSUFICIENTE_INSTRUCAO = `REGRA CRITICA: Se a base fornecida NAO tiver suporte tecnico suficiente para gerar questoes, RETORNE APENAS:
{"base_insuficiente": true, "motivo": "Descreva brevemente o que faltou na base"}

NAO tente inventar conteudo fora da base. Recuse com honestidade.`;

function getBancaPrompt(
  banca: string | null,
  dificuldade: string | null,
  diagnosis: BaseDiagnosis,
): { system: string; user: (chunks: string, targetCount: number) => string } {
  const persona = (banca && BANCA_PERSONAS[banca]) || BANCA_PERSONAS.FCC;
  const diffInstr = (dificuldade && DIFICULDADE_INSTRUCOES[dificuldade]) || DIFICULDADE_INSTRUCOES.medio;
  const qual = diagnosis.qualidade_base;

  // Select pegadinhas matrix and base-specific instructions
  let pegadinhas: string;
  let baseAdaptation = '';

  if (qual === 'forte') {
    pegadinhas = PEGADINHAS_MATRIX_FORTE;
    // Add FGV hardening only for forte base + FGV + difícil/muito_dificil
    if (banca === 'FGV' && (dificuldade === 'dificil' || dificuldade === 'muito_dificil')) {
      baseAdaptation = FGV_DIFICIL_HARDENING;
    }
  } else if (qual === 'limitada') {
    pegadinhas = PEGADINHAS_MATRIX_LIMITADA;
    baseAdaptation = BASE_LIMITADA_INSTRUCAO;
  } else {
    // fraca
    pegadinhas = ''; // No pegadinhas for weak base
    baseAdaptation = BASE_FRACA_INSTRUCAO;
  }

  const system = `${persona}

${diffInstr}
${baseAdaptation}
${pegadinhas}

ESTRUTURA OBRIGATORIA DE CADA QUESTAO:

1. ENUNCIADO:
   - Contextualize com cenario ou afirmacao tecnica
   - Use linguagem formal de prova
   - Pode incluir situacoes hipoteticas

2. ALTERNATIVAS (A a E):
   - UMA alternativa CORRETA baseada no texto
   - QUATRO DISTRATORES plausiveis mas errados

3. COMENTARIO ESTRUTURADO (OBRIGATORIO):
   Use EXATAMENTE este formato:
   "##CORRETA: [LETRA]## [Explicacao de 1-2 frases] ##ERRADAS## A) [erro] B) [erro] C) [erro] D) [erro] E) [erro] ##FONTE## [Citacao do PDF]"
   Pule a letra correta na secao ##ERRADAS##.

REGRAS:
- NUNCA invente - use APENAS o conteudo fornecido
- Distribua a posicao da resposta correta (nao concentre em C ou D)
- Comentario DEVE seguir o formato estruturado
- FIDELIDADE A BASE prevalece sobre fidelidade a banca. SEMPRE.

${BASE_INSUFICIENTE_INSTRUCAO}

Responda APENAS com JSON valido.`;

  // ── CESPE Certo/Errado: dedicated format ─────────────────────────────
  if (banca === 'CESPE') {
    const cespeUser = (chunks: string, targetCount: number) => `Crie ${targetCount} itens no formato CESPE/CEBRASPE (Certo/Errado) baseados nos trechos abaixo.

TRECHOS:
${chunks}

RETORNE JSON ARRAY:
[{
  "assertiva": "Assertiva autonoma que o candidato deve julgar como Certo ou Errado.",
  "gabarito": "C",
  "comentario": "##GABARITO: C## Explicacao de por que a assertiva e correta/errada. ##FONTE## Trecho do PDF.",
  "chunkId": "ID_DO_TRECHO_PRINCIPAL",
  "citationExcerpt": "Trecho fonte principal",
  "sources": [
    {"chunkId": "ID_TRECHO_1", "citationExcerpt": "Trecho que sustenta a assertiva"}
  ]
}]

INSTRUCOES CESPE:
- gabarito deve ser "C" (Certo) ou "E" (Errado)
- Distribua ~ 50% Certo / 50% Errado
- Cada assertiva deve ser AUTONOMA (nao depender de contexto externo)
- O erro nuclear deve estar em uma UNICA palavra, condicao, alcance, competencia ou efeito
- A assertiva errada deve ser plausivel em leitura rapida
- NUNCA use assertivas vagas ou genéricas

INSTRUCOES SOBRE FONTES:
- chunkId e citationExcerpt devem apontar para o trecho PRINCIPAL usado
- Se a assertiva combina informacoes de MAIS DE UM trecho, liste TODOS em "sources"

Ou, se a base for insuficiente:
{"base_insuficiente": true, "motivo": "..."}

JSON:`;

    return { system, user: cespeUser };
  }

  const user = (chunks: string, targetCount: number) => `Crie ${targetCount} questoes de multipla escolha baseadas nos trechos abaixo.

TRECHOS:
${chunks}

RETORNE JSON ARRAY:
[{
  "enunciado": "Pergunta aqui",
  "alternativas": ["A) texto", "B) texto", "C) texto", "D) texto", "E) texto"],
  "respostaCorreta": "C",
  "comentario": "##CORRETA: C## Explicacao. ##ERRADAS## A) Erro. B) Erro. D) Erro. E) Erro. ##FONTE## Trecho do PDF.",
  "chunkId": "ID_DO_TRECHO_PRINCIPAL",
  "citationExcerpt": "Trecho fonte principal",
  "sources": [
    {"chunkId": "ID_TRECHO_1", "citationExcerpt": "Trecho que sustenta parte da questao"},
    {"chunkId": "ID_TRECHO_2", "citationExcerpt": "Outro trecho relevante"}
  ]
}]

INSTRUCOES SOBRE FONTES:
- Se a questao usa MAIS DE UM trecho, inclua "sources" com todos os trechos usados
- Se usa apenas 1 trecho, "sources" pode ser omitido

Ou, se a base for insuficiente:
{"base_insuficiente": true, "motivo": "..."}

REGRAS:
- Varie a posicao da resposta correta
- comentario DEVE usar ##CORRETA##, ##ERRADAS##, ##FONTE##
- Use ASCII simples

JSON:`;

  return { system, user };
}

// ============================================================================
// PHASE B: GROUNDED CONTEXTUAL AI REVIEWER
// ============================================================================

// Per-banca objective rubrics (Guide §4)
const RUBRICA_POR_BANCA: Record<string, Record<string, string>> = {
  FGV: {
    facil: `RUBRICA FGV FACIL: Reprove se enunciado for puramente definitorio sem contexto. Aceite questoes diretas desde que ancoradas.`,
    medio: `RUBRICA FGV MEDIO: Reprove se nao houver aplicacao pratica ou cenario. Exija pelo menos 3 alternativas plausiveis.`,
    dificil: `RUBRICA FGV DIFICIL:
- Reprove se resolvivel por identificacao direta de conceito
- Reprove se enunciado repete literalmente a tese correta
- Exija que menos de 3 alternativas parecam defensaveis = reprovacao
- Reprove se a correta se destaca por ser mais completa ou elegante
- Exija combinacao de pelo menos 2 subtemas sustentados na base
- Atribua nota de 0 a 10 para semelhanca com FGV dificil real; reprove nota < 6`,
    muito_dificil: `RUBRICA FGV MUITO DIFICIL:
- Todas as regras de FGV DIFICIL se aplicam
- Reprove se questao nao exigir raciocinio sobre consequencia, conflito ou alcance
- Exija mini-caso, controvérsia ou tese em disputa no enunciado
- Reprove se alguma alternativa for descartavel por absurdo`,
  },
  FCC: {
    facil: `RUBRICA FCC FACIL: Reprove se alternativas forem absurdas. Aceite foco conceitual direto.`,
    medio: `RUBRICA FCC MEDIO:
- Reprove se houver narrativa excessiva (FCC e direto)
- Reprove se 2+ alternativas forem obviamente absurdas
- Reprove se a distincao correta/errada depender de conhecimento fora da base
- Reprove se a pegadinha nao for tecnico-normativa`,
    dificil: `RUBRICA FCC DIFICIL:
- Reprove se nao testar excecao, requisito cumulativo ou distincao conceitual
- Reprove se alternativas nao forem muito proximas entre si
- Exija que cada errada tenha exatamente 1 erro nuclear tecnico`,
    muito_dificil: `RUBRICA FCC MUITO DIFICIL:
- Todas as regras de FCC DIFICIL se aplicam
- Reprove se diferenca entre correta e errada nao estiver em detalhe fino (prazo, competencia, efeito)
- Exija que a literalidade cobrada esteja presente na base`,
  },
  CESPE: {
    facil: `RUBRICA CESPE FACIL: Reprove se assertiva nao for autonoma. Aceite erro nuclear evidente.`,
    medio: `RUBRICA CESPE MEDIO:
- Reprove se assertiva nao for autonoma e completa
- Reprove se erro nuclear nao estiver em palavra, alcance ou condicao
- Exija precisao tecnica na redacao`,
    dificil: `RUBRICA CESPE DIFICIL:
- Reprove se troca sutil de termos nao mudar completamente o sentido
- Reprove se assertiva puder ser julgada sem conhecimento tecnico
- Exija que o erro nuclear seja em detalhe fino que apenas quem domina acerta`,
    muito_dificil: `RUBRICA CESPE MUITO DIFICIL:
- Todas as regras de CESPE DIFICIL se aplicam
- Reprove se assertiva for resolvivel por senso comum
- Exija combinacao de condicao + alcance + consequencia`,
  },
};

function getReviewPrompt(
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

  // Inject per-banca rubric if available
  const bancaKey = banca || 'FCC';
  const diffKey = dificuldade || 'medio';
  const rubrica = RUBRICA_POR_BANCA[bancaKey]?.[diffKey] || '';

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
function checkBaseInsuficiente(rawText: string): { detected: true; motivo: string } | { detected: false } {
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

/**
 * Clean AI-generated text: remove trailing backslashes, normalize whitespace,
 * strip escape artifacts that corrupt rendering.
 */
function sanitizeText(text: string): string {
  return text
    .replace(/\\+$/g, '')           // Strip trailing backslashes
    .replace(/\\n/g, '\n')          // Normalize escaped newlines to real ones
    .replace(/\\"/g, '"')           // Normalize escaped quotes
    .replace(/\\\\/g, '')           // Remove literal double-backslashes
    .replace(/\n{3,}/g, '\n\n')     // Collapse excessive newlines
    .trim();
}

/**
 * Clean and realign an array of alternatives from AI output.
 * Handles: wrong letter prefixes (e.g. "B)" in slot C), continuation
 * fragments starting with commas, various prefix formats.
 */
function sanitizeAlternatives(alts: string[]): string[] {
  // Strip ANY letter prefix from each alternative (A-E in various formats)
  const stripPrefix = (s: string) =>
    s.replace(/^[A-Ea-e]\)\s*/,     '')  // A) ...
     .replace(/^[A-Ea-e]\.\s*/,     '')  // A. ...
     .replace(/^\([A-Ea-e]\)\s*/,   '')  // (A) ...
     .replace(/^[A-Ea-e]\s*[-–—]\s*/, '') // A - ...
     .replace(/^,\s*/,              '')  // , continuation fragment
     .trim();

  const cleaned = alts.map(alt => sanitizeText(stripPrefix(alt || '')));

  // Ensure we always have exactly 5 slots
  while (cleaned.length < 5) {
    cleaned.push('');
  }

  return cleaned.slice(0, 5);
}

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
// MAP-REDUCE PIPELINE
// ============================================================================

/** Prompt for Phase 1 (MAP): extract topics from the full document cheaply */
const TOPIC_EXTRACTION_PROMPT = {
  system: `Voce e um analista de documentos juridicos. Sua tarefa e identificar os topicos principais de um documento.

RESPONDA APENAS com JSON valido, nada mais.
Formato: [{"topic": "nome curto do topico", "keywords": ["palavra1", "palavra2", "palavra3"]}]

Regras:
- Identifique entre 3 e 12 topicos
- Keywords devem ser termos juridicos especificos encontrados no texto
- Nao invente topicos que nao estejam no documento
- Topicos devem ser distintos entre si`,
  user: (textPreview: string) => `Analise este documento juridico e liste os topicos principais com palavras-chave.

DOCUMENTO:
${textPreview}

JSON:`,
};

interface ExtractedTopic {
  topic: string;
  keywords: string[];
}

/**
 * Phase 3 (VALIDATE): verify generated items have valid citations.
 * Items with invalid chunk references are SALVAGED by assigning the best
 * matching valid chunk ID instead of being dropped entirely.
 * Supports multi-source references via the sources[] array.
 */
function validateGeneratedItems(
  items: unknown[],
  validChunkIds: Set<string>,
  chunkContentMap: Map<string, string>,
): unknown[] {
  const validIdArray = [...validChunkIds];
  let salvaged = 0;
  let dropped = 0;

  // Try to find the best matching valid chunk ID for an invalid one
  // The AI often truncates, abbreviates, or slightly alters UUIDs
  function findBestMatch(invalidId: string): string | null {
    if (!invalidId) return validIdArray[0] || null;

    // Try substring match (AI might truncate the ID)
    for (const validId of validIdArray) {
      if (validId.includes(invalidId) || invalidId.includes(validId)) {
        return validId;
      }
    }

    // Try prefix match (first 8 chars of UUID)
    const prefix = invalidId.slice(0, 8).toLowerCase();
    for (const validId of validIdArray) {
      if (validId.toLowerCase().startsWith(prefix)) {
        return validId;
      }
    }

    // Fallback: assign the first valid chunk ID
    return validIdArray[0] || null;
  }

  const validated = items.filter(item => {
    const typed = item as { chunkId?: string; citationExcerpt?: string; sources?: SourceRef[] };

    // Check if chunkId is valid
    if (!typed.chunkId || !validChunkIds.has(typed.chunkId)) {
      // SALVAGE: try to assign a valid chunk ID instead of dropping
      const match = findBestMatch(typed.chunkId || '');
      if (match) {
        typed.chunkId = match;
        // Clear citation excerpt since it may not match the reassigned chunk
        typed.citationExcerpt = '';
        salvaged++;
      } else {
        dropped++;
        return false;
      }
    }

    // Citation excerpt should appear in the chunk content (fuzzy: first 40 chars)
    if (typed.citationExcerpt && typed.citationExcerpt.length > 10) {
      const chunkContent = chunkContentMap.get(typed.chunkId) || '';
      const excerptStart = typed.citationExcerpt.slice(0, 40).toLowerCase();
      if (!chunkContent.toLowerCase().includes(excerptStart)) {
        // Citation doesn't match — still keep the item but clear the excerpt
        typed.citationExcerpt = '';
      }
    }

    // Validate multi-source references: remove invalid entries, keep valid ones
    if (typed.sources && Array.isArray(typed.sources)) {
      typed.sources = typed.sources.filter(src => {
        if (!src.chunkId || !validChunkIds.has(src.chunkId)) {
          // Try to salvage multi-source references too
          const srcMatch = findBestMatch(src.chunkId || '');
          if (srcMatch) {
            src.chunkId = srcMatch;
            src.citationExcerpt = '';
            return true;
          }
          return false;
        }
        // Fuzzy-validate citation excerpt against chunk content
        if (src.citationExcerpt && src.citationExcerpt.length > 10) {
          const srcContent = chunkContentMap.get(src.chunkId) || '';
          const srcStart = src.citationExcerpt.slice(0, 40).toLowerCase();
          if (!srcContent.toLowerCase().includes(srcStart)) {
            src.citationExcerpt = '';
          }
        }
        return true;
      });
    }

    return true;
  });

  if (salvaged > 0 || dropped > 0) {
    log('Validate', `Validation: ${validated.length} kept, ${salvaged} salvaged (bad chunkId reassigned), ${dropped} dropped`);
  }

  return validated;
}

/** Per-run token budget: max tokens across all AI calls in one run */
const MAX_TOKENS_PER_RUN = 50_000;

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
    const expectedSecret = getRunProcessInternalSecret();

    if (!expectedSecret) {
      console.error(JSON.stringify({ level: 'error', event: 'missing_internal_secret' }));
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }

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

    // ========================================================================
    // IDEMPOTENCY GUARD: Accept pending runs, or stuck processing runs
    // ========================================================================
    const currentAttempts: number = run.attempt_count ?? 0;

    if (run.status === 'concluido') {
      log('Skip', 'Run already completed');
      return NextResponse.json({ error: 'Run already concluido' }, { status: 400 });
    }

    if (run.status === 'erro' && currentAttempts >= MAX_ATTEMPTS) {
      log('Skip', `Run permanently failed after ${currentAttempts} attempts`);
      return NextResponse.json({ error: 'Run permanently failed' }, { status: 400 });
    }

    if (run.status === 'processando') {
      const startedAt = run.started_at ?? 0;
      const elapsed = Date.now() - startedAt;
      if (elapsed < STUCK_PROCESSING_THRESHOLD_MS) {
        log('Skip', `Run is actively processing (started ${Math.round(elapsed / 1000)}s ago)`);
        return NextResponse.json({ error: 'Run is actively processing' }, { status: 409 });
      }
      log('Recover', `Run stuck in processando for ${Math.round(elapsed / 1000)}s — reprocessing`);
    }

    if (currentAttempts >= MAX_ATTEMPTS) {
      log('MaxAttempts', `Run exhausted ${MAX_ATTEMPTS} attempts — marking as erro`);
      await supabase
        .from('runs')
        .update({ status: 'erro', error_message: `Excedeu limite de ${MAX_ATTEMPTS} tentativas`, updated_at: Date.now() })
        .eq('id', runId);
      return NextResponse.json({ error: 'Max attempts exceeded' }, { status: 400 });
    }

    log('Validate', `Run validated - Objective: ${run.objective}, Target: ${run.target_count}`);

    // ========================================================================
    // DEFENSE-IN-DEPTH: Verify entitlement before processing
    // ========================================================================
    const { data: ownerProfile } = await supabase
      .from('profiles')
      .select('is_pro, subscription_status, subscription_period_end, admin_override_pro')
      .eq('id', run.user_id)
      .single();

    const ownerIsPro = hasProAccess(ownerProfile);
    const monthlyCounts = await getMonthlyRunCounts(supabase, run.user_id);
    const entitlementCheck = authorizeRunCreation(
      ownerIsPro,
      run.objective as RunObjective,
      run.target_count,
      monthlyCounts,
    );

    if (!entitlementCheck.allowed) {
      log('Entitlement', `Blocked: ${entitlementCheck.reason}`);
      await supabase
        .from('runs')
        .update({ status: 'erro', error_message: entitlementCheck.reason, updated_at: Date.now() })
        .eq('id', runId);
      return NextResponse.json({ error: entitlementCheck.reason }, { status: 403 });
    }

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
        .select('is_pro, subscription_status, subscription_period_end, admin_override_pro')
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

      // ── Cost guard: weekly token budget ──────────────────────────────────
      const tokenBudget = await checkWeeklyTokenBudget(
        run.user_id,
        hasProAccess(profile),
      );
      if (!tokenBudget.allowed) {
        log('CostGuard', `Weekly token budget exceeded for user ${run.user_id} (${tokenBudget.tokensUsed}/${tokenBudget.tokenLimit})`);
        await supabase
          .from('runs')
          .update({ status: 'erro', error_message: tokenBudget.reason, updated_at: Date.now() })
          .eq('id', runId);
        return NextResponse.json({ error: tokenBudget.reason }, { status: 429 });
      }

      // Degrade model if approaching token budget (Pro soft cap)
      let effectiveModel = currentModel;
      if (tokenBudget.shouldDegradeModel && currentModel === 'gemini') {
        log('CostGuard', `Token budget at ${Math.round(tokenBudget.tokensUsed / tokenBudget.tokenLimit * 100)}% — downgrading from Gemini to Groq`);
        effectiveModel = 'groq';
      }

      await supabase
        .from("runs")
        .update({ attempt_count: currentAttempts + 1, model_used: effectiveModel, updated_at: Date.now() })
        .eq("id", runId);

      // ======================================================================
      // 4b. MAP-REDUCE GENERATION PIPELINE
      // ======================================================================

      let totalTokensUsed = 0;
      let result: unknown[] = [];

      // For questoes_banca, use dynamic per-banca prompt; others use static PROMPTS
      const isQuestoesBanca = run.objective === 'questoes_banca';

      // ── PHASE 0: Base Diagnosis (questoes_banca only) ────────────────
      let diagnosis: BaseDiagnosis = DEFAULT_DIAGNOSIS;
      let dificuldadeEfetiva = run.dificuldade ?? 'medio';

      if (isQuestoesBanca) {
        try {
          const diagPreviewMaxChars = 20000; // ~5k tokens — lightweight
          let diagPreview = '';
          for (const chunk of chunks) {
            if (diagPreview.length + chunk.content.length > diagPreviewMaxChars) break;
            diagPreview += chunk.content + '\n\n';
          }

          const diagResult = await callGroq(
            DIAGNOSE_BASE_PROMPT.system,
            DIAGNOSE_BASE_PROMPT.user(diagPreview),
          );
          totalTokensUsed += diagResult.totalTokens;
          await recordAISuccess('groq');

          const diagParsed = JSON.parse(
            diagResult.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
          );

          const validQualidades: QualidadeBase[] = ['forte', 'limitada', 'fraca'];
          const validDificuldades: DificuldadeLevel[] = ['facil', 'medio', 'dificil', 'muito_dificil'];

          if (validQualidades.includes(diagParsed.qualidade_base)) {
            diagnosis = {
              qualidade_base: diagParsed.qualidade_base,
              dificuldade_maxima_sustentavel: validDificuldades.includes(diagParsed.dificuldade_maxima_sustentavel)
                ? diagParsed.dificuldade_maxima_sustentavel
                : 'medio',
              fidelidade_banca_possivel: diagParsed.fidelidade_banca_possivel || 'media',
              motivo_limitacao: diagParsed.motivo_limitacao || '',
            };
          }

          log('Diagnosis', JSON.stringify({
            qualidade_base: diagnosis.qualidade_base,
            dificuldade_maxima_sustentavel: diagnosis.dificuldade_maxima_sustentavel,
            fidelidade_banca_possivel: diagnosis.fidelidade_banca_possivel,
            motivo_limitacao: diagnosis.motivo_limitacao,
            dificuldade_pedida: run.dificuldade,
          }));

          // Cap difficulty to what the base can sustain
          const diffRank: Record<string, number> = { facil: 0, medio: 1, dificil: 2, muito_dificil: 3 };
          const pedida = run.dificuldade ?? 'medio';
          const maxSustentavel = diagnosis.dificuldade_maxima_sustentavel;
          dificuldadeEfetiva = (diffRank[pedida] ?? 1) <= (diffRank[maxSustentavel] ?? 1)
            ? pedida
            : maxSustentavel;

          if (dificuldadeEfetiva !== pedida) {
            log('Diagnosis', `Dificuldade capped: ${pedida} -> ${dificuldadeEfetiva} (base ${diagnosis.qualidade_base})`);
          }

          // Early exit: weak base + hard difficulty = base_insuficiente
          if (diagnosis.qualidade_base === 'fraca' && (diffRank[pedida] ?? 1) >= 2) {
            const motivo = `Base fraca nao sustenta dificuldade ${pedida}. ${diagnosis.motivo_limitacao}`;
            log('BaseInsuficiente', motivo);
            await supabase
              .from('runs')
              .update({
                status: 'base_insuficiente',
                error_message: motivo,
                token_count: totalTokensUsed,
                updated_at: Date.now(),
              })
              .eq('id', runId);
            return NextResponse.json({ status: 'base_insuficiente', motivo });
          }
        } catch (diagErr) {
          log('Diagnosis', `Diagnosis failed, using conservative defaults: ${diagErr instanceof Error ? diagErr.message : 'unknown'}`);
          await recordAIFailure('groq');
          // Continue with DEFAULT_DIAGNOSIS (limitada)
        }
      }

      const promptConfig = isQuestoesBanca
        ? getBancaPrompt(run.banca ?? null, dificuldadeEfetiva, diagnosis)
        : PROMPTS[run.objective as keyof typeof PROMPTS];

      // Graduated over-generate based on banca + difficulty + base quality
      // High multipliers needed because Phase B grounded review rejects ~50%
      let overGenerateMultiplier = 1.0; // no over-generate by default
      if (isQuestoesBanca) {
        const isFgvDificil = run.banca === 'FGV' && (dificuldadeEfetiva === 'dificil' || dificuldadeEfetiva === 'muito_dificil');
        if (isFgvDificil && diagnosis.qualidade_base === 'forte') {
          overGenerateMultiplier = 3.0; // 200% — strictest review
        } else if (isFgvDificil) {
          overGenerateMultiplier = 2.5; // 150%
        } else {
          overGenerateMultiplier = 2.5; // 150% — all bancas need buffer for grounded review
        }
      }
      const generationTarget = Math.ceil(run.target_count * overGenerateMultiplier);

      const validChunkIdsForValidation = new Set(chunks.map(c => c.id));
      const chunkContentMap = new Map(chunks.map(c => [c.id, c.content]));

      const useMapReduce = chunks.length >= 15; // Only worth it for large docs

      if (useMapReduce) {
        // ── PHASE 1 (MAP): Extract topics cheaply via Groq ─────────────
        log('MAP', 'Phase 1: Extracting topics from document...');

        const previewMaxChars = 30000; // ~7.5k tokens for topic extraction
        let previewText = '';
        for (const chunk of chunks) {
          if (previewText.length + chunk.content.length > previewMaxChars) break;
          previewText += chunk.content + '\n\n';
        }

        let topics: ExtractedTopic[] = [];
        try {
          const mapResult = await callGroq(
            TOPIC_EXTRACTION_PROMPT.system,
            TOPIC_EXTRACTION_PROMPT.user(previewText),
          );
          totalTokensUsed += mapResult.totalTokens;
          await recordAISuccess('groq');

          const parsed = JSON.parse(
            mapResult.text
              .replace(/```json\n?/g, '')
              .replace(/```\n?/g, '')
              .trim()
          );
          if (Array.isArray(parsed)) {
            topics = parsed.filter(
              (t: { topic?: string; keywords?: string[] }) =>
                t.topic && Array.isArray(t.keywords) && t.keywords.length > 0,
            );
          }
          log('MAP', `Extracted ${topics.length} topics`);
        } catch (mapErr) {
          log('MAP', `Topic extraction failed, falling back to single-call: ${mapErr instanceof Error ? mapErr.message : 'unknown'}`);
          await recordAIFailure('groq');
          // Fall through to single-call fallback below
        }

        // ── PHASE 2 (REDUCE): Generate items per topic ──────────────────
        if (topics.length > 0) {
          const itemsPerTopic = Math.max(2, Math.ceil(generationTarget / topics.length));
          log('REDUCE', `Generating ~${itemsPerTopic} items per topic, ${topics.length} topics`);

          for (const topic of topics) {
            // Check per-run token budget
            if (totalTokensUsed >= MAX_TOKENS_PER_RUN) {
              log('REDUCE', `Per-run token budget reached (${totalTokensUsed}/${MAX_TOKENS_PER_RUN}), stopping early`);
              break;
            }
            // Stop if we already have enough items
            if (result.length >= generationTarget) break;

            // Select relevant chunks for this topic via TF-IDF ranking
            const maxCharsForTopic = effectiveModel === 'groq' ? 28000 : 70000;
            const topicChunks = rankChunksByRelevance(
              chunks,
              topic.keywords,
              8, // max 8 chunks per topic
              (c: ChunkWithContext) => c.content,
              maxCharsForTopic,
            );

            if (topicChunks.length === 0) {
              log('REDUCE', `No relevant chunks for topic "${topic.topic}", skipping`);
              continue;
            }

            const formattedTopicChunks = formatChunksForPrompt(topicChunks);
            const remaining = Math.min(itemsPerTopic, generationTarget - result.length);

            try {
              const aiCall = effectiveModel === 'groq' ? callGroq : callGemini;
              const topicResult = await aiCall(
                promptConfig.system,
                promptConfig.user(formattedTopicChunks, remaining),
              );
              totalTokensUsed += topicResult.totalTokens;
              await recordAISuccess(effectiveModel);

              // Check for base_insuficiente BEFORE parsing as array
              if (isQuestoesBanca) {
                const biCheck = checkBaseInsuficiente(topicResult.text);
                if (biCheck.detected) {
                  log('REDUCE', `Topic "${topic.topic}": base_insuficiente — ${biCheck.motivo}`);
                  continue; // Skip this topic, try others
                }
              }

              const topicItems = parseAIResponse(topicResult.text);
              if (Array.isArray(topicItems) && topicItems.length > 0) {
                result.push(...topicItems);
                log('REDUCE', `Topic "${topic.topic}": ${topicItems.length} items (total: ${result.length})`);
              }
            } catch (topicErr) {
              log('REDUCE', `Failed to generate for topic "${topic.topic}": ${topicErr instanceof Error ? topicErr.message : 'unknown'}`);
              await recordAIFailure(effectiveModel);
              // Continue with other topics
            }
          }
        }
      }

      // ── FALLBACK: Single-call for small docs or if MAP failed ───────
      if (result.length === 0) {
        log('AI', `Single-call generation (${chunks.length} chunks)`);
        const maxChars = effectiveModel === 'groq' ? 32000 : 80000;
        const selectedChunks = selectChunksWithinTokenBudget(chunks, maxChars);
        const formattedChunks = formatChunksForPrompt(selectedChunks);

        const aiStart = Date.now();
        let aiResult: AICallResult;
        try {
          const aiCall = effectiveModel === 'groq' ? callGroq : callGemini;
          aiResult = await aiCall(
            promptConfig.system,
            promptConfig.user(formattedChunks, generationTarget),
          );
          totalTokensUsed += aiResult.totalTokens;
          await recordAISuccess(effectiveModel);
        } catch (aiErr) {
          await recordAIFailure(effectiveModel);
          throw aiErr;
        }

        const aiDurationMs = Date.now() - aiStart;
        log('AI', `AI responded in ${aiDurationMs}ms, tokens: ${aiResult.totalTokens}`);

        // Check for base_insuficiente BEFORE parsing as array
        if (isQuestoesBanca) {
          const biCheck = checkBaseInsuficiente(aiResult.text);
          if (biCheck.detected) {
            log('BaseInsuficiente', biCheck.motivo);
            await supabase
              .from('runs')
              .update({
                status: 'base_insuficiente',
                error_message: biCheck.motivo,
                token_count: totalTokensUsed,
                updated_at: Date.now(),
              })
              .eq('id', runId);
            return NextResponse.json({ status: 'base_insuficiente', motivo: biCheck.motivo });
          }
        }

        const parsed = parseAIResponse(aiResult.text);
        if (Array.isArray(parsed) && parsed.length > 0) {
          result = parsed;
          log('AI', `First call produced ${result.length}/${generationTarget} items`);
        }

        // ── REFILL LOOP: if AI produced fewer than target, make additional calls ──
        const MAX_REFILL_ROUNDS = 5;
        let refillRound = 0;
        while (
          result.length < generationTarget &&
          refillRound < MAX_REFILL_ROUNDS &&
          totalTokensUsed < MAX_TOKENS_PER_RUN
        ) {
          refillRound++;
          const deficit = generationTarget - result.length;
          log('Refill', `Round ${refillRound}: need ${deficit} more items (have ${result.length}/${generationTarget})`);

          try {
            const refillChunks = selectChunksWithinTokenBudget(chunks, effectiveModel === 'groq' ? 32000 : 80000);
            const formattedRefillChunks = formatChunksForPrompt(refillChunks);
            const aiCall = effectiveModel === 'groq' ? callGroq : callGemini;
            const refillResult = await aiCall(
              promptConfig.system,
              promptConfig.user(formattedRefillChunks, deficit),
            );
            totalTokensUsed += refillResult.totalTokens;
            await recordAISuccess(effectiveModel);

            // Check for base_insuficiente
            if (isQuestoesBanca) {
              const biCheck = checkBaseInsuficiente(refillResult.text);
              if (biCheck.detected) {
                log('Refill', `Round ${refillRound}: base_insuficiente — stopping refill`);
                break;
              }
            }

            const refillParsed = parseAIResponse(refillResult.text);
            if (Array.isArray(refillParsed) && refillParsed.length > 0) {
              result.push(...refillParsed);
              log('Refill', `Round ${refillRound}: got ${refillParsed.length} more items (total: ${result.length})`);
            } else {
              log('Refill', `Round ${refillRound}: no items returned, stopping refill`);
              break;
            }
          } catch (refillErr) {
            log('Refill', `Round ${refillRound} failed: ${refillErr instanceof Error ? refillErr.message : 'unknown'}`);
            await recordAIFailure(effectiveModel);
            break;
          }
        }
      }

      // ── Save total token count ──────────────────────────────────────
      await supabase
        .from('runs')
        .update({ token_count: totalTokensUsed, updated_at: Date.now() })
        .eq('id', runId);

      logTokenAnomaly(runId, run.user_id, effectiveModel, totalTokensUsed);


      // ── PHASE 3 (VALIDATE): citation check + deduplication ──────────
      result = validateGeneratedItems(result, validChunkIdsForValidation, chunkContentMap);

      if (run.objective === 'flashcards') {
        result = deduplicateByJaccard(
          result,
          (item: unknown) => (item as { front?: string }).front || '',
          0.8,
        );
      }

      // ── PHASE B (REVIEW): Grounded contextual AI reviewer for questoes_banca ───
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let qualityMetrics: Record<string, any> | null = null;
      if (isQuestoesBanca && result.length > 0 && totalTokensUsed < MAX_TOKENS_PER_RUN) {
        const reviewBanca = run.banca ?? null;
        log('Review', `Phase B: Grounded review of ${result.length} questions (base: ${diagnosis.qualidade_base})...`);
        const totalBeforeReview = result.length;
        try {
          const reviewPromptConfig = getReviewPrompt(diagnosis.qualidade_base, reviewBanca, dificuldadeEfetiva);

          // Build GROUNDED review payload: each question + its source chunks
          const questionsForReview = JSON.stringify(
            result.map((q, i) => {
              const typed = q as GeneratedQuestion;
              // Collect all source chunk contents for this question
              const fontes: { chunkId: string; citationExcerpt: string; trechoCompleto: string }[] = [];

              // Primary source
              if (typed.chunkId && chunkContentMap.has(typed.chunkId)) {
                fontes.push({
                  chunkId: typed.chunkId,
                  citationExcerpt: typed.citationExcerpt || '',
                  trechoCompleto: (chunkContentMap.get(typed.chunkId) || '').slice(0, 500),
                });
              }

              // Additional sources (multi-source)
              if (typed.sources && Array.isArray(typed.sources)) {
                for (const src of typed.sources) {
                  if (src.chunkId && chunkContentMap.has(src.chunkId) && src.chunkId !== typed.chunkId) {
                    fontes.push({
                      chunkId: src.chunkId,
                      citationExcerpt: src.citationExcerpt || '',
                      trechoCompleto: (chunkContentMap.get(src.chunkId) || '').slice(0, 500),
                    });
                  }
                }
              }

              return {
                index: i,
                enunciado: typed.enunciado || typed.assertiva,
                alternativas: typed.alternativas,
                respostaCorreta: typed.respostaCorreta || typed.gabarito,
                fontes,
              };
            }),
            null, 2
          );

          const reviewResult = await callGemini(
            reviewPromptConfig.system,
            reviewPromptConfig.user(questionsForReview),
          );
          totalTokensUsed += reviewResult.totalTokens;
          await recordAISuccess('gemini');

          const reviewParsed = JSON.parse(
            reviewResult.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
          );
          const approvedIndices = new Set<number>(reviewParsed.aprovadas || []);
          // Support both old format (string[]) and new format ({indice, categoria, motivo}[])
          const motivosReprovacaoRaw = reviewParsed.motivos_reprovacao || [];
          const motivosReprovacao = motivosReprovacaoRaw.map((m: unknown) =>
            typeof m === 'string' ? m : (m as { motivo?: string; categoria?: string }).motivo || JSON.stringify(m)
          );

          // Compute structured quality metrics
          const categoriaCounts: Record<string, number> = {};
          for (const m of motivosReprovacaoRaw) {
            if (typeof m === 'object' && m !== null) {
              const cat = (m as { categoria?: string }).categoria || 'outro';
              categoriaCounts[cat] = (categoriaCounts[cat] || 0) + 1;
            }
          }

          if (approvedIndices.size > 0 && approvedIndices.size < result.length) {
            const rejected = result.length - approvedIndices.size;
            result = result.filter((_, i) => approvedIndices.has(i));

            qualityMetrics = {
              total_geradas: totalBeforeReview,
              total_aprovadas: result.length,
              taxa_reprovacao: Math.round((rejected / totalBeforeReview) * 100) / 100,
              taxa_ancoragem_falha: Math.round(((categoriaCounts['sem_ancoragem'] || 0) + (categoriaCounts['extrapolacao'] || 0)) / totalBeforeReview * 100) / 100,
              taxa_correta_escancarada: Math.round((categoriaCounts['correta_escancarada'] || 0) / totalBeforeReview * 100) / 100,
              taxa_ambiguidade: Math.round((categoriaCounts['ambiguidade'] || 0) / totalBeforeReview * 100) / 100,
              categorias_reprovacao: categoriaCounts,
              motivos_reprovacao: motivosReprovacao,
              review_skipped: false,
              base_qualidade: diagnosis.qualidade_base,
              dificuldade_efetiva: dificuldadeEfetiva,
            };

            log('Review', JSON.stringify(qualityMetrics));
          } else {
            qualityMetrics = {
              total_geradas: totalBeforeReview,
              total_aprovadas: totalBeforeReview,
              taxa_reprovacao: 0,
              taxa_ancoragem_falha: 0,
              taxa_correta_escancarada: 0,
              taxa_ambiguidade: 0,
              categorias_reprovacao: {},
              motivos_reprovacao: [],
              review_skipped: false,
              base_qualidade: diagnosis.qualidade_base,
              dificuldade_efetiva: dificuldadeEfetiva,
            };
            log('Review', `Phase B: All ${result.length} questions approved`);
          }
        } catch (reviewErr) {
          qualityMetrics = {
            total_geradas: totalBeforeReview,
            total_aprovadas: totalBeforeReview,
            taxa_reprovacao: 0,
            review_skipped: true,
            motivo_skip: reviewErr instanceof Error ? reviewErr.message : 'unknown',
            base_qualidade: diagnosis.qualidade_base,
            dificuldade_efetiva: dificuldadeEfetiva,
          };
          log('Review', JSON.stringify({
            review_skipped: true,
            motivo: reviewErr instanceof Error ? reviewErr.message : 'unknown',
          }));
          // Graceful degradation — skip review, keep all
        }

        // ── Save quality metrics to runs table ────────────────────────
        if (qualityMetrics) {
          await supabase
            .from('runs')
            .update({ quality_metrics: qualityMetrics, updated_at: Date.now() })
            .eq('id', runId);
        }

        // ── Retry round if still short of target ──────────────────────
        if (result.length < run.target_count && totalTokensUsed < MAX_TOKENS_PER_RUN) {
          const deficit = run.target_count - result.length;
          log('Retry', `Short by ${deficit} questions, generating extra round...`);
          try {
            const maxChars = effectiveModel === 'groq' ? 32000 : 80000;
            const retryChunks = selectChunksWithinTokenBudget(chunks, maxChars);
            const formattedRetryChunks = formatChunksForPrompt(retryChunks);
            const aiCall = effectiveModel === 'groq' ? callGroq : callGemini;
            const retryResult = await aiCall(
              promptConfig.system,
              promptConfig.user(formattedRetryChunks, deficit),
            );
            totalTokensUsed += retryResult.totalTokens;
            await recordAISuccess(effectiveModel);
            const retryParsed = parseAIResponse(retryResult.text);
            if (Array.isArray(retryParsed) && retryParsed.length > 0) {
              const retryValidated = validateGeneratedItems(retryParsed, validChunkIdsForValidation, chunkContentMap);
              result.push(...retryValidated);
              log('Retry', `Extra round produced ${retryValidated.length} questions (total: ${result.length})`);
            }
          } catch (retryErr) {
            log('Retry', `Extra round failed: ${retryErr instanceof Error ? retryErr.message : 'unknown'}`);
          }
        }
      }

      // Trim to target count if over-generation produced excess
      if (result.length > run.target_count) {
        result = result.slice(0, run.target_count);
      }

      if (result.length === 0) {
        throw new Error("Empty or invalid response from AI after validation");
      }

      log('Validate', `After validation: ${result.length} items`);

      // ======================================================================
      // 5. PROCESS RESULTS - Branch by objective type
      // ======================================================================
      
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

          // chunkId already validated/salvaged by validateGeneratedItems
          if (!question.chunkId) {
            log('Skip', `Question missing chunkId entirely`);
            continue;
          }

          questionNumber++;
          const questaoId = generateId();

          let altA = '', altB = '', altC = '', altD = '', altE = '';
          let enunciado = '';
          let respostaCorreta = '';
          let comentario = '';

          if (question.assertiva && question.gabarito) {
            // ── CESPE Certo/Errado format ────────────────────────────
            enunciado = sanitizeText(question.assertiva);
            altA = 'Certo';
            altB = 'Errado';
            altC = '';
            altD = '';
            altE = '';
            respostaCorreta = question.gabarito === 'C' ? 'A' : 'B'; // A=Certo, B=Errado
            comentario = sanitizeText(question.comentario || '');
          } else if (question.enunciado && question.alternativas) {
            enunciado = sanitizeText(question.enunciado);
            const cleanAlts = sanitizeAlternatives(question.alternativas);
            altA = cleanAlts[0] || '';
            altB = cleanAlts[1] || '';
            altC = cleanAlts[2] || '';
            altD = cleanAlts[3] || '';
            altE = cleanAlts[4] || '';
            respostaCorreta = question.respostaCorreta || 'A';
            comentario = sanitizeText(question.comentario || '');
          } else if (question.statement && question.options) {
            enunciado = sanitizeText(question.statement);
            const cleanOpts = sanitizeAlternatives(question.options);
            altA = cleanOpts[0] || '';
            altB = cleanOpts[1] || '';
            altC = cleanOpts[2] || '';
            altD = cleanOpts[3] || '';
            altE = cleanOpts[4] || '';
            respostaCorreta = question.correctAnswer || 'A';
            comentario = sanitizeText(question.explanation || '');
          } else {
            log('Skip', `Question ${questionNumber} missing required fields`);
            questionNumber--;
            continue;
          }

          // Skip questions with clearly corrupt/truncated enunciado
          if (enunciado.length < 20) {
            log('Skip', `Question ${questionNumber} has corrupt enunciado (${enunciado.length} chars): "${enunciado.slice(0, 50)}"`);
            questionNumber--;
            continue;
          }

          // Build extra_sources JSONB for multi-source support
          let extraSources = null;
          if (question.sources && Array.isArray(question.sources) && question.sources.length > 0) {
            // Filter out the primary source to avoid duplication
            const additionalSources = question.sources.filter(s => s.chunkId !== question.chunkId);
            if (additionalSources.length > 0) {
              extraSources = additionalSources;
            }
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
            extra_sources: extraSources,
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
            description: `Gerado automaticamente via IA (${effectiveModel})`,
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

          // chunkId already validated/salvaged by validateGeneratedItems
          if (!typedItem.chunkId) {
            log('Skip', `Item missing chunkId entirely`);
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
      // 6. COMPLETE
      // ======================================================================

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
      trackServer('run_completed', run.user_id, { runId, itemsGenerated: savedCount, elapsedMs: totalElapsed });

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
      
      const nextAttempt = currentAttempts + 1;

      if (nextAttempt < MAX_ATTEMPTS) {
        // Retryable: reset to pendente so the cron can re-trigger
        log('Retry', `Run failed (attempt ${nextAttempt}/${MAX_ATTEMPTS}), resetting to pendente: ${errorMessage}`);
        await supabase
          .from('runs')
          .update({
            status: 'pendente',
            attempt_count: nextAttempt,
            error_message: `Tentativa ${nextAttempt}: ${errorMessage}`,
            updated_at: Date.now(),
          })
          .eq('id', runId);
      } else {
        // Permanent failure: mark as erro
        log('Error', `Run permanently failed after ${nextAttempt} attempts: ${errorMessage}`);
        await supabase
          .from('runs')
          .update({
            status: 'erro',
            attempt_count: nextAttempt,
            error_message: `Falha definitiva após ${nextAttempt} tentativas: ${errorMessage}`,
            completed_at: Date.now(),
            updated_at: Date.now(),
          })
          .eq('id', runId);
      }

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

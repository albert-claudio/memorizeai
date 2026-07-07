export type QualidadeBase = 'forte' | 'limitada' | 'fraca';
export type FidelidadeBanca = 'alta' | 'media' | 'baixa';
export type DificuldadeLevel = 'facil' | 'medio' | 'dificil' | 'muito_dificil';

export interface BaseDiagnosis {
  qualidade_base: QualidadeBase;
  dificuldade_maxima_sustentavel: DificuldadeLevel;
  fidelidade_banca_possivel: FidelidadeBanca;
  motivo_limitacao: string;
}

export const DIAGNOSE_BASE_PROMPT = {
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

export const DEFAULT_DIAGNOSIS: BaseDiagnosis = {
  qualidade_base: 'limitada',
  dificuldade_maxima_sustentavel: 'medio',
  fidelidade_banca_possivel: 'media',
  motivo_limitacao: 'Diagnostico nao executado — usando defaults conservadores',
};


export interface ResultQuestionLike {
  numero: number;
  enunciado?: string | null;
  comentario?: string | null;
  citation_excerpt?: string | null;
}

export interface ResultAnswerLike {
  resposta_usuario?: string | null;
  correta?: boolean | null;
  questao: ResultQuestionLike;
}

export interface WeakTopicSummary {
  topic: string;
  errorType: string;
  count: number;
  questionNumbers: number[];
  keywords: string[];
  query: string;
}

const STOP_WORDS = new Set([
  'ainda',
  'alem',
  'alternativa',
  'alternativas',
  'analise',
  'apenas',
  'apos',
  'aquela',
  'aquele',
  'aquilo',
  'assim',
  'assinale',
  'assertiva',
  'cada',
  'caso',
  'cerca',
  'com',
  'como',
  'correta',
  'correto',
  'dado',
  'deve',
  'devem',
  'direito',
  'dispoe',
  'durante',
  'essa',
  'esse',
  'esta',
  'estao',
  'este',
  'forma',
  'incorreta',
  'incorreto',
  'item',
  'julgue',
  'mais',
  'menos',
  'mesmo',
  'muito',
  'neste',
  'nessa',
  'nesse',
  'para',
  'pela',
  'pelo',
  'pode',
  'podem',
  'pois',
  'porque',
  'questao',
  'questoes',
  'quanto',
  'qual',
  'quando',
  'relação',
  'relacao',
  'resposta',
  'segundo',
  'seja',
  'serao',
  'seria',
  'sobre',
  'somente',
  'simulado',
  'termos',
  'todas',
  'todos',
  'trata',
  'treino',
  'voce',
]);

const IMPORTANT_SHORT_TOKENS = new Set(['ato', 'lei', 'sus', 'sql']);

const TOPIC_RULES = [
  { label: 'Padroes comportamentais', keys: ['observer', 'strategy', 'state pattern', 'command', 'iterator', 'template method', 'visitor', 'mediator', 'memento', 'comportamento', 'estados'] },
  { label: 'Padroes estruturais', keys: ['facade', 'adapter', 'decorator', 'proxy', 'composite', 'bridge', 'flyweight', 'subsistemas', 'interface simplificada'] },
  { label: 'Padroes criacionais', keys: ['factory', 'singleton', 'builder', 'prototype', 'abstract factory', 'criacao', 'instancia'] },
  { label: 'Design patterns em Python', keys: ['design patterns', 'pattern', 'patterns', 'padrao de projeto', 'padroes de projeto', 'python', 'classe', 'objeto', 'interface'] },
  { label: 'Direito constitucional', keys: ['constitucional', 'constituicao', 'direitos fundamentais', 'controle de constitucionalidade'] },
  { label: 'Direito administrativo', keys: ['administrativo', 'licitacao', 'servidor publico', 'ato administrativo', 'administracao publica'] },
  { label: 'Direito civil', keys: ['civil', 'contrato', 'obrigacao', 'responsabilidade civil', 'posse', 'propriedade'] },
  { label: 'Direito penal', keys: ['penal', 'crime', 'pena', 'tipicidade', 'culpabilidade'] },
  { label: 'Processo civil', keys: ['processo civil', 'recurso', 'sentenca', 'competencia', 'jurisdicao'] },
  { label: 'Processo penal', keys: ['processo penal', 'inquerito', 'acao penal', 'prisao', 'prova'] },
  { label: 'Direito tributario', keys: ['tributario', 'tributo', 'imposto', 'credito tributario', 'lancamento'] },
  { label: 'Portugues', keys: ['crase', 'concordancia', 'regencia', 'pontuacao', 'pronome'] },
  { label: 'Matematica e raciocinio logico', keys: ['porcentagem', 'probabilidade', 'equacao', 'logica', 'raciocinio'] },
  { label: 'Prazos e requisitos', keys: ['prazo', 'prescricao', 'decadencia', 'requisito', 'condicao'] },
  { label: 'Competencia e legitimidade', keys: ['competencia', 'competente', 'legitimidade', 'legitimado'] },
  { label: 'Excecoes e pegadinhas', keys: ['excecao', 'salvo', 'vedado', 'exceto', 'ressalvado'] },
  { label: 'Efeitos e consequencias', keys: ['efeito', 'consequencia', 'nulidade', 'validade', 'responsabilidade'] },
  { label: 'Conceitos centrais', keys: ['conceito', 'principio', 'definicao', 'natureza', 'classificacao'] },
];

const TOPIC_SEARCH_PHRASES = new Map<string, string>([
  ['padroes comportamentais', 'padroes comportamentais design patterns python'],
  ['padroes estruturais', 'padroes estruturais design patterns python'],
  ['padroes criacionais', 'padroes criacionais design patterns python'],
  ['design patterns em python', 'design patterns python exemplos'],
  ['direito constitucional', 'direito constitucional resumo'],
  ['direito administrativo', 'direito administrativo resumo'],
  ['direito civil', 'direito civil resumo'],
  ['direito penal', 'direito penal resumo'],
  ['processo civil', 'processo civil resumo'],
  ['processo penal', 'processo penal resumo'],
  ['direito tributario', 'direito tributario resumo'],
]);

export function normalizeStudyText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function rowText(row: ResultAnswerLike): string {
  return [
    row.questao.enunciado,
    row.questao.comentario,
    row.questao.citation_excerpt,
  ]
    .filter(Boolean)
    .join(' ');
}

export function isWrongAnswer(row: ResultAnswerLike): boolean {
  return row.correta === false || row.resposta_usuario === null;
}

export function inferTopic(row: ResultAnswerLike): string {
  const text = normalizeStudyText(rowText(row));
  const matched = TOPIC_RULES.find((topic) => topic.keys.some((key) => text.includes(normalizeStudyText(key))));

  if (matched) {
    return matched.label;
  }

  const keywords = extractKeywords(row, 2);
  return keywords.length > 0 ? keywords.map(toTitleCase).join(', ') : 'Tema do material';
}

export function inferErrorType(row: ResultAnswerLike): string {
  if (!row.resposta_usuario) return 'Questao deixada em branco';

  const text = normalizeStudyText(rowText(row));
  if (text.includes('prazo') || text.includes('art.') || text.includes('lei')) return 'Erro de literalidade';
  if (text.includes('caso') || text.includes('situacao') || text.includes('hipotet')) return 'Erro de aplicacao';
  if (text.includes('excecao') || text.includes('salvo') || text.includes('exceto')) return 'Confusao entre regra e excecao';
  if (text.includes('competencia') || text.includes('legitim')) return 'Confusao de competencia ou legitimidade';
  return 'Lacuna conceitual';
}

export function extractKeywords(row: ResultAnswerLike, maxKeywords: number = 6): string[] {
  const text = normalizeStudyText(rowText(row));
  const tokens = text.match(/[a-z0-9]{3,}/g) ?? [];
  const counts = new Map<string, number>();

  for (const token of tokens) {
    if (!IMPORTANT_SHORT_TOKENS.has(token) && token.length < 4) continue;
    if (/^\d+$/.test(token) && token.length < 4) continue;
    if (STOP_WORDS.has(token)) continue;

    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, maxKeywords)
    .map(([keyword]) => keyword);
}

export function buildWeakTopicSummaries(
  respostas: ResultAnswerLike[],
  simuladoTitle?: string | null,
  maxTopics: number = 3,
): WeakTopicSummary[] {
  const groups = new Map<string, {
    count: number;
    errorTypes: Map<string, number>;
    keywordCounts: Map<string, number>;
    questionNumbers: Set<number>;
  }>();

  for (const row of respostas.filter(isWrongAnswer)) {
    const topic = inferTopic(row);
    const errorType = inferErrorType(row);
    const keywords = extractKeywords(row, 6);
    const group = groups.get(topic) ?? {
      count: 0,
      errorTypes: new Map<string, number>(),
      keywordCounts: new Map<string, number>(),
      questionNumbers: new Set<number>(),
    };

    group.count += 1;
    group.errorTypes.set(errorType, (group.errorTypes.get(errorType) ?? 0) + 1);
    group.questionNumbers.add(row.questao.numero);

    for (const keyword of keywords) {
      group.keywordCounts.set(keyword, (group.keywordCounts.get(keyword) ?? 0) + 1);
    }

    groups.set(topic, group);
  }

  return [...groups.entries()]
    .map(([topic, group]) => {
      const keywords = [...group.keywordCounts.entries()]
        .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
        .slice(0, 6)
        .map(([keyword]) => keyword);
      const errorType = [...group.errorTypes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Lacuna conceitual';

      return {
        topic,
        errorType,
        count: group.count,
        questionNumbers: [...group.questionNumbers].sort((a, b) => a - b),
        keywords,
        query: buildStudyQuery(topic, keywords, simuladoTitle),
      };
    })
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic))
    .slice(0, maxTopics);
}

function buildStudyQuery(topic: string, keywords: string[], simuladoTitle?: string | null): string {
  const titleTokens = normalizeStudyText(simuladoTitle ?? '')
    .match(/[a-z0-9]{3,}/g)
    ?.filter((token) => !STOP_WORDS.has(token) && token !== 'prova' && token !== 'teste')
    .slice(0, 2) ?? [];
  const topicTokens = normalizeStudyText(topic)
    .match(/[a-z0-9]{3,}/g)
    ?.filter((token) => !STOP_WORDS.has(token) && token !== 'tema' && token !== 'material')
    .slice(0, 3) ?? [];
  const topicPhrase = TOPIC_SEARCH_PHRASES.get(normalizeStudyText(topic));
  const terms = dedupeTerms([
    topicPhrase ?? topic,
    ...(topicPhrase ? [] : keywords.slice(0, 2)),
    ...topicTokens,
    ...titleTokens,
    'explicacao',
    'exemplos',
    'exercicios resolvidos',
  ]);

  return (terms.length > 0 ? terms : ['estudo dirigido', 'erros de simulado'])
    .slice(0, 6)
    .join(' ');
}

function dedupeTerms(terms: string[]): string[] {
  const result: string[] = [];

  for (const rawTerm of terms) {
    const term = normalizeStudyText(rawTerm).trim();
    if (!term || STOP_WORDS.has(term)) continue;
    if (result.some((existing) => existing.includes(term) || term.includes(existing))) continue;
    result.push(term);
  }

  return result;
}

function toTitleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

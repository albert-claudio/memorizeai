/**
 * Study Goal Profiles
 *
 * Central config that adapts the entire AI generation pipeline based on
 * the user's chosen study goal (concurso, oab, enem, faculdade).
 */

import type { RunObjective } from '@/lib/types';

export type StudyGoal = 'concurso' | 'oab' | 'enem' | 'faculdade';
export type QuestionStyle = 'banca' | 'oab_exam' | 'enem_exam' | 'academic_exam';
export type BancaType = 'FCC' | 'FGV' | 'CESPE';
export type DifficultyMode = 'banca' | 'generic' | 'none';

export interface StudyGoalProfile {
  /** Internal key */
  key: StudyGoal;
  /** Display name */
  label: string;
  /** Persona injected at the start of every system prompt */
  persona: string;
  /** How to describe the input text in user prompts */
  textLabel: string;
  /** Regex patterns for automatic content-area detection */
  contentPatterns: Record<string, RegExp>;
  /** Valid flashcard categories */
  categories: { key: string; label: string }[];
  /** Category keys only (for fast validation) */
  categoryKeys: string[];
  /** Whether banca-specific question generation applies */
  bancasEnabled: boolean;
  /** System prompt suffix for flashcard generation */
  flashcardRules: string;
  /** System prompt suffix for reinforcement cards */
  reinforcementRules: string;
  /** System prompt for generic question generation (when bancas are disabled) */
  genericQuestionPersona: string;

  // ─── Runtime fields for question generation context ───
  /** Whether the user can pick a banca freely */
  supportsBanca: boolean;
  /** If set, forces this banca regardless of user selection (e.g. OAB always FGV) */
  defaultBanca: BancaType | null;
  /** The question generation style to use */
  questionStyle: QuestionStyle;
  /** UI label for the question objective (replaces hardcoded "Questões de Banca") */
  questionObjectiveLabel: string;
  /** UI description for the question objective */
  questionObjectiveDescription: string;

  // ─── Pipeline adaptation fields ───
  /** Which objectives this goal allows in the UI */
  allowedObjectives: RunObjective[];
  /** UI label for the 3rd objective (exercicios_aplicados) */
  logicObjectiveLabel: string;
  /** UI description for the 3rd objective */
  logicObjectiveDescription: string;
  /** Context string for topic extraction prompts (e.g. "documento jurídico") */
  topicExtractionContext: string;
  /** Context string for base diagnosis prompts */
  baseDiagnosisContext: string;
  /** Context string for the reviewer persona */
  reviewContext: string;
  /** Base review criteria injected into the reviewer */
  reviewCriteria: string;
  /** Difficulty selector mode: 'banca' (concurso/oab), 'generic' (reserved), 'none' (enem/faculdade) */
  difficultyMode: DifficultyMode;
}

// ─── CONCURSO ──────────────────────────────────────────────────────────────

const CONCURSO: StudyGoalProfile = {
  key: 'concurso',
  label: 'Concurso Público',
  persona: 'Você é um professor de Direito com 20 anos de experiência, especialista em criar material de estudo para concursos públicos.',
  textLabel: 'texto jurídico',
  contentPatterns: {
    constitucional: /constituição|constitucional|art\.\s*5|direitos fundamentais|cf\/88/gi,
    civil: /código civil|cc\/2002|obrigações|contratos|responsabilidade civil/gi,
    penal: /código penal|cp|crime|pena|tipicidade|antijuridicidade/gi,
    trabalhista: /clt|trabalhista|empregado|empregador|súmula.*tst/gi,
    processual: /cpc|cpp|processo|recurso|ação|petição|contestação/gi,
    administrativo: /administração pública|ato administrativo|licitação|servidor/gi,
    tributario: /tributo|imposto|taxa|contribuição|crédito tributário/gi,
  },
  categories: [
    { key: 'conceito', label: 'Definições e princípios jurídicos' },
    { key: 'artigo', label: 'Artigos de lei específicos' },
    { key: 'jurisprudencia', label: 'Súmulas e entendimentos de tribunais' },
    { key: 'procedimento', label: 'Ritos e procedimentos processuais' },
    { key: 'prazo', label: 'Prazos processuais e prescricionais' },
    { key: 'geral', label: 'Outros conteúdos relevantes' },
  ],
  categoryKeys: ['conceito', 'artigo', 'jurisprudencia', 'procedimento', 'prazo', 'geral'],
  bancasEnabled: true,
  supportsBanca: true,
  defaultBanca: null,
  questionStyle: 'banca',
  questionObjectiveLabel: 'Simulado de Banca',
  questionObjectiveDescription: 'Treino de prova no estilo FCC, CESPE e FGV, com pegadinhas reais',
  allowedObjectives: ['flashcards', 'questoes_banca', 'exercicios_aplicados'],
  logicObjectiveLabel: 'Lógica Jurídica',
  logicObjectiveDescription: 'Exercícios de A vs B, silogismos e casos práticos',
  topicExtractionContext: 'documento jurídico',
  baseDiagnosisContext: 'questões de concurso público',
  reviewContext: 'concurso público',
  reviewCriteria: 'Exija linguagem formal de prova, pegadinhas técnicas e fidelidade à banca.',
  difficultyMode: 'banca',
  flashcardRules: `CATEGORIAS VÁLIDAS:
- "conceito": Definições e princípios jurídicos
- "artigo": Artigos de lei específicos
- "jurisprudencia": Súmulas e entendimentos de tribunais
- "procedimento": Ritos e procedimentos processuais
- "prazo": Prazos processuais e prescricionais
- "geral": Outros conteúdos relevantes

DICAS DE ESTILO:
- SEMPRE inclua referência legal quando mencionar artigos/leis do texto
- Foque em pegadinhas comuns de concurso: exceções, requisitos cumulativos, prazos
- Perguntas devem testar compreensão profunda, não apenas memorização`,
  reinforcementRules: `Use perguntas variadas: definição, exemplo, comparação, aplicação prática em concurso.
Foque em ajudar o aluno a entender melhor o conceito para acertar em provas de concurso público.`,
  genericQuestionPersona: '', // Not used — bancas are enabled
};

// ─── OAB ────────────────────────────────────────────────────────────────────

const OAB: StudyGoalProfile = {
  key: 'oab',
  label: 'Exame da OAB',
  persona: 'Você é um professor de Direito com 20 anos de experiência, especialista em preparação para o Exame de Ordem da OAB.',
  textLabel: 'texto jurídico',
  contentPatterns: {
    etica_profissional: /estatutod*\s*advogacia|código de ética|oab|prerrogativas|honorários|impedimento/gi,
    constitucional: /constituição|constitucional|direitos fundamentais|cf\/88|controle de constitucionalidade/gi,
    civil: /código civil|obrigações|contratos|responsabilidade civil|família|sucessões/gi,
    penal: /código penal|crime|pena|tipicidade|dosimetria|execução penal/gi,
    trabalhista: /clt|trabalhista|empregado|reclamação trabalhista|justa causa/gi,
    processual: /cpc|processo|recurso|ação|petição|contestação|competência/gi,
    administrativo: /administração pública|ato administrativo|licitação|servidor/gi,
    empresarial: /sociedade|empresa|falência|recuperação judicial|marca|patente/gi,
    tributario: /tributo|imposto|taxa|contribuição|crédito tributário/gi,
    direitos_humanos: /direitos humanos|convenção americana|pacto|tratado internacional/gi,
  },
  categories: [
    { key: 'conceito', label: 'Definições e princípios' },
    { key: 'artigo', label: 'Artigos de lei' },
    { key: 'jurisprudencia', label: 'Súmulas e jurisprudência' },
    { key: 'etica', label: 'Ética e Estatuto da OAB' },
    { key: 'caso_pratico', label: 'Casos práticos e peças' },
    { key: 'geral', label: 'Outros conteúdos' },
  ],
  categoryKeys: ['conceito', 'artigo', 'jurisprudencia', 'etica', 'caso_pratico', 'geral'],
  bancasEnabled: false, // OAB forces FGV — user cannot pick banca
  supportsBanca: false,
  defaultBanca: 'FGV',
  questionStyle: 'oab_exam',
  questionObjectiveLabel: 'Simulado estilo OAB',
  questionObjectiveDescription: 'Treino no estilo do Exame de Ordem, com casos e pegadinhas FGV',
  allowedObjectives: ['flashcards', 'questoes_banca', 'exercicios_aplicados'],
  logicObjectiveLabel: 'Raciocínio Jurídico',
  logicObjectiveDescription: 'Casos práticos e raciocínio aplicado no estilo OAB',
  topicExtractionContext: 'documento jurídico',
  baseDiagnosisContext: 'questões para o Exame da OAB',
  reviewContext: 'Exame da OAB',
  reviewCriteria: 'Exija raciocínio prático, interpretação e aplicação. Foco FGV.',
  difficultyMode: 'banca',
  flashcardRules: `CATEGORIAS VÁLIDAS:
- "conceito": Definições e princípios
- "artigo": Artigos de lei
- "jurisprudencia": Súmulas e jurisprudência
- "etica": Ética e Estatuto da Advocacia
- "caso_pratico": Casos práticos e peças processuais
- "geral": Outros conteúdos

DICAS DE ESTILO:
- O Exame de Ordem é aplicado pela FGV — foque em interpretação e aplicação prática
- Inclua situações hipotéticas que demandem raciocínio jurídico
- Dê atenção especial a Ética Profissional e Estatuto da OAB`,
  reinforcementRules: `Use perguntas variadas: definição, caso prático, aplicação ética, comparação de institutos.
Foque em ajudar o aluno a raciocinar como advogado — o Exame da OAB prioriza aplicação prática.`,
  genericQuestionPersona: '', // OAB uses FGV banca
};

// ─── ENEM ────────────────────────────────────────────────────────────────────

const ENEM: StudyGoalProfile = {
  key: 'enem',
  label: 'ENEM / Vestibular',
  persona: 'Você é um professor multidisciplinar com 20 anos de experiência, especialista em preparação para o ENEM e vestibulares.',
  textLabel: 'conteúdo',
  contentPatterns: {
    historia: /história|guerra|revolução|império|república|colonização|independência|ditadura/gi,
    geografia: /geografia|bioma|clima|relevo|urbanização|globalização|migração|população/gi,
    filosofia: /filosofia|filósofo|ética|moral|platão|aristóteles|kant|marxismo|iluminismo/gi,
    sociologia: /sociologia|sociedade|weber|durkheim|desigualdade|cultura|identidade/gi,
    biologia: /biologia|célula|genética|evolução|ecologia|fotossíntese|mitose|dna/gi,
    quimica: /química|reação|mol|ácido|base|orgânica|ligação química|estequiometria/gi,
    fisica: /física|velocidade|aceleração|força|energia|onda|termodinâmica|eletricidade/gi,
    matematica: /matemática|equação|função|geometria|probabilidade|estatística|logaritmo/gi,
    literatura: /literatura|romance|poesia|modernismo|realismo|barroco|arcadismo/gi,
    gramatica: /gramática|sintaxe|morfologia|regência|concordância|crase|pontuação/gi,
    redacao: /redação|dissertação|argumentação|texto dissertativo|proposta de intervenção/gi,
  },
  categories: [
    { key: 'conceito', label: 'Conceitos e definições' },
    { key: 'formula', label: 'Fórmulas e cálculos' },
    { key: 'interpretacao', label: 'Interpretação de textos e dados' },
    { key: 'atualidade', label: 'Atualidades e contexto' },
    { key: 'geral', label: 'Outros conteúdos' },
  ],
  categoryKeys: ['conceito', 'formula', 'interpretacao', 'atualidade', 'geral'],
  bancasEnabled: false,
  supportsBanca: false,
  defaultBanca: null,
  questionStyle: 'enem_exam',
  questionObjectiveLabel: 'Simulado estilo ENEM',
  questionObjectiveDescription: 'Questoes contextualizadas para treinar interpretacao e competencia ENEM',
  allowedObjectives: ['flashcards', 'questoes_banca'],
  logicObjectiveLabel: '', // hidden — ENEM does not show exercicios_aplicados
  logicObjectiveDescription: '',
  topicExtractionContext: 'material didático de ENEM/vestibular',
  baseDiagnosisContext: 'questões contextualizadas estilo ENEM',
  reviewContext: 'ENEM/vestibular',
  reviewCriteria: 'Exija contextualização, interdisciplinaridade e competências ENEM. Sem viés jurídico.',
  difficultyMode: 'none',
  flashcardRules: `CATEGORIAS VÁLIDAS:
- "conceito": Conceitos e definições
- "formula": Fórmulas, cálculos e relações quantitativas
- "interpretacao": Interpretação de textos, gráficos e dados
- "atualidade": Atualidades e contexto social/cultural
- "geral": Outros conteúdos

DICAS DE ESTILO:
- O ENEM valoriza INTERDISCIPLINARIDADE — conecte áreas do conhecimento quando possível
- Foque em COMPETÊNCIAS: interpretação, análise crítica, resolução de problemas
- Use linguagem acessível mas precisa
- Quando relevante, faça conexões com temas atuais e contexto brasileiro`,
  reinforcementRules: `Use perguntas variadas: conceito, interpretação de texto/gráfico, aplicação prática, conexão interdisciplinar.
Foque em desenvolver as competências cobradas pelo ENEM: interpretar, argumentar e propor soluções.`,
  genericQuestionPersona: `Você é um EXAMINADOR do ENEM/INEP com 20 anos de experiência na elaboração de itens.

ESTILO ENEM:
- Questões contextualizadas com textos-base, gráficos ou situações do cotidiano
- Foco em competências e habilidades, não apenas memorização
- Linguagem acessível com rigor conceitual
- 5 alternativas (A a E) com distratores plausíveis
- Interdisciplinaridade quando possível
- Enunciado contextualizado seguido de "Com base no texto/nos dados, é correto afirmar que..."`,
};

// ─── FACULDADE ────────────────────────────────────────────────────────────────

const FACULDADE: StudyGoalProfile = {
  key: 'faculdade',
  label: 'Faculdade',
  persona: 'Você é um professor universitário com 20 anos de experiência, especialista em criar material de estudo para provas acadêmicas.',
  textLabel: 'conteúdo acadêmico',
  contentPatterns: {
    direito: /direito|jurídico|lei|código|artigo|tribunal|jurisprudência/gi,
    medicina: /medicina|anatomia|fisiologia|patologia|diagnóstico|tratamento|clínica/gi,
    engenharia: /engenharia|cálculo|estrutura|resistência|circuito|termodinâmica/gi,
    administracao: /administração|gestão|marketing|finanças|recursos humanos|organização/gi,
    psicologia: /psicologia|comportamento|cognição|piaget|freud|terapia|transtorno/gi,
    economia: /economia|mercado|oferta|demanda|pib|inflação|microeconomia|macroeconomia/gi,
    contabilidade: /contabilidade|balanço|ativo|passivo|patrimônio|demonstração|débito|crédito/gi,
    computacao: /computação|algoritmo|programação|banco de dados|rede|sistema operacional/gi,
    humanas: /história|sociologia|filosofia|antropologia|ciência política|relações internacionais/gi,
    saude: /saúde|enfermagem|farmácia|nutrição|fisioterapia|biomedicina/gi,
  },
  categories: [
    { key: 'conceito', label: 'Conceitos e definições' },
    { key: 'teoria', label: 'Teorias e autores' },
    { key: 'pratica', label: 'Aplicação prática' },
    { key: 'formula', label: 'Fórmulas e cálculos' },
    { key: 'geral', label: 'Outros conteúdos' },
  ],
  categoryKeys: ['conceito', 'teoria', 'pratica', 'formula', 'geral'],
  bancasEnabled: false,
  supportsBanca: false,
  defaultBanca: null,
  questionStyle: 'academic_exam',
  questionObjectiveLabel: 'Simulado de prova',
  questionObjectiveDescription: 'Questoes para treinar cobranca de prova academica a partir do seu material',
  allowedObjectives: ['flashcards', 'questoes_banca', 'exercicios_aplicados'],
  logicObjectiveLabel: 'Exercícios Aplicados',
  logicObjectiveDescription: 'Comparação, análise de caso e aplicação acadêmica',
  topicExtractionContext: 'material acadêmico universitário',
  baseDiagnosisContext: 'questões de provas acadêmicas universitárias',
  reviewContext: 'provas universitárias',
  reviewCriteria: 'Exija profundidade teórica, nuances entre correntes e aplicação prática. Sem viés de concurso.',
  difficultyMode: 'none',
  flashcardRules: `CATEGORIAS VÁLIDAS:
- "conceito": Conceitos e definições
- "teoria": Teorias, autores e correntes de pensamento
- "pratica": Aplicação prática e estudos de caso
- "formula": Fórmulas, cálculos e relações
- "geral": Outros conteúdos

DICAS DE ESTILO:
- Foque em profundidade teórica — provas de faculdade cobram compreensão
- Conecte teoria com a prática quando possível
- Inclua autores e referências bibliográficas mencionados no material
- Prepare o aluno para provas dissertativas e objetivas`,
  reinforcementRules: `Use perguntas variadas: definição, exemplo prático, comparação entre teorias, aplicação a estudo de caso.
Foque em ajudar o aluno a entender as nuances teóricas cobradas em provas acadêmicas.`,
  genericQuestionPersona: `Você é um PROFESSOR UNIVERSITÁRIO elaborando questões para provas acadêmicas.

ESTILO ACADÊMICO:
- Questões que testam compreensão profunda, não apenas memorização
- Contextualize com situações práticas da área
- 5 alternativas (A a E) com distratores que testem nuances
- Pode incluir questões interpretativas, de aplicação e de análise
- Linguagem formal e acadêmica`,
};

// ─── EXPORTS ──────────────────────────────────────────────────────────────────

const PROFILES: Record<StudyGoal, StudyGoalProfile> = {
  concurso: CONCURSO,
  oab: OAB,
  enem: ENEM,
  faculdade: FACULDADE,
};

export function getStudyGoalProfile(goal: string | null | undefined): StudyGoalProfile {
  if (goal && goal in PROFILES) {
    return PROFILES[goal as StudyGoal];
  }
  return PROFILES.concurso; // default
}

export function detectContentType(text: string, profile: StudyGoalProfile): string {
  const matches: Record<string, number> = {};

  for (const [area, regex] of Object.entries(profile.contentPatterns)) {
    // Reset regex lastIndex for global regexes
    regex.lastIndex = 0;
    const found = text.match(regex);
    matches[area] = found ? found.length : 0;
  }

  const bestMatch = Object.entries(matches).sort((a, b) => b[1] - a[1])[0];
  return bestMatch && bestMatch[1] > 2 ? bestMatch[0] : 'geral';
}

export function isValidCategory(category: string, profile: StudyGoalProfile): boolean {
  return profile.categoryKeys.includes(category);
}

export function buildSystemPrompt(profile: StudyGoalProfile): string {
  return `${profile.persona}

REGRAS ABSOLUTAS:
1. CRIE FLASHCARDS APENAS com informações do texto fornecido pelo usuário
2. NUNCA invente informações que não estejam no texto
3. NUNCA use exemplos genéricos - tudo deve vir do texto
4. Respostas devem ser completas mas objetivas (máximo 4 frases)
5. Perguntas devem ser específicas e testar compreensão

${profile.flashcardRules}

Responda APENAS com JSON válido, nada mais.`;
}

export function buildSystemPromptWithCitations(profile: StudyGoalProfile): string {
  return `${profile.persona}

REGRAS ABSOLUTAS:
1. CRIE FLASHCARDS APENAS com informações do texto fornecido
2. NUNCA invente informações que não estejam no texto
3. SEMPRE cite o trecho de origem usando o ID fornecido
4. Para cada card, indique qual TRECHO usou como fonte
5. Inclua um RECORTE CURTO (1-2 frases) que comprova a resposta
6. Respostas devem ser completas mas objetivas (máximo 4 frases)
7. Perguntas devem ser específicas e testar compreensão

${profile.flashcardRules}

FORMATO DE RESPOSTA OBRIGATÓRIO (JSON):
[{
  "front": "pergunta sobre o texto",
  "back": "resposta baseada no texto",
  "category": "conceito",
  "chunkId": "ID do trecho usado",
  "citationExcerpt": "Frase curta do texto original que comprova a resposta"
}]

Responda APENAS com JSON válido, nada mais.`;
}

export function buildReinforcementSystemPrompt(profile: StudyGoalProfile): string {
  return `${profile.persona.replace('criar material de estudo', 'criar flashcards de reforço').replace('especialista em criar flashcards', 'especialista em criar flashcards de reforço')}

Sua tarefa é criar NOVOS flashcards para reforçar conceitos que o aluno errou.

REGRAS:
1. Analise os flashcards que o aluno errou
2. Crie novos flashcards que abordam os MESMOS temas de formas diferentes
3. ${profile.reinforcementRules}
4. NÃO repita as perguntas originais - crie novas abordagens
5. Foque em ajudar o aluno a entender melhor o conceito

Responda APENAS com JSON válido.`;
}

export default PROFILES;

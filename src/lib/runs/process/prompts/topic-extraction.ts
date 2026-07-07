export const TOPIC_EXTRACTION_PROMPT = {
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

export interface ExtractedTopic {
  topic: string;
  keywords: string[];
}


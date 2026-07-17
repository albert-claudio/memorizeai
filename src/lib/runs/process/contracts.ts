// Types
export interface ChunkWithContext {
  id: string;
  content: string;
  pageNumber: number | null;
  sourceId: string;
  sourceName: string;
  position: number;
}

export interface GeneratedFlashcard {
  front: string;
  back: string;
  category?: string;
  chunkId: string;
  citationExcerpt: string;
}

export interface SourceRef {
  chunkId: string;
  citationExcerpt: string;
}

export interface GeneratedQuestion {
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

export type ProcessLogger = (stage: string, message: string) => void;


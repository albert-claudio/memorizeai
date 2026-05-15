export interface Deck {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  concurso?: string | null;
  materia?: string | null;
  tema?: string | null;
  created_at: number; // BIGINT timestamp
  updated_at: number;
  deleted_at: number | null;
}

export interface Card {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  step: number;
  next_review_at: number | null;
  // FSRS DSR Model fields
  difficulty: number;
  stability: number;
  ease_factor: number;
  lapses: number;
  is_leech: boolean;
  last_review_at: number | null;
  relearning_step: number | null;
  // Source/citation fields
  source_id: string | null;
  citation_text: string | null;
  sourceReference?: CardSourceReference | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface CardSourceReference {
  sourceId: string;
  sourceName: string;
  pageNumber: number | null;
  excerpt: string | null;
}

export interface ExamTarget {
  id: string;
  user_id: string;
  deck_id: string;
  title: string;
  target_date: number;
  target_retention: number;
  is_active: boolean;
  created_at: number;
  updated_at: number;
}


export interface Profile {
  id: string;
  is_pro: boolean;
  stripe_customer_id: string | null;
  subscription_status: 'free' | 'active' | 'canceled' | 'past_due' | 'incomplete';
  subscription_tier: 'free' | 'pro' | 'enterprise';
  subscription_period_end: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface SubscriptionRecord {
  id: string;
  user_id: string;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  price_id: string | null;
  status: 'active' | 'canceled' | 'past_due' | 'incomplete';
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
  created_at: number;
  updated_at: number;
}

export interface Source {
  id: string;
  user_id: string;
  filename: string;
  storage_path: string;
  status: 'na_fila' | 'processando' | 'concluido' | 'erro';
  progress: number;
  total_pages: number | null;
  error_message: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface Chunk {
  id: string;
  content_hash: string;
  content: string;
  page_number: number | null;
  char_start: number | null;
  char_end: number | null;
  created_at: number;
}

export interface SourceChunk {
  source_id: string;
  chunk_id: string;
  position: number;
  created_at: number;
}

export interface CardReference {
  id: string;
  card_id: string;
  chunk_id: string;
  source_id: string;
  page_number: number | null;
  excerpt: string;
  created_at: number;
}

export interface Run {
  id: string;
  user_id: string;
  source_id: string;
  deck_id: string | null;
  objective: 'flashcards' | 'questoes_banca' | 'exercicios_aplicados';
  model_preference: 'groq' | 'gemini' | 'openai' | 'auto';
  target_count: number;
  status: 'pendente' | 'queued' | 'retry_wait' | 'processando' | 'concluido' | 'erro' | 'base_insuficiente';
  provider?: 'groq' | 'gemini' | 'openai' | null;
  model_used: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cached_tokens?: number | null;
  estimated_cost_usd?: number | null;
  source_digest_version?: string | null;
  raw_usage?: unknown;
  attempt_count: number;
  provider_attempt_count?: number;
  items_generated: number;
  error_message: string | null;
  started_at: number | null;
  completed_at: number | null;
  next_attempt_at?: number | null;
  lease_expires_at?: number | null;
  processing_node?: string | null;
  last_error_code?: string | null;
  last_error_provider?: string | null;
  last_error_at?: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  banca?: 'FCC' | 'FGV' | 'CESPE' | null;
  dificuldade?: 'facil' | 'medio' | 'dificil' | 'muito_dificil' | null;
}

export type Banca = 'FCC' | 'FGV' | 'CESPE';
export type Dificuldade = 'facil' | 'medio' | 'dificil' | 'muito_dificil';

export interface UserCredits {
  user_id: string;
  plan_runs_remaining: number;
  extra_credits: number;
  last_plan_reset: number | null;
  created_at: number;
  updated_at: number;
}

export type RunObjective = 'flashcards' | 'questoes_banca' | 'exercicios_aplicados';
export type ModelPreference = 'groq' | 'gemini' | 'openai' | 'auto';


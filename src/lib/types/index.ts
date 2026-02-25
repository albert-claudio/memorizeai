export interface Deck {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
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
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
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
  objective: 'flashcards' | 'questoes_banca' | 'logica_juridica';
  model_preference: 'groq' | 'gemini' | 'auto';
  target_count: number;
  status: 'pendente' | 'processando' | 'concluido' | 'erro';
  model_used: string | null;
  attempt_count: number;
  items_generated: number;
  error_message: string | null;
  started_at: number | null;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface UserCredits {
  user_id: string;
  plan_runs_remaining: number;
  extra_credits: number;
  last_plan_reset: number | null;
  created_at: number;
  updated_at: number;
}

export type RunObjective = 'flashcards' | 'questoes_banca' | 'logica_juridica';
export type ModelPreference = 'groq' | 'gemini' | 'auto';


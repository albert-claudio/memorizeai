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
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface Profile {
  id: string;
  is_pro: boolean;
  stripe_customer_id: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

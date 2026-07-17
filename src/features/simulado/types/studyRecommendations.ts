export interface StudyResource {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export interface StudyRecommendation {
  topic: string;
  errorType: string;
  errorCount: number;
  questionNumbers: number[];
  keywords: string[];
  query: string;
  resources: StudyResource[];
}

export interface ReinforcementFlashcardsResponse {
  success: boolean;
  cardsCreated: number;
  reusedDeck?: boolean;
  deckId?: string;
  deckTitle?: string;
  reviewUrl?: string;
  error?: string;
  retryAfter?: number;
}

export interface StudyRecommendationsResponse {
  recommendations: StudyRecommendation[];
  generatedAt: number;
}

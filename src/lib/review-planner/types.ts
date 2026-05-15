import type { Card, ExamTarget } from '@/lib/types';

export interface ReviewPlannerPreferences {
  prioritizeWeak: boolean;
  prioritizeNearExam: boolean;
}

export interface ReviewPlannerInput {
  cards: Card[];
  now?: number;
  preferences?: Partial<ReviewPlannerPreferences>;
  examTarget?: ExamTarget | null;
}

export interface ReviewPlannerResult {
  cards: Card[];
  strategy: 'default' | 'weak-first' | 'exam-target' | 'weak-first-exam-target';
  appliedRules: string[];
  examTarget: Pick<ExamTarget, 'id' | 'title' | 'target_date' | 'target_retention'> | null;
}

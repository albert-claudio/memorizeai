import type { ExamTarget } from '@/lib/types';

export interface ExamTargetResponse {
  examTarget: ExamTarget | null;
  prioritizeNearExam: boolean;
  unavailable: boolean;
}

export interface SaveExamTargetInput {
  title: string;
  target_date: number;
  target_retention: number;
}

async function parseResponse(response: Response) {
  let body: Record<string, unknown> = {};
  try {
    body = await response.json();
  } catch {
    // Ignore invalid JSON and use fallback message.
  }

  if (!response.ok) {
    const message = typeof body.error === 'string' ? body.error : 'Erro ao processar meta de prova';
    throw new Error(message);
  }

  return body;
}

export const examTargetService = {
  async get(deckId: string): Promise<ExamTargetResponse> {
    const response = await fetch(`/api/exam-targets/${encodeURIComponent(deckId)}`, {
      cache: 'no-store',
    });

    return await parseResponse(response) as unknown as ExamTargetResponse;
  },

  async save(deckId: string, input: SaveExamTargetInput): Promise<ExamTargetResponse> {
    const response = await fetch(`/api/exam-targets/${encodeURIComponent(deckId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    return await parseResponse(response) as unknown as ExamTargetResponse;
  },

  async remove(deckId: string): Promise<ExamTargetResponse> {
    const response = await fetch(`/api/exam-targets/${encodeURIComponent(deckId)}`, {
      method: 'DELETE',
    });

    return await parseResponse(response) as unknown as ExamTargetResponse;
  },
};

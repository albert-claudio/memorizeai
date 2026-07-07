export function getMaxRefillRounds(isFlashcards: boolean): number {
  return isFlashcards ? 1 : 5;
}

export function shouldAttemptRefill(params: { isFlashcards: boolean; generatedCount: number; targetCount: number }): boolean {
  return params.isFlashcards
    ? params.generatedCount < Math.ceil(params.targetCount * 0.6)
    : true;
}


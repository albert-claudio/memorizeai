/**
 * Tests for resolveQuestionGenerationContext and prompt selection logic.
 *
 * Since the function is internal to route.ts, we re-implement the pure logic
 * here to test it. The implementation must stay in sync with route.ts.
 */
import { describe, expect, it } from 'vitest';
import { getStudyGoalProfile, type StudyGoalProfile } from '@/lib/study-goal-profiles';

// ─── Re-implement resolveQuestionGenerationContext (pure logic) ───
type QuestionMode = 'banca' | 'oab_banca' | 'generic_exam' | 'applied_exercises';

interface QuestionGenerationContext {
  effectiveObjective: string;
  effectiveQuestionMode: QuestionMode;
  effectiveBanca: string | null;
}

function resolveQuestionGenerationContext(
  profile: StudyGoalProfile,
  requestedObjective: string,
  requestedBanca: string | null,
): QuestionGenerationContext {
  if (requestedObjective === 'exercicios_aplicados') {
    return {
      effectiveObjective: 'exercicios_aplicados',
      effectiveQuestionMode: 'applied_exercises',
      effectiveBanca: null,
    };
  }

  const isQuestionObjective = requestedObjective === 'questoes_banca';

  if (!isQuestionObjective) {
    return {
      effectiveObjective: requestedObjective,
      effectiveQuestionMode: 'generic_exam',
      effectiveBanca: null,
    };
  }

  if (profile.supportsBanca && !profile.defaultBanca) {
    if (!requestedBanca) {
      throw new Error('Banca é obrigatória para questões de concurso');
    }
    return {
      effectiveObjective: 'questoes_banca',
      effectiveQuestionMode: 'banca',
      effectiveBanca: requestedBanca,
    };
  }

  if (profile.defaultBanca) {
    return {
      effectiveObjective: 'questoes_banca',
      effectiveQuestionMode: 'oab_banca',
      effectiveBanca: profile.defaultBanca,
    };
  }

  return {
    effectiveObjective: 'questoes_banca',
    effectiveQuestionMode: 'generic_exam',
    effectiveBanca: null,
  };
}

// ─── Tests ───

describe('resolveQuestionGenerationContext by profile', () => {
  describe('concurso', () => {
    const profile = getStudyGoalProfile('concurso');

    it('requires banca for questoes_banca', () => {
      expect(() => resolveQuestionGenerationContext(profile, 'questoes_banca', null))
        .toThrow('Banca é obrigatória');
    });

    it('uses requested banca when provided', () => {
      const ctx = resolveQuestionGenerationContext(profile, 'questoes_banca', 'FCC');
      expect(ctx.effectiveQuestionMode).toBe('banca');
      expect(ctx.effectiveBanca).toBe('FCC');
    });

    it('exercicios_aplicados returns applied_exercises mode', () => {
      const ctx = resolveQuestionGenerationContext(profile, 'exercicios_aplicados', null);
      expect(ctx.effectiveQuestionMode).toBe('applied_exercises');
      expect(ctx.effectiveBanca).toBeNull();
    });

    it('flashcards returns generic_exam (irrelevant mode)', () => {
      const ctx = resolveQuestionGenerationContext(profile, 'flashcards', null);
      expect(ctx.effectiveObjective).toBe('flashcards');
      expect(ctx.effectiveBanca).toBeNull();
    });
  });

  describe('oab', () => {
    const profile = getStudyGoalProfile('oab');

    it('forces FGV regardless of requested banca', () => {
      const ctx = resolveQuestionGenerationContext(profile, 'questoes_banca', 'FCC');
      expect(ctx.effectiveQuestionMode).toBe('oab_banca');
      expect(ctx.effectiveBanca).toBe('FGV');
    });

    it('forces FGV when no banca requested', () => {
      const ctx = resolveQuestionGenerationContext(profile, 'questoes_banca', null);
      expect(ctx.effectiveBanca).toBe('FGV');
    });
  });

  describe('enem', () => {
    const profile = getStudyGoalProfile('enem');

    it('uses generic_exam mode for questoes_banca', () => {
      const ctx = resolveQuestionGenerationContext(profile, 'questoes_banca', null);
      expect(ctx.effectiveQuestionMode).toBe('generic_exam');
      expect(ctx.effectiveBanca).toBeNull();
    });

    it('does NOT throw when banca is null', () => {
      expect(() => resolveQuestionGenerationContext(profile, 'questoes_banca', null))
        .not.toThrow();
    });
  });

  describe('faculdade', () => {
    const profile = getStudyGoalProfile('faculdade');

    it('uses generic_exam for questoes_banca', () => {
      const ctx = resolveQuestionGenerationContext(profile, 'questoes_banca', null);
      expect(ctx.effectiveQuestionMode).toBe('generic_exam');
      expect(ctx.effectiveBanca).toBeNull();
    });

    it('exercicios_aplicados returns applied_exercises', () => {
      const ctx = resolveQuestionGenerationContext(profile, 'exercicios_aplicados', null);
      expect(ctx.effectiveQuestionMode).toBe('applied_exercises');
    });
  });
});

describe('Prompt selection simulation', () => {
  it('concurso + questoes_banca → uses banca persona (needs BancaPrompt)', () => {
    const profile = getStudyGoalProfile('concurso');
    const ctx = resolveQuestionGenerationContext(profile, 'questoes_banca', 'FCC');
    // In the actual pipeline, mode=banca → getBancaPrompt(banca, dificuldade, diagnosis)
    expect(ctx.effectiveQuestionMode).toBe('banca');
    expect(ctx.effectiveBanca).toBe('FCC');
  });

  it('enem + questoes_banca → uses generic question persona', () => {
    const profile = getStudyGoalProfile('enem');
    const ctx = resolveQuestionGenerationContext(profile, 'questoes_banca', null);
    // In the actual pipeline, mode=generic_exam → getGenericQuestionPrompt(profile, diagnosis)
    expect(ctx.effectiveQuestionMode).toBe('generic_exam');
    // Verify the persona exists for this path
    expect(profile.genericQuestionPersona.length).toBeGreaterThan(0);
    expect(profile.genericQuestionPersona).toContain('ENEM');
  });

  it('faculdade + exercicios_aplicados → uses applied exercises prompt', () => {
    const profile = getStudyGoalProfile('faculdade');
    const ctx = resolveQuestionGenerationContext(profile, 'exercicios_aplicados', null);
    // In the actual pipeline, mode=applied_exercises → getExerciciosAplicadosPrompt(profile)
    expect(ctx.effectiveQuestionMode).toBe('applied_exercises');
    expect(profile.logicObjectiveLabel).toBe('Exercícios Aplicados');
  });

  it('oab + questoes_banca → forces FGV banca path', () => {
    const profile = getStudyGoalProfile('oab');
    const ctx = resolveQuestionGenerationContext(profile, 'questoes_banca', null);
    // In the actual pipeline, mode=oab_banca → getBancaPrompt('FGV', ...)
    expect(ctx.effectiveQuestionMode).toBe('oab_banca');
    expect(ctx.effectiveBanca).toBe('FGV');
  });
});

import { describe, expect, it } from 'vitest';
import {
  getStudyGoalProfile,
  type StudyGoal,
} from '@/lib/study-goal-profiles';

describe('getStudyGoalProfile', () => {
  const goals: StudyGoal[] = ['concurso', 'oab', 'enem', 'faculdade'];

  it('returns correct profile for each known goal', () => {
    for (const goal of goals) {
      const p = getStudyGoalProfile(goal);
      expect(p.key).toBe(goal);
    }
  });

  it('falls back to concurso for unknown/null/undefined', () => {
    expect(getStudyGoalProfile(null).key).toBe('concurso');
    expect(getStudyGoalProfile(undefined).key).toBe('concurso');
    expect(getStudyGoalProfile('nonexistent').key).toBe('concurso');
  });
});

describe('allowedObjectives', () => {
  it('concurso has all 3 objectives', () => {
    const p = getStudyGoalProfile('concurso');
    expect(p.allowedObjectives).toContain('flashcards');
    expect(p.allowedObjectives).toContain('questoes_banca');
    expect(p.allowedObjectives).toContain('exercicios_aplicados');
  });

  it('oab has all 3 objectives', () => {
    const p = getStudyGoalProfile('oab');
    expect(p.allowedObjectives).toContain('flashcards');
    expect(p.allowedObjectives).toContain('questoes_banca');
    expect(p.allowedObjectives).toContain('exercicios_aplicados');
  });

  it('enem does NOT have exercicios_aplicados', () => {
    const p = getStudyGoalProfile('enem');
    expect(p.allowedObjectives).toContain('flashcards');
    expect(p.allowedObjectives).toContain('questoes_banca');
    expect(p.allowedObjectives).not.toContain('exercicios_aplicados');
  });

  it('faculdade has all 3 objectives', () => {
    const p = getStudyGoalProfile('faculdade');
    expect(p.allowedObjectives).toContain('flashcards');
    expect(p.allowedObjectives).toContain('questoes_banca');
    expect(p.allowedObjectives).toContain('exercicios_aplicados');
  });
});

describe('difficultyMode', () => {
  it('concurso uses banca mode', () => {
    expect(getStudyGoalProfile('concurso').difficultyMode).toBe('banca');
  });

  it('oab uses banca mode', () => {
    expect(getStudyGoalProfile('oab').difficultyMode).toBe('banca');
  });

  it('enem uses none', () => {
    expect(getStudyGoalProfile('enem').difficultyMode).toBe('none');
  });

  it('faculdade uses none', () => {
    expect(getStudyGoalProfile('faculdade').difficultyMode).toBe('none');
  });
});

describe('topicExtractionContext', () => {
  it('concurso says "documento jurídico"', () => {
    expect(getStudyGoalProfile('concurso').topicExtractionContext).toContain('jurídico');
  });

  it('oab says "documento jurídico"', () => {
    expect(getStudyGoalProfile('oab').topicExtractionContext).toContain('jurídico');
  });

  it('enem NEVER contains "jurídico"', () => {
    const p = getStudyGoalProfile('enem');
    expect(p.topicExtractionContext.toLowerCase()).not.toContain('jurídico');
    expect(p.topicExtractionContext.toLowerCase()).not.toContain('juridico');
  });

  it('faculdade NEVER contains "jurídico"', () => {
    const p = getStudyGoalProfile('faculdade');
    expect(p.topicExtractionContext.toLowerCase()).not.toContain('jurídico');
    expect(p.topicExtractionContext.toLowerCase()).not.toContain('juridico');
  });
});

describe('baseDiagnosisContext', () => {
  it('concurso mentions concurso', () => {
    expect(getStudyGoalProfile('concurso').baseDiagnosisContext).toContain('concurso');
  });

  it('enem NEVER mentions concurso', () => {
    expect(getStudyGoalProfile('enem').baseDiagnosisContext.toLowerCase()).not.toContain('concurso');
  });

  it('faculdade NEVER mentions concurso', () => {
    expect(getStudyGoalProfile('faculdade').baseDiagnosisContext.toLowerCase()).not.toContain('concurso');
  });
});

describe('supportsBanca and defaultBanca', () => {
  it('concurso supports banca freely', () => {
    const p = getStudyGoalProfile('concurso');
    expect(p.supportsBanca).toBe(true);
    expect(p.defaultBanca).toBeNull();
  });

  it('oab forces FGV', () => {
    const p = getStudyGoalProfile('oab');
    expect(p.supportsBanca).toBe(false);
    expect(p.defaultBanca).toBe('FGV');
  });

  it('enem has no banca', () => {
    const p = getStudyGoalProfile('enem');
    expect(p.supportsBanca).toBe(false);
    expect(p.defaultBanca).toBeNull();
  });

  it('faculdade has no banca', () => {
    const p = getStudyGoalProfile('faculdade');
    expect(p.supportsBanca).toBe(false);
    expect(p.defaultBanca).toBeNull();
  });
});

describe('logicObjectiveLabel', () => {
  it('concurso uses "Lógica Jurídica"', () => {
    expect(getStudyGoalProfile('concurso').logicObjectiveLabel).toBe('Lógica Jurídica');
  });

  it('oab uses "Raciocínio Jurídico"', () => {
    expect(getStudyGoalProfile('oab').logicObjectiveLabel).toBe('Raciocínio Jurídico');
  });

  it('enem has empty label (hidden)', () => {
    expect(getStudyGoalProfile('enem').logicObjectiveLabel).toBe('');
  });

  it('faculdade uses "Exercícios Aplicados"', () => {
    expect(getStudyGoalProfile('faculdade').logicObjectiveLabel).toBe('Exercícios Aplicados');
  });
});

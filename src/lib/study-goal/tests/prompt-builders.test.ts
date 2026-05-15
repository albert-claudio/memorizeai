/**
 * Tests for profile-driven prompt context — verifies that profile fields
 * produce correct prompt contexts without importing route.ts internals.
 *
 * These tests validate the CONTRACT that the profile fields establish,
 * which the prompt builders in route.ts consume.
 */
import { describe, expect, it } from 'vitest';
import { getStudyGoalProfile } from '@/lib/study-goal-profiles';



describe('Topic extraction context per profile', () => {
  it('enem topic context does NOT contain "jurídico"', () => {
    const p = getStudyGoalProfile('enem');
    expect(p.topicExtractionContext.toLowerCase()).not.toContain('jurídico');
    expect(p.topicExtractionContext.toLowerCase()).not.toContain('juridico');
  });

  it('faculdade topic context does NOT contain "jurídico"', () => {
    const p = getStudyGoalProfile('faculdade');
    expect(p.topicExtractionContext.toLowerCase()).not.toContain('jurídico');
  });

  it('concurso topic context contains "jurídico"', () => {
    expect(getStudyGoalProfile('concurso').topicExtractionContext).toContain('jurídico');
  });

  it('oab topic context contains "jurídico"', () => {
    expect(getStudyGoalProfile('oab').topicExtractionContext).toContain('jurídico');
  });
});

describe('Base diagnosis context per profile', () => {
  it('concurso mentions concurso', () => {
    expect(getStudyGoalProfile('concurso').baseDiagnosisContext).toContain('concurso');
  });

  it('oab mentions OAB', () => {
    expect(getStudyGoalProfile('oab').baseDiagnosisContext).toContain('OAB');
  });

  it('enem NEVER mentions concurso or jurídico', () => {
    const ctx = getStudyGoalProfile('enem').baseDiagnosisContext.toLowerCase();
    expect(ctx).not.toContain('concurso');
    expect(ctx).not.toContain('jurídico');
    expect(ctx).not.toContain('juridico');
  });

  it('faculdade NEVER mentions concurso', () => {
    const ctx = getStudyGoalProfile('faculdade').baseDiagnosisContext.toLowerCase();
    expect(ctx).not.toContain('concurso');
  });
});

describe('Review context per profile', () => {
  it('concurso review context = "concurso público"', () => {
    expect(getStudyGoalProfile('concurso').reviewContext).toBe('concurso público');
  });

  it('oab review context mentions OAB', () => {
    expect(getStudyGoalProfile('oab').reviewContext).toContain('OAB');
  });

  it('enem review context mentions ENEM', () => {
    expect(getStudyGoalProfile('enem').reviewContext).toContain('ENEM');
  });

  it('faculdade review context mentions universitárias', () => {
    expect(getStudyGoalProfile('faculdade').reviewContext).toContain('universitárias');
  });
});

describe('Review criteria per profile', () => {
  it('enem criteria mentions interdisciplinaridade', () => {
    expect(getStudyGoalProfile('enem').reviewCriteria.toLowerCase()).toContain('interdisciplinaridade');
  });

  it('enem criteria says "sem viés jurídico"', () => {
    expect(getStudyGoalProfile('enem').reviewCriteria.toLowerCase()).toContain('sem viés jurídico');
  });

  it('faculdade criteria says "sem viés de concurso"', () => {
    expect(getStudyGoalProfile('faculdade').reviewCriteria.toLowerCase()).toContain('sem viés de concurso');
  });

  it('concurso criteria mentions banca', () => {
    expect(getStudyGoalProfile('concurso').reviewCriteria.toLowerCase()).toContain('banca');
  });
});

describe('Generic question persona', () => {
  it('enem has a non-empty genericQuestionPersona', () => {
    expect(getStudyGoalProfile('enem').genericQuestionPersona.length).toBeGreaterThan(0);
  });

  it('enem persona mentions ENEM/INEP', () => {
    expect(getStudyGoalProfile('enem').genericQuestionPersona).toContain('ENEM');
  });

  it('concurso has empty genericQuestionPersona (uses bancas)', () => {
    expect(getStudyGoalProfile('concurso').genericQuestionPersona).toBe('');
  });
});

describe('Logic objective label per profile', () => {
  it('concurso: Lógica Jurídica', () => {
    expect(getStudyGoalProfile('concurso').logicObjectiveLabel).toBe('Lógica Jurídica');
  });

  it('oab: Raciocínio Jurídico', () => {
    expect(getStudyGoalProfile('oab').logicObjectiveLabel).toBe('Raciocínio Jurídico');
  });

  it('enem: empty (hidden)', () => {
    expect(getStudyGoalProfile('enem').logicObjectiveLabel).toBe('');
  });

  it('faculdade: Exercícios Aplicados', () => {
    expect(getStudyGoalProfile('faculdade').logicObjectiveLabel).toBe('Exercícios Aplicados');
  });
});

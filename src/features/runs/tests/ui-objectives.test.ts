import { describe, expect, it, vi } from 'vitest';
import { getStudyGoalProfile } from '@/lib/study-goal-profiles';
import { getObjectives } from '@/features/runs/constants';

// Mock React elements for Icons since we're in vitest (no JSX runtime)
vi.mock('@/features/runs/components/Icons', () => ({
  Icons: {
    Zap: () => null,
    BookOpen: () => null,
    Scale: () => null,
  },
}));

describe('getObjectives filtering', () => {
  it('concurso returns simulado first and includes exercicios_aplicados', () => {
    const profile = getStudyGoalProfile('concurso');
    const objs = getObjectives(profile);
    expect(objs).toHaveLength(3);
    expect(objs.map(o => o.id)).toEqual(['questoes_banca', 'flashcards', 'exercicios_aplicados']);
  });

  it('enem returns simulado first and no exercicios_aplicados', () => {
    const profile = getStudyGoalProfile('enem');
    const objs = getObjectives(profile);
    expect(objs).toHaveLength(2);
    expect(objs.map(o => o.id)).toEqual(['questoes_banca', 'flashcards']);
  });

  it('oab shows "Simulado estilo OAB" for questoes_banca', () => {
    const profile = getStudyGoalProfile('oab');
    const objs = getObjectives(profile);
    const qb = objs.find(o => o.id === 'questoes_banca');
    expect(qb?.title).toBe('Simulado estilo OAB');
  });

  it('faculdade shows "Exercícios Aplicados" for 3rd objective', () => {
    const profile = getStudyGoalProfile('faculdade');
    const objs = getObjectives(profile);
    const ea = objs.find(o => o.id === 'exercicios_aplicados');
    expect(ea?.title).toBe('Exercícios Aplicados');
  });

  it('null profile returns all 3 objectives with default labels', () => {
    const objs = getObjectives(null);
    expect(objs).toHaveLength(3);
    expect(objs[0].title).toBe('Simulado de Banca');
  });
});

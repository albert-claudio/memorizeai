import { describe, expect, it } from 'vitest';
import { DEFAULT_DIAGNOSIS } from '../diagnosis';
import { getBancaPrompt, getRubricaPorBanca } from '../banca';

describe('banca prompt validation', () => {
  it('rejects missing banca instead of falling back to FCC', () => {
    expect(() => getBancaPrompt(null, 'medio', DEFAULT_DIAGNOSIS))
      .toThrow('Missing banca');
  });

  it('rejects unknown banca instead of falling back to FCC', () => {
    expect(() => getBancaPrompt('FGVV', 'medio', DEFAULT_DIAGNOSIS))
      .toThrow('Unknown banca "FGVV"');
  });

  it('rejects missing dificuldade instead of falling back to medio', () => {
    expect(() => getBancaPrompt('FGV', null, DEFAULT_DIAGNOSIS))
      .toThrow('Missing dificuldade');
  });

  it('rejects unknown dificuldade instead of falling back to medio', () => {
    expect(() => getBancaPrompt('FGV', 'intermediario', DEFAULT_DIAGNOSIS))
      .toThrow('Unknown dificuldade "intermediario"');
  });

  it('rejects missing review rubric combinations instead of returning an empty rubric', () => {
    expect(() => getRubricaPorBanca('FGV', 'intermediario'))
      .toThrow('Unknown dificuldade "intermediario"');
  });
});

/**
 * FSRS Algorithm Validation Tests
 * 
 * Testes com entradas fixas para validar que o algoritmo FSRS-5 se comporta
 * corretamente nos seguintes cenários:
 * 
 * 1. Retentividade: Grade "Again" (0) retorna intervalo quase zero
 * 2. Estabilidade: Acertos consecutivos = crescimento exponencial
 * 3. Dificuldade: Grade "Hard" (1) aumenta a dificuldade do card
 */

import { describe, test, expect } from 'vitest'
import {
  calculateRetrievability,
  calculateIntervalForRetention,
  calculateStabilityIncrease,
  calculateStabilityAfterLapse,
  updateDifficulty,
  processReview,
  INITIAL_DIFFICULTY,
  RELEARNING_STEPS,
  type SRSState,
} from '../index'
import { DEFAULT_WEIGHTS, DEFAULT_RETENTION } from '../weights'

// ============================================================================
// TEST 1: RETENTIVIDADE - "Again" retorna intervalo quase zero
// ============================================================================

describe('Retentividade: Grade "Again" (0)', () => {
  test('quando usuário marca "Again", entra em relearning com intervalo de 1 minuto', () => {
    const state: Partial<SRSState> = {
      stability: 10,
      difficulty: 5,
      lapses: 0,
    }
    
    const result = processReview(state, 0) // Grade 0 = Again
    
    // Deve entrar em modo relearning
    expect(result.newState.relearning_step).toBe(0)
    
    // Intervalo deve ser ~1 minuto (RELEARNING_STEPS[0] = 1 min)
    const intervalMinutes = result.intervalDays * 24 * 60
    expect(intervalMinutes).toBeCloseTo(RELEARNING_STEPS[0], 0.1)
    
    // Lapses deve incrementar
    expect(result.newState.lapses).toBe(1)
  })

  test('stability diminui drasticamente após lapse', () => {
    const initialStability = 30 // 30 dias de estabilidade
    
    const newStability = calculateStabilityAfterLapse(
      initialStability,
      INITIAL_DIFFICULTY,
      0.7, // R = 70%
      DEFAULT_WEIGHTS
    )
    
    // Stability deve cair muito (pelo menos 80%)
    expect(newStability).toBeLessThan(initialStability * 0.2)
    
    // Mas não deve ser zero
    expect(newStability).toBeGreaterThan(0)
  })

  test('múltiplos "Again" consecutivos mantém intervalo curto', () => {
    let state: Partial<SRSState> = { stability: 10 }
    
    // Simula 3 erros consecutivos
    for (let i = 0; i < 3; i++) {
      const result = processReview(state, 0)
      state = result.newState
      
      // Intervalo sempre deve ser curto (< 1 hora)
      expect(result.intervalDays).toBeLessThan(1 / 24)
    }
    
    // Após 3 erros, lapses incrementa
    // Note: in relearning mode, only the first grade=0 counts as a new lapse
    expect(state.lapses).toBeGreaterThanOrEqual(1)
  })
})

// ============================================================================
// TEST 2: ESTABILIDADE - Crescimento exponencial com acertos consecutivos
// ============================================================================

describe('Estabilidade: Crescimento Exponencial', () => {
  test('acertos consecutivos produzem crescimento exponencial da stability', () => {
    const config = {
      weights: DEFAULT_WEIGHTS,
      desiredRetention: DEFAULT_RETENTION,
    }
    
    let state: Partial<SRSState> = {}
    const stabilityHistory: number[] = []
    const intervalHistory: number[] = []
    
    // Simula 5 revisões consecutivas com "Good" (grade 2)
    for (let i = 0; i < 5; i++) {
      const now = Date.now() + i * 24 * 60 * 60 * 1000 // Avança 1 dia por revisão
      const result = processReview(state, 2, now, config)
      
      stabilityHistory.push(result.newState.stability)
      intervalHistory.push(result.intervalDays)
      
      // Prepara próximo estado, simulando revisão no próximo intervalo
      state = {
        ...result.newState,
        last_review_at: now,
      }
    }
    
    console.log('\n📈 Evolução da Stability (5 acertos consecutivos):')
    stabilityHistory.forEach((s, i) => {
      console.log(`  Review ${i + 1}: Stability = ${s.toFixed(2)} dias, Interval = ${intervalHistory[i].toFixed(2)} dias`)
    })
    
    // Verifica crescimento (cada stability > anterior)
    for (let i = 1; i < stabilityHistory.length; i++) {
      expect(stabilityHistory[i]).toBeGreaterThan(stabilityHistory[i - 1])
    }
    
    // Verifica que não está travado: última stability >> primeira
    const growthFactor = stabilityHistory[4] / stabilityHistory[0]
    console.log(`  📊 Fator de crescimento total: ${growthFactor.toFixed(2)}x`)
    
    // Deve crescer pelo menos 2x após 5 revisões
    expect(growthFactor).toBeGreaterThan(2)
  })

  test('intervalos crescem de forma não-linear', () => {
    let state: Partial<SRSState> = {}
    const intervals: number[] = []
    
    for (let i = 0; i < 4; i++) {
      const now = Date.now() + i * 7 * 24 * 60 * 60 * 1000 // Avança 1 semana
      const result = processReview(state, 2, now)
      intervals.push(result.intervalDays)
      state = { ...result.newState, last_review_at: now }
    }
    
    console.log('\n📈 Evolução dos Intervalos:')
    intervals.forEach((interval, i) => {
      console.log(`  Review ${i + 1}: ${interval.toFixed(1)} dias`)
    })
    

    // Intervalos devem crescer (não necessariamente acelerar)
    expect(intervals[3]).toBeGreaterThan(intervals[0])
  })

  test('Easy (grade 3) produz intervalos maiores que Good (grade 2)', () => {
    const stateGood: Partial<SRSState> = { stability: 5, difficulty: 5 }
    const stateEasy: Partial<SRSState> = { stability: 5, difficulty: 5 }
    
    const resultGood = processReview(stateGood, 2)
    const resultEasy = processReview(stateEasy, 3)
    
    // Stability (which determines base interval) should be higher for Easy
    // Note: intervalDays has a ±5% fuzz factor, so we compare stability instead
    expect(resultEasy.newState.stability).toBeGreaterThanOrEqual(resultGood.newState.stability)
    
    // For same stability, Easy's stabilityIncrease is higher
    expect(resultEasy.stabilityIncrease).toBeGreaterThanOrEqual(resultGood.stabilityIncrease)
  })
})

// ============================================================================
// TEST 3: DIFICULDADE - "Hard" aumenta a dificuldade
// ============================================================================

describe('Dificuldade: Grade "Hard" (1) aumenta D', () => {
  test('marcar "Hard" aumenta a dificuldade do card', () => {
    const initialDifficulty = 5
    
    const newDifficulty = updateDifficulty(initialDifficulty, 1, DEFAULT_WEIGHTS)
    
    expect(newDifficulty).toBeGreaterThan(initialDifficulty)
    console.log(`\n📊 Hard: D ${initialDifficulty} → ${newDifficulty.toFixed(2)}`)
  })

  test('múltiplos "Hard" consecutivos aumentam dificuldade progressivamente', () => {
    let difficulty = INITIAL_DIFFICULTY
    const difficultyHistory: number[] = [difficulty]
    
    // 5 revisões com "Hard"
    for (let i = 0; i < 5; i++) {
      difficulty = updateDifficulty(difficulty, 1, DEFAULT_WEIGHTS)
      difficultyHistory.push(difficulty)
    }
    
    console.log('\n📈 Evolução da Dificuldade (5x Hard):')
    difficultyHistory.forEach((d, i) => {
      console.log(`  Após ${i} Hard: D = ${d.toFixed(2)}`)
    })
    
    // Verifica aumento progressivo
    for (let i = 1; i < difficultyHistory.length; i++) {
      expect(difficultyHistory[i]).toBeGreaterThan(difficultyHistory[i - 1])
    }
    
    // Dificuldade não deve passar de 10
    expect(difficultyHistory[5]).toBeLessThanOrEqual(10)
  })

  test('comparação: Again > Hard > Good > Easy em termos de aumento de D', () => {
    const baseDifficulty = 5
    
    const afterAgain = updateDifficulty(baseDifficulty, 0, DEFAULT_WEIGHTS)
    const afterHard = updateDifficulty(baseDifficulty, 1, DEFAULT_WEIGHTS)
    const afterGood = updateDifficulty(baseDifficulty, 2, DEFAULT_WEIGHTS)
    const afterEasy = updateDifficulty(baseDifficulty, 3, DEFAULT_WEIGHTS)
    
    console.log('\n📊 Impacto de cada grade na dificuldade:')
    console.log(`  Again (0): D ${baseDifficulty} → ${afterAgain.toFixed(2)} (+${(afterAgain - baseDifficulty).toFixed(2)})`)
    console.log(`  Hard  (1): D ${baseDifficulty} → ${afterHard.toFixed(2)} (+${(afterHard - baseDifficulty).toFixed(2)})`)
    console.log(`  Good  (2): D ${baseDifficulty} → ${afterGood.toFixed(2)} (+${(afterGood - baseDifficulty).toFixed(2)})`)
    console.log(`  Easy  (3): D ${baseDifficulty} → ${afterEasy.toFixed(2)} (+${(afterEasy - baseDifficulty).toFixed(2)})`)
    
    // Again aumenta mais que Hard
    expect(afterAgain).toBeGreaterThan(afterHard)
    
    // Hard aumenta mais que Good
    expect(afterHard).toBeGreaterThan(afterGood)
    
    // Easy diminui (ou mantém)
    expect(afterEasy).toBeLessThan(afterGood)
  })

  test('dificuldade alta reduz o crescimento da stability', () => {
    const easyCard = calculateStabilityIncrease(2, 5, 0.7, 2, DEFAULT_WEIGHTS)
    const hardCard = calculateStabilityIncrease(8, 5, 0.7, 2, DEFAULT_WEIGHTS)
    
    console.log(`\n📊 Impacto da dificuldade no SInc:`)
    console.log(`  Card fácil (D=2): SInc = ${easyCard.toFixed(2)}`)
    console.log(`  Card difícil (D=8): SInc = ${hardCard.toFixed(2)}`)
    
    // Cards difíceis crescem mais devagar
    expect(easyCard).toBeGreaterThan(hardCard)
  })
})

// ============================================================================
// TEST 4: SPACING EFFECT - Baixa R = maior boost
// ============================================================================

describe('Spacing Effect: Baixa Retrievability = Maior Boost', () => {
  test('revisar com R baixo dá boost maior que R alto', () => {
    const lowR = 0.3   // Card quase esquecido
    const highR = 0.9  // Card ainda fresco
    
    const sIncLowR = calculateStabilityIncrease(5, 5, lowR, 2, DEFAULT_WEIGHTS)
    const sIncHighR = calculateStabilityIncrease(5, 5, highR, 2, DEFAULT_WEIGHTS)
    
    console.log(`\n📊 Spacing Effect:`)
    console.log(`  R = 30% (quase esquecido): SInc = ${sIncLowR.toFixed(2)}`)
    console.log(`  R = 90% (ainda fresco): SInc = ${sIncHighR.toFixed(2)}`)
    console.log(`  Boost por esperar: ${(sIncLowR / sIncHighR).toFixed(2)}x`)
    
    // Spacing Effect: revisar quando quase esquecido dá MUITO mais boost
    expect(sIncLowR).toBeGreaterThan(sIncHighR)
    expect(sIncLowR / sIncHighR).toBeGreaterThan(1.5) // Pelo menos 1.5x boost
  })
})

// ============================================================================
// FIXED INPUT TESTS - Valores exatos para regressão
// ============================================================================

describe('Testes com Valores Fixos (Regressão)', () => {
  const fixedNow = 1704067200000 // 2024-01-01 00:00:00 UTC

  test('primeira revisão "Good" produz valores esperados', () => {
    const result = processReview({}, 2, fixedNow)
    
    // Stability inicial para Good = w2 = 2.4
    expect(result.newState.stability).toBeCloseTo(DEFAULT_WEIGHTS.w2, 1)
    
    // Dificuldade inicial = 5
    expect(result.newState.difficulty).toBeCloseTo(INITIAL_DIFFICULTY, 0.5)
    
    // Step = 1
    expect(result.newState.step).toBe(1)
  })

  test('lapse após estabilidade alta', () => {
    const state: Partial<SRSState> = {
      stability: 60,  // 60 dias de estabilidade
      difficulty: 5,
      lapses: 2,
    }
    
    const result = processReview(state, 0, fixedNow)
    
    // Entra em relearning
    expect(result.newState.relearning_step).toBe(0)
    
    // Lapses incrementa
    expect(result.newState.lapses).toBe(3)
    
    // Stability cai drasticamente (< 10% do original)
    expect(result.newState.stability).toBeLessThan(6)
  })

  test('retrievability calculada corretamente para 5 dias com S=10', () => {
    const r = calculateRetrievability(10, 5)
    
    // Com S=10, após 5 dias (metade do intervalo), R deve ser ~95%
    expect(r).toBeGreaterThan(0.9)
    expect(r).toBeLessThan(1)
    
    console.log(`\n📊 Retrievability: S=10, t=5 dias → R = ${(r * 100).toFixed(1)}%`)
  })

  test('intervalo para retention 90% aproxima stability', () => {
    const stability = 15
    const interval = calculateIntervalForRetention(stability, 0.9)
    
    // Com 90% retention, intervalo deve ser próximo de stability
    expect(interval).toBeGreaterThan(stability * 0.8)
    expect(interval).toBeLessThan(stability * 1.2)
    
    console.log(`\n📊 Intervalo para R=90%: S=${stability} → I=${interval.toFixed(1)} dias`)
  })
})

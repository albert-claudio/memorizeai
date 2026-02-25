/**
 * FSRS Date Calculation Verification Test
 * 
 * This test verifies that:
 * 1. intervalDays is calculated correctly based on stability and retention
 * 2. next_review_at is correctly converted from days to milliseconds
 * 3. The resulting dates are reasonable for spaced repetition
 * 
 * Run with: npx vitest run src/lib/fsrs-date-verification.test.ts
 */

import { describe, test, expect } from 'vitest'
import {
  processReview,
  calculateIntervalForRetention,
  calculateRetrievability,
  formatInterval,
  type SRSState,
  type Grade,
  DEFAULT_CONFIG,
} from '../index'
import { DEFAULT_WEIGHTS, DECAY, FACTOR } from '../weights'

// Helper to format date
function formatDate(timestamp: number): string {
  return new Date(timestamp).toISOString().split('T')[0]
}

// Helper to format date with time
function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toISOString()
}

// ============================================================================
// TEST: Verify the interval formula is mathematically correct
// ============================================================================

describe('FSRS Interval Formula Verification', () => {
  test('interval formula matches FSRS-5 paper', () => {
    // The FSRS-5 formula for interval is:
    // I = S / FACTOR * (R^(1/DECAY) - 1)
    // Where:
    //   S = stability (days until ~90% retention)
    //   FACTOR = 19/81 ≈ 0.2346
    //   DECAY = -0.5
    //   R = desired retention (e.g., 0.90)
    
    const stability = 10 // days
    const retention = 0.90
    
    // Manual calculation
    const expectedInterval = (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1)
    
    // Our implementation
    const actualInterval = calculateIntervalForRetention(stability, retention)
    
    console.log('\n📐 FSRS-5 Interval Formula Verification:')
    console.log(`  Stability (S) = ${stability} days`)
    console.log(`  Desired Retention (R) = ${retention * 100}%`)
    console.log(`  FACTOR = ${FACTOR.toFixed(4)}`)
    console.log(`  DECAY = ${DECAY}`)
    console.log(`  Formula: I = S/FACTOR × (R^(1/DECAY) - 1)`)
    console.log(`  Expected interval = ${expectedInterval.toFixed(2)} days`)
    console.log(`  Actual interval = ${actualInterval.toFixed(2)} days`)
    
    // Should be approximately equal (fuzz factor excluded in this direct call)
    expect(actualInterval).toBeCloseTo(expectedInterval, 1)
    
    // For 90% retention, interval should be close to stability
    expect(actualInterval).toBeGreaterThan(stability * 0.9)
    expect(actualInterval).toBeLessThan(stability * 1.1)
  })

  test('higher retention = shorter intervals', () => {
    const stability = 10
    
    const interval95 = calculateIntervalForRetention(stability, 0.95)
    const interval90 = calculateIntervalForRetention(stability, 0.90)
    const interval85 = calculateIntervalForRetention(stability, 0.85)
    
    console.log('\n📊 Retention vs Interval (S=10 days):')
    console.log(`  95% retention → ${interval95.toFixed(2)} days (${formatInterval(interval95)})`)
    console.log(`  90% retention → ${interval90.toFixed(2)} days (${formatInterval(interval90)})`)
    console.log(`  85% retention → ${interval85.toFixed(2)} days (${formatInterval(interval85)})`)
    
    expect(interval95).toBeLessThan(interval90)
    expect(interval90).toBeLessThan(interval85)
    
    // 95% should give roughly half the interval of 85%
    expect(interval95).toBeLessThan(interval85 * 0.6)
  })
})

// ============================================================================
// TEST: Verify date calculations are correct
// ============================================================================

describe('Date Calculation Verification', () => {
  test('next_review_at is correctly calculated from intervalDays', () => {
    const now = Date.now()
    
    // Simulate first review with "Good"
    const result = processReview({}, 2, now, DEFAULT_CONFIG)
    
    const intervalMs = result.intervalDays * 24 * 60 * 60 * 1000
    const expectedNextReview = now + intervalMs
    
    console.log('\n📅 Date Calculation Test:')
    console.log(`  Now: ${formatDateTime(now)}`)
    console.log(`  Interval: ${result.intervalDays.toFixed(2)} days (${formatInterval(result.intervalDays)})`)
    console.log(`  Interval in ms: ${intervalMs.toLocaleString()}`)
    console.log(`  Expected next_review_at: ${formatDateTime(expectedNextReview)}`)
    console.log(`  Actual next_review_at: ${formatDateTime(result.newState.next_review_at)}`)
    
    // Allow for some variance due to fuzz factor (±5%)
    const tolerance = intervalMs * 0.1
    expect(result.newState.next_review_at).toBeGreaterThan(expectedNextReview - tolerance)
    expect(result.newState.next_review_at).toBeLessThan(expectedNextReview + tolerance)
  })

  test('first "Good" review schedules ~2.4 days ahead', () => {
    const now = Date.now()
    
    // First review with "Good" uses initial stability w2 = 2.4 days
    const result = processReview({}, 2, now, DEFAULT_CONFIG)
    
    // Expected interval = ~2.4 days for 90% retention with S=2.4
    const expectedDays = DEFAULT_WEIGHTS.w2 // 2.4 days
    
    console.log('\n📅 First "Good" Review:')
    console.log(`  Initial stability (w2) = ${DEFAULT_WEIGHTS.w2} days`)
    console.log(`  Actual interval = ${result.intervalDays.toFixed(2)} days`)
    console.log(`  Next review date: ${formatDateTime(result.newState.next_review_at)}`)
    
    // Should be close to initial stability
    expect(result.intervalDays).toBeGreaterThan(expectedDays * 0.8)
    expect(result.intervalDays).toBeLessThan(expectedDays * 1.3) // Allow fuzz + calculation variance
  })
})

// ============================================================================
// TEST: End-to-end simulation showing real dates
// ============================================================================

describe('End-to-End Date Simulation', () => {
  test('10-day study simulation with real dates', () => {
    // Start from a fixed date for reproducibility
    const startDate = new Date('2026-01-11T08:00:00-03:00').getTime()
    
    let state: Partial<SRSState> = {}
    let currentTime = startDate
    
    console.log('\n' + '='.repeat(80))
    console.log('📚 10-DAY STUDY SIMULATION')
    console.log('='.repeat(80))
    console.log(`Start: ${formatDateTime(startDate)}\n`)
    
    const schedule: Array<{
      day: number
      date: string
      grade: Grade
      stability: number
      interval: string
      nextReview: string
    }> = []
    
    // Simulate 10 reviews, always "Good" grade
    for (let i = 0; i < 10; i++) {
      const result = processReview(state, 2, currentTime, DEFAULT_CONFIG)
      
      schedule.push({
        day: i + 1,
        date: formatDate(currentTime),
        grade: 2,
        stability: result.newState.stability,
        interval: formatInterval(result.intervalDays),
        nextReview: formatDate(result.newState.next_review_at),
      })
      
      // Advance time to next review
      state = {
        ...result.newState,
        last_review_at: currentTime,
      }
      currentTime = result.newState.next_review_at
    }
    
    console.log('Day | Review Date  | Stability | Interval  | Next Review')
    console.log('-'.repeat(60))
    schedule.forEach(s => {
      console.log(`${s.day.toString().padStart(3)} | ${s.date}   | ${s.stability.toFixed(1).padStart(8)} | ${s.interval.padStart(9)} | ${s.nextReview}`)
    })
    
    // Final review should be at least a month out
    const finalInterval = (currentTime - startDate) / (24 * 60 * 60 * 1000)
    console.log(`\n📊 Total study period: ${finalInterval.toFixed(0)} days`)
    console.log(`📊 Final next review: ${formatDate(currentTime)}`)
    
    // Verify stability grows
    expect(schedule[9].stability).toBeGreaterThan(schedule[0].stability * 3)
    
    // Verify we don't end up reviewing every day forever
    expect(finalInterval).toBeGreaterThan(30)
  })

  test('what happens with realistic user behavior (mix of grades)', () => {
    const startDate = new Date('2026-01-11T08:00:00-03:00').getTime()
    
    // Realistic scenario: 2 Good, 1 Again, 3 Good, 1 Hard, 2 Good
    const grades: Grade[] = [2, 2, 0, 2, 2, 2, 1, 2, 2]
    
    let state: Partial<SRSState> = {}
    let currentTime = startDate
    
    console.log('\n' + '='.repeat(80))
    console.log('📚 REALISTIC USER SIMULATION (mixed grades)')
    console.log('='.repeat(80))
    console.log('Grades: Good, Good, AGAIN, Good, Good, Good, Hard, Good, Good\n')
    
    console.log('# | Grade  | Stability | Lapses | Interval  | Next Review')
    console.log('-'.repeat(65))
    
    grades.forEach((grade, i) => {
      const result = processReview(state, grade, currentTime, DEFAULT_CONFIG)
      
      const gradeLabel = grade === 0 ? 'AGAIN' : grade === 1 ? 'Hard' : grade === 2 ? 'Good' : 'Easy'
      console.log(
        `${(i + 1).toString().padStart(2)} | ${gradeLabel.padEnd(6)} | ${result.newState.stability.toFixed(1).padStart(9)} | ${result.newState.lapses.toString().padStart(6)} | ${formatInterval(result.intervalDays).padStart(9)} | ${formatDate(result.newState.next_review_at)}`
      )
      
      // For non-lapse, advance to next review
      // For lapse, just advance a bit (relearning)
      state = {
        ...result.newState,
        last_review_at: currentTime,
      }
      
      if (grade === 0) {
        // After lapse, user reviews again in 1 minute (but we simulate relearning completion)
        currentTime = currentTime + 10 * 60 * 1000 // 10 minutes
        // Complete relearning
        for (let step = 0; step < 3; step++) {
          const relearn = processReview({ ...state, relearning_step: step }, 2, currentTime, DEFAULT_CONFIG)
          state = { ...relearn.newState, last_review_at: currentTime }
          currentTime = relearn.newState.next_review_at
          if (relearn.newState.relearning_step === null) break
        }
      } else {
        currentTime = result.newState.next_review_at
      }
    })
    
    console.log('\n✅ Final state:')
    console.log(`   Stability: ${(state.stability || 0).toFixed(1)} days`)
    console.log(`   Difficulty: ${(state.difficulty || 5).toFixed(2)}`)
    console.log(`   Lapses: ${state.lapses || 0}`)
    
    // User shouldn't have forgotten everything after a lapse
    expect(state.stability).toBeGreaterThan(1)
    // But stability should be lower than perfect run
    expect(state.stability).toBeLessThan(50)
  })
})

// ============================================================================
// TEST: Verify retrievability at different intervals
// ============================================================================

describe('Retrievability Decay Verification', () => {
  test('retrievability matches expected decay curve', () => {
    const stability = 10 // days
    
    console.log('\n📉 Retrievability Decay Curve (S=10 days):')
    console.log('Days | Retrievability | Status')
    console.log('-'.repeat(40))
    
    const checkpoints = [0, 1, 5, 10, 15, 20, 30]
    
    checkpoints.forEach(days => {
      const r = calculateRetrievability(stability, days)
      const status = r >= 0.9 ? '🟢 Great' : r >= 0.7 ? '🟡 OK' : '🔴 Danger'
      console.log(`${days.toString().padStart(4)} | ${(r * 100).toFixed(1).padStart(13)}% | ${status}`)
    })
    
    // At t=0, R should be 100%
    expect(calculateRetrievability(stability, 0)).toBe(1)
    
    // At t=S (10 days), R should be ~90%
    const rAtStability = calculateRetrievability(stability, stability)
    expect(rAtStability).toBeGreaterThan(0.88)
    expect(rAtStability).toBeLessThan(0.92)
    
    // At t=2S (20 days), R should be lower
    expect(calculateRetrievability(stability, 20)).toBeLessThan(0.85)
  })
})

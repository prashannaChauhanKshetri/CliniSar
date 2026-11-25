import { describe, expect, it } from 'vitest'
import { chartDomain, lastChange, parseRange, visitLabel } from './history'

describe('visitLabel', () => {
  it('says nothing for a first visit and counts returning visits in words', () => {
    expect(visitLabel(0)).toBeNull()
    expect(visitLabel(1)).toBe('2nd visit')
    expect(visitLabel(2)).toBe('3rd visit')
    expect(visitLabel(3)).toBe('4th visit')
    expect(visitLabel(10)).toBe('11th visit')
    expect(visitLabel(20)).toBe('21st visit')
  })
})

describe('parseRange', () => {
  it('reads number ranges, with or without spaces', () => {
    expect(parseRange('70-140')).toEqual({ low: 70, high: 140 })
    expect(parseRange('4.0 - 11.0')).toEqual({ low: 4, high: 11 })
  })

  it('gives no band for ranges written as text', () => {
    expect(parseRange('< 5.7')).toBeNull()
    expect(parseRange('Non-Reactive')).toBeNull()
    expect(parseRange('')).toBeNull()
  })
})

describe('lastChange', () => {
  it('compares the newest value with the one before', () => {
    expect(lastChange([210, 182, 140])).toEqual({ from: 182, to: 140 })
    expect(lastChange([140])).toBeNull()
  })
})

describe('chartDomain', () => {
  it('always shows the normal range, even when every value is above it', () => {
    const [low, high] = chartDomain([210, 185, 162], { low: 70, high: 140 })
    expect(low).toBeLessThanOrEqual(70)
    expect(high).toBeGreaterThanOrEqual(210)
  })

  it('works without a range and never goes below zero', () => {
    expect(chartDomain([2, 3], null)[0]).toBeGreaterThanOrEqual(0)
    expect(chartDomain([5, 5], null)).toEqual([4, 6])
  })
})

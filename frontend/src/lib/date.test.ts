import { describe, expect, it } from 'vitest'
import {
  adToBs,
  addDays,
  daysInBsMonth,
  formatAD,
  formatBS,
  formatBSNumeric,
  formatBSWithAD,
  formatNepalTime,
  isValidBs,
  nepalDateOf,
  toAD,
  weekdayOf,
} from './date'

// Known AD <-> BS pairs (New Year days and the brief's own example).
const KNOWN_PAIRS: [string, string][] = [
  ['1943-04-14', '2000-01-01'], // first day of BS 2000
  ['2000-01-01', '2056-09-17'],
  ['2024-04-13', '2081-01-01'],
  ['2025-04-14', '2082-01-01'],
  ['2026-04-14', '2083-01-01'],
  ['2026-11-18', '2083-08-02'], // "2083 Mangsir 2" from the brief
]

describe('AD <-> BS conversion', () => {
  it.each(KNOWN_PAIRS)('AD %s is BS %s', (ad, bs) => {
    const { year, month, day } = adToBs(ad)
    expect(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`).toBe(bs)
  })

  it.each(KNOWN_PAIRS)('BS -> AD gives back %s', (ad, bs) => {
    expect(toAD(bs)).toBe(ad)
  })

  it('accepts a BS date object as well as text', () => {
    expect(toAD({ year: 2083, month: 8, day: 2 })).toBe('2026-11-18')
  })

  it('round-trips every day of BS 2082 and 2083', () => {
    let ad = toAD('2082-01-01')
    for (let i = 0; i < 730; i++) {
      const bs = adToBs(ad)
      expect(toAD(bs)).toBe(ad)
      ad = addDays(ad, 1)
    }
  })

  it('covers the whole range BS 2000 to 2099', () => {
    expect(toAD('2000-01-01')).toBe('1943-04-14')
    const lastDay = daysInBsMonth(2099, 12)
    expect(() => toAD({ year: 2099, month: 12, day: lastDay })).not.toThrow()
  })

  it('refuses years outside BS 2000-2099', () => {
    expect(() => toAD('1999-12-30')).toThrow(RangeError)
    expect(() => toAD('2100-01-01')).toThrow(RangeError)
    expect(() => adToBs('1943-04-13')).toThrow(RangeError)
  })

  it('refuses text that is not a plain date', () => {
    expect(() => adToBs('18/11/2026')).toThrow(TypeError)
    expect(() => toAD('2083-8-2')).toThrow(TypeError)
  })

  it('knows which BS days exist', () => {
    expect(isValidBs({ year: 2083, month: 8, day: 2 })).toBe(true)
    expect(isValidBs({ year: 2083, month: 13, day: 1 })).toBe(false)
    expect(isValidBs({ year: 2083, month: 1, day: 33 })).toBe(false)
  })

  it('gives BS month lengths between 29 and 32 days', () => {
    for (let month = 1; month <= 12; month++) {
      const days = daysInBsMonth(2083, month)
      expect(days).toBeGreaterThanOrEqual(29)
      expect(days).toBeLessThanOrEqual(32)
    }
    // A BS year has 365 or 366 days.
    const year = Array.from({ length: 12 }, (_, i) => daysInBsMonth(2083, i + 1))
    expect([365, 366]).toContain(year.reduce((a, b) => a + b))
  })
})

describe('formatting', () => {
  it('formats BS dates as words and as numbers', () => {
    expect(formatBS('2026-11-18')).toBe('2083 Mangsir 2')
    expect(formatBSNumeric('2026-11-18')).toBe('2083/08/02')
    expect(formatAD('2026-11-18')).toBe('18 Nov 2026')
    expect(formatBSWithAD('2026-11-18')).toBe('2083 Mangsir 2 (18 Nov 2026)')
  })

  it('shows UTC timestamps in Nepal time (UTC+5:45)', () => {
    // 20:00 UTC on 17 Nov is 01:45 on 18 Nov in Kathmandu: the date moves forward.
    expect(nepalDateOf('2026-11-17T20:00:00Z')).toBe('2026-11-18')
    expect(formatNepalTime('2026-11-17T20:00:00Z')).toBe('2083 Mangsir 2, 1:45 AM')
    expect(formatNepalTime('2026-11-18T09:15:00Z')).toBe('2083 Mangsir 2, 3:00 PM')
  })

  it('finds weekdays without time-zone shifts (0 = Sunday)', () => {
    expect(weekdayOf('2026-11-18')).toBe(3) // Wednesday
    expect(weekdayOf('2026-11-22')).toBe(0) // Sunday
  })

  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
  })
})

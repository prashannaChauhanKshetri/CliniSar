/**
 * Small rules for returning patients (phase 12), kept here so they are easy to test.
 *
 * EN: The doctor sees at a glance whether a patient is new or coming back, and how
 *     their lab values move compared with the normal range.
 * NP: Patient naya ho ki feri aako, ra lab ko value normal range bhanda mathi ki tala
 *     bhanne kura yaha bata nikalcha. Sano function, test garna sajilo.
 */

/** "2nd visit", "3rd visit"... for a patient seen before; null for a first visit. */
export function visitLabel(previousVisits: number): string | null {
  if (previousVisits <= 0) return null
  const n = previousVisits + 1
  const lastTwo = n % 100
  const suffix =
    lastTwo >= 11 && lastTwo <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th')
  return `${n}${suffix} visit`
}

/**
 * A lab reference range like "70-140" or "4.0 - 11.0" as numbers, for the chart's
 * normal band. Ranges written as text ("< 5.7", "Negative") give null: no band.
 */
export function parseRange(range: string): { low: number; high: number } | null {
  const match = /^\s*(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*$/.exec(range)
  if (!match) return null
  const low = Number(match[1])
  const high = Number(match[2])
  return low < high ? { low, high } : null
}

/** How the newest value compares with the one before: for "182 → 140" style text. */
export function lastChange(values: number[]): { from: number; to: number } | null {
  if (values.length < 2) return null
  return { from: values[values.length - 2], to: values[values.length - 1] }
}

/**
 * The y-axis of a lab chart: the values AND the normal range, with a little space, so
 * the dashed normal lines are always on screen.
 */
export function chartDomain(
  values: number[],
  range: { low: number; high: number } | null,
): [number, number] {
  const all = range ? [...values, range.low, range.high] : values
  const low = Math.min(...all)
  const high = Math.max(...all)
  const pad = (high - low) * 0.1 || Math.abs(high) * 0.1 || 1
  return [Math.max(0, Math.floor(low - pad)), Math.ceil(high + pad)]
}

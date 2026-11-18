/**
 * Bikram Sambat (BS) dates for display. This is the ONLY file that imports the BS
 * library, so the calendar data can be checked or replaced in one place.
 *
 * The API always speaks AD: dates as "YYYY-MM-DD" and timestamps in UTC. This file
 * turns them into BS for people, and turns a BS date picked on screen back into AD.
 *
 * Library: @remotemerge/nepali-date-converter. Chosen because it covers BS 2000-2099
 * (the two most popular libraries stop at 2090), converts every one of the 36,525
 * days of that range to AD and back without a gap, works on plain "YYYY-MM-DD" text
 * (so the computer's time zone cannot shift a date), and has no dependencies.
 * Note: official BS month lengths are published only a year or two ahead; for years
 * after 2084 every library uses projections. Dates are STORED in AD, so if a future
 * month turns out one day different, only the BS display changes, never the data.
 */
import DateConverter from '@remotemerge/nepali-date-converter'

export const BS_MONTHS = [
  'Baisakh',
  'Jestha',
  'Asar',
  'Shrawan',
  'Bhadra',
  'Ashwin',
  'Kartik',
  'Mangsir',
  'Poush',
  'Magh',
  'Falgun',
  'Chaitra',
] as const

/** Weeks start on Sunday, as in Nepal. */
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export const FIRST_BS_YEAR = 2000
export const LAST_BS_YEAR = 2099
export const NEPAL_TIME_ZONE = 'Asia/Kathmandu'

/** A BS calendar date. Months are 1-12 (Baisakh = 1). */
export interface BsDate {
  year: number
  month: number
  day: number
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const MS_PER_DAY = 24 * 60 * 60 * 1000

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** {year, month, day} -> "YYYY-MM-DD" (works for AD and BS numbers alike). */
export function toIsoText({ year, month, day }: BsDate): string {
  return `${year}-${pad(month)}-${pad(day)}`
}

function parseDateText(text: string): BsDate {
  const match = ISO_DATE.exec(text)
  if (!match) throw new TypeError(`Expected a date like 2026-11-18, got "${text}".`)
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

function checkBsRange(date: BsDate): BsDate {
  if (date.year < FIRST_BS_YEAR || date.year > LAST_BS_YEAR) {
    throw new RangeError(
      `Only BS ${FIRST_BS_YEAR}-${LAST_BS_YEAR} is supported (got BS ${date.year}).`,
    )
  }
  return date
}

/** AD "YYYY-MM-DD" -> BS date. */
export function adToBs(isoDate: string): BsDate {
  parseDateText(isoDate) // reject anything that is not a plain date
  const bs = new DateConverter(isoDate).toBs()
  return checkBsRange({ year: bs.year, month: bs.month, day: bs.date })
}

/** BS date (object or "YYYY-MM-DD" text) -> AD "YYYY-MM-DD". This is what forms submit. */
export function toAD(bsDate: BsDate | string): string {
  const date = checkBsRange(typeof bsDate === 'string' ? parseDateText(bsDate) : bsDate)
  const ad = new DateConverter(toIsoText(date)).toAd() // throws for a day that does not exist
  return toIsoText({ year: ad.year, month: ad.month, day: ad.date })
}

/** True when this BS day exists (e.g. Mangsir 30 exists in some years only). */
export function isValidBs(date: BsDate): boolean {
  try {
    toAD(date)
    return true
  } catch {
    return false
  }
}

/** Number of days (29-32) in a BS month. */
export function daysInBsMonth(year: number, month: number): number {
  for (const day of [32, 31, 30, 29]) {
    if (isValidBs({ year, month, day })) return day
  }
  throw new RangeError(`No data for BS ${year}-${pad(month)}.`)
}

/** 0 = Sunday ... 6 = Saturday, for an AD date (computed in UTC, so no time-zone shift). */
export function weekdayOf(isoDate: string): number {
  const { year, month, day } = parseDateText(isoDate)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

/** Add (or subtract) whole days to an AD date. */
export function addDays(isoDate: string, days: number): string {
  const { year, month, day } = parseDateText(isoDate)
  const moved = new Date(Date.UTC(year, month - 1, day) + days * MS_PER_DAY)
  return toIsoText({
    year: moved.getUTCFullYear(),
    month: moved.getUTCMonth() + 1,
    day: moved.getUTCDate(),
  })
}

/** "2083 Mangsir 2" */
export function formatBS(isoDate: string): string {
  const { year, month, day } = adToBs(isoDate)
  return `${year} ${BS_MONTHS[month - 1]} ${day}`
}

/** "2083/08/02": the numeric style printed on the clinic's paper forms. */
export function formatBSNumeric(isoDate: string): string {
  const { year, month, day } = adToBs(isoDate)
  return `${year}/${pad(month)}/${pad(day)}`
}

/** "18 Nov 2026" */
export function formatAD(isoDate: string): string {
  const { year, month, day } = parseDateText(isoDate)
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

/** "2083 Mangsir 2 (18 Nov 2026)" */
export function formatBSWithAD(isoDate: string): string {
  return `${formatBS(isoDate)} (${formatAD(isoDate)})`
}

/** The calendar date in Nepal at a given moment, as AD "YYYY-MM-DD". */
export function nepalDateOf(moment: string | Date): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: NEPAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(moment))
}

/** Today's date in Nepal (AD), whatever the computer's own time zone is. */
export function todayInNepal(): string {
  return nepalDateOf(new Date())
}

/** A UTC timestamp from the API shown in Nepal time: "2083 Mangsir 2, 3:45 PM". */
export function formatNepalTime(utcTimestamp: string): string {
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: NEPAL_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(utcTimestamp))
  return `${formatBS(nepalDateOf(utcTimestamp))}, ${time}`
}

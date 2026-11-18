/**
 * Showing rupee amounts. The API sends money as exact decimal text ("125000.00");
 * every calculation happens on the server, the front end only formats.
 */

const LAKH_GROUPING = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** "125000" -> "Rs. 1,25,000.00" (Indian lakh grouping). */
export function formatRs(amount: string | number): string {
  const value = typeof amount === 'number' ? amount : Number(amount)
  if (!Number.isFinite(value)) throw new TypeError(`Not an amount: "${amount}"`)
  const text = LAKH_GROUPING.format(Math.abs(value))
  return value < 0 ? `-Rs. ${text}` : `Rs. ${text}`
}

const ONES = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function belowHundred(n: number): string {
  if (n < 20) return ONES[n]
  const tens = TENS[Math.floor(n / 10)]
  return n % 10 ? `${tens}-${ONES[n % 10]}` : tens
}

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  const parts = []
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`)
  if (rest) parts.push(belowHundred(rest))
  return parts.join(' ')
}

/** Whole rupees in the Indian system: crore, lakh, thousand, hundred. */
function rupeesInWords(n: number): string {
  if (n === 0) return 'Zero'
  const parts = []
  const crore = Math.floor(n / 10_000_000)
  const lakh = Math.floor(n / 100_000) % 100
  const thousand = Math.floor(n / 1_000) % 100
  const rest = n % 1_000
  if (crore) parts.push(`${rupeesInWords(crore)} Crore`)
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`)
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`)
  if (rest) parts.push(belowThousand(rest))
  return parts.join(' ')
}

/**
 * "125050.50" -> "Rupees One Lakh Twenty-Five Thousand Fifty and Fifty Paisa Only",
 * for the "In Words" line of a printed bill. Works on the text, never on floats.
 */
export function amountInWords(amount: string): string {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim())
  if (!match) throw new TypeError(`Not a positive amount: "${amount}"`)
  const rupees = Number(match[1])
  const paisa = Number((match[2] ?? '').padEnd(2, '0'))
  const words = `Rupees ${rupeesInWords(rupees)}`
  return paisa ? `${words} and ${belowHundred(paisa)} Paisa Only` : `${words} Only`
}

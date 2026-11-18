/** How bill numbers and sources are shown. */
import type { Invoice, InvoiceSource } from '../api/resources'

/** "12" for clinic bills, "L-3" for the lab's own bill book. */
export function billNumber(invoice: Pick<Invoice, 'series' | 'number'>): string {
  return invoice.series === 'LAB' ? `L-${invoice.number}` : String(invoice.number)
}

export const SOURCE_LABELS: Record<InvoiceSource, string> = {
  CONSULTATION: 'Consultation',
  PHARMACY: 'Pharmacy',
  LAB: 'Lab',
}

/** "VAT 13%" from "13.00"; the bill's own rate, not today's setting. */
export function vatLabel(rate: string): string {
  return `VAT ${Number(rate)}%`
}

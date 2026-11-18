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

export interface TotalLine {
  label: string
  amount: string
  strong?: boolean
}

/**
 * The total lines of a bill, used by the screen AND every printout so they always
 * agree: Subtotal, Discount (only if any), Taxable amount and "VAT x%" (only when the
 * bill's own VAT rate is above 0), then Total. All amounts come from the server.
 */
export function totalLines(
  bill: Pick<Invoice, 'subtotal' | 'discount' | 'vat_rate' | 'vat_amount' | 'total'>,
): TotalLine[] {
  const lines: TotalLine[] = [{ label: 'Subtotal', amount: bill.subtotal }]
  const hasDiscount = Number(bill.discount) > 0
  const hasVat = Number(bill.vat_rate) > 0
  if (hasDiscount) lines.push({ label: 'Discount', amount: `-${bill.discount}` })
  if (hasVat) {
    // Display only: the server stored total = taxable + VAT; taxable is subtotal - discount.
    const taxable = (Number(bill.subtotal) - Number(bill.discount)).toFixed(2)
    lines.push({ label: 'Taxable amount', amount: taxable })
    lines.push({ label: vatLabel(bill.vat_rate), amount: bill.vat_amount })
  }
  lines.push({ label: 'Total', amount: bill.total, strong: true })
  return lines
}

/** "1234.5" -> { rupees: "1,234", paisa: "50" } for the Rs. | Ps. columns of paper bills. */
export function rupeesAndPaisa(amount: string): { rupees: string; paisa: string } {
  const [whole, fraction = ''] = Number(amount).toFixed(2).split('.')
  const negative = whole.startsWith('-')
  const grouped = new Intl.NumberFormat('en-IN').format(Math.abs(Number(whole)))
  return { rupees: `${negative ? '-' : ''}${grouped}`, paisa: fraction.padEnd(2, '0') }
}

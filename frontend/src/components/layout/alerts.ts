/** Which "needs attention" items the bell shows, worked out from the dashboard numbers. */
import type { DashboardSummary, Role } from '../../api/types'
import { canOpen } from '../../routes/navigation'

export interface Alert {
  text: string
  path: string
}

/** Turn the dashboard numbers into "things that need attention" for this role. */
export function alertsFrom(summary: DashboardSummary | undefined, role: Role): Alert[] {
  if (!summary) return []
  // [count, text for 1, text for more, where to go]
  const candidates: [number | null | undefined, string, string, string][] = [
    [
      summary.stock?.low_stock_medicines,
      'medicine is low on stock',
      'medicines are low on stock',
      '/medicines?low_stock=true',
    ],
    [summary.stock?.expired_batches, 'batch has expired', 'batches have expired', '/expiry'],
    [
      summary.stock?.expiring_soon_batches,
      'batch expires within 90 days',
      'batches expire within 90 days',
      '/expiry',
    ],
    [summary.pending_lab_orders, 'lab order is waiting', 'lab orders are waiting', '/lab-orders'],
    [
      summary.patients_to_check,
      'patient registered at the lab needs checking',
      'patients registered at the lab need checking',
      '/patients?needs_review=true',
    ],
    [summary.unpaid_invoices, 'bill is unpaid', 'bills are unpaid', '/invoices?status=UNPAID'],
    // Admin only (null for others): the front desk cancelled a bill. NP: admin lai khabar.
    [
      summary.cancelled_bills_to_review,
      'bill was cancelled by the front desk',
      'bills were cancelled by the front desk',
      '/invoices?cancel_needs_review=true',
    ],
  ]
  return candidates
    .filter(([count, , , path]) => count && canOpen(role, path.split('?')[0]))
    .map(([count, one, many, path]) => ({ text: `${count} ${count === 1 ? one : many}`, path }))
}

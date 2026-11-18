import { describe, expect, it } from 'vitest'
import type { DashboardSummary } from '../../api/types'
import { alertsFrom } from './alerts'

const summary = {
  stock: { low_stock_medicines: 2, expiring_soon_batches: 1, expired_batches: 0 },
  pending_lab_orders: 3,
  unpaid_invoices: 5,
} as DashboardSummary

describe('alertsFrom', () => {
  it('lists only non-zero items the role can open', () => {
    expect(alertsFrom(summary, 'PHARMACIST').map((a) => a.text)).toEqual([
      '2 medicines are low on stock',
      '1 batch expires within 90 days',
      '5 bills are unpaid',
    ])
    expect(alertsFrom(summary, 'DOCTOR').map((a) => a.text)).toEqual(['3 lab orders are waiting'])
  })

  it('is empty before the numbers arrive', () => {
    expect(alertsFrom(undefined, 'CLINIC_ADMIN')).toEqual([])
  })
})

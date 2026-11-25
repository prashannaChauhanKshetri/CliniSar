import { describe, expect, it } from 'vitest'
import type { DashboardSummary } from '../../api/types'
import { alertsFrom } from './alerts'

const summary = {
  stock: { low_stock_medicines: 2, expiring_soon_batches: 1, expired_batches: 0 },
  pending_lab_orders: 3,
  patients_to_check: 2,
  unpaid_invoices: 5,
  cancelled_bills_to_review: null,
} as DashboardSummary

describe('alertsFrom', () => {
  it('lists only non-zero items the role can open', () => {
    expect(alertsFrom({ ...summary, patients_to_check: null }, 'STAFF').map((a) => a.text)).toEqual(
      [
        '2 medicines are low on stock',
        '1 batch expires within 90 days',
        '3 lab orders are waiting',
        '5 bills are unpaid',
      ],
    )
    // The server sends patients_to_check to admin and front desk only.
    expect(
      alertsFrom({ ...summary, patients_to_check: null }, 'DOCTOR').map((a) => a.text),
    ).toEqual(['3 lab orders are waiting'])
  })

  it('tells the front desk about patients registered at the lab', () => {
    expect(alertsFrom(summary, 'STAFF').map((a) => a.text)).toContain(
      '2 patients registered at the lab need checking',
    )
    expect(alertsFrom({ ...summary, patients_to_check: 1 }, 'STAFF').map((a) => a.path)).toContain(
      '/patients?needs_review=true',
    )
  })

  it('tells the admin about bills the front desk cancelled', () => {
    const admin = alertsFrom({ ...summary, cancelled_bills_to_review: 2 }, 'CLINIC_ADMIN')
    expect(admin).toContainEqual({
      text: '2 bills were cancelled by the front desk',
      path: '/invoices?cancel_needs_review=true',
    })
  })

  it('is empty before the numbers arrive', () => {
    expect(alertsFrom(undefined, 'CLINIC_ADMIN')).toEqual([])
  })
})

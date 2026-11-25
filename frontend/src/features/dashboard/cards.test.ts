import { describe, expect, it } from 'vitest'
import type { DashboardSummary } from '../../api/types'
import { cardsFor } from './cards'

const full = {
  total_patients: 10,
  total_doctors: 3,
  new_patients: { value: 2, previous: 1, change_percent: 100 },
  appointments: { value: 10, previous: 7, change_percent: 42.9 },
  earnings: { value: '3950.00', previous: '3800.00', change_percent: 3.9 },
  vat_collected: { value: '0.00', previous: '0.00', change_percent: null },
  stock: { low_stock_medicines: 1, expiring_soon_batches: 1, expired_batches: 1 },
  pending_lab_orders: 2,
  unpaid_invoices: 5,
} as DashboardSummary

const labels = (summary: DashboardSummary, role: Parameters<typeof cardsFor>[1]) =>
  cardsFor(summary, role).map((c) => c.label)

describe('dashboard cards per role', () => {
  it('admin: patients, doctors, appointments, earnings', () => {
    expect(labels(full, 'CLINIC_ADMIN')).toEqual([
      'Total patients',
      'Doctors',
      'Appointments',
      'Earnings (without VAT)',
    ])
    const earnings = cardsFor(full, 'CLINIC_ADMIN')[3]
    expect(earnings.value).toBe('Rs. 3,950.00')
    expect(earnings.changePercent).toBe(3.9)
  })

  it('front desk & pharmacy: the work, no earnings (the admin handles the money)', () => {
    const deskView = { ...full, earnings: null, vat_collected: null }
    expect(labels(deskView, 'STAFF')).toEqual([
      'Total patients',
      'Appointments',
      'Unpaid bills',
      'Low-stock medicines',
    ])
  })

  it('doctor: no money cards, because the server hides money from doctors', () => {
    const doctorView = {
      ...full,
      earnings: null,
      vat_collected: null,
      unpaid_invoices: null,
      stock: null,
    }
    expect(labels(doctorView, 'DOCTOR')).toEqual([
      'Total patients',
      'Appointments',
      'Lab orders waiting',
      'Doctors',
    ])
  })

  it('lab technician: money and lab work', () => {
    const labView = { ...full, total_patients: null, appointments: null, stock: null }
    expect(labels(labView, 'LAB_TECHNICIAN')).toEqual([
      'Earnings (without VAT)',
      'VAT collected',
      'Lab orders waiting',
      'Unpaid bills',
    ])
  })
})

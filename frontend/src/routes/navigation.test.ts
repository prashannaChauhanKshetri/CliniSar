import { describe, expect, it } from 'vitest'
import type { Role } from '../api/types'
import { canOpen, navFor, screenFor } from './navigation'

function menu(role: Role): string[] {
  return navFor(role).flatMap((section) => section.items.map((item) => item.label))
}

describe('menu by role', () => {
  it('shows the clinic admin everything', () => {
    expect(menu('CLINIC_ADMIN')).toEqual([
      'Dashboard',
      'Appointments',
      'Patients',
      'Prescriptions',
      'Documents',
      'Medicines',
      'Expiry',
      'Lab orders',
      'Lab tests',
      'Invoices',
      'Doctors',
      'Staff',
      'Departments',
    ])
  })

  it('shows a doctor clinical screens only', () => {
    expect(menu('DOCTOR')).toEqual([
      'Dashboard',
      'Appointments',
      'My schedule',
      'Patients',
      'Prescriptions',
      'Documents',
      'Lab orders',
    ])
  })

  it('shows the front desk & pharmacy the queue, patients AND the pharmacy', () => {
    expect(menu('STAFF')).toEqual([
      'Dashboard',
      'Appointments',
      'Patients',
      'Prescriptions',
      'Documents',
      'Medicines',
      'Expiry',
      'Lab orders',
      'Invoices',
      'Doctors',
    ])
  })

  it('shows a lab technician the lab', () => {
    expect(menu('LAB_TECHNICIAN')).toEqual(['Dashboard', 'Lab orders', 'Lab tests', 'Invoices'])
  })

  it('drops section headings that would be empty', () => {
    expect(navFor('DOCTOR').map((section) => section.title)).not.toContain('Pharmacy')
  })
})

describe('access by address', () => {
  it('detail pages follow their list page', () => {
    expect(screenFor('/patients/123')?.path).toBe('/patients')
    expect(screenFor('/appointments/new')?.path).toBe('/appointments/new')
  })

  it.each([
    ['STAFF', '/patients/abc', true],
    ['LAB_TECHNICIAN', '/patients', false],
    ['DOCTOR', '/medicines', false],
    ['LAB_TECHNICIAN', '/settings', false],
    ['CLINIC_ADMIN', '/settings', true],
    ['DOCTOR', '/appointments/new', false],
    ['STAFF', '/unknown-page', false],
  ] as [Role, string, boolean][])('%s opening %s -> %s', (role, path, allowed) => {
    expect(canOpen(role, path)).toBe(allowed)
  })
})

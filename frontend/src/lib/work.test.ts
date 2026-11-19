import { describe, expect, it } from 'vitest'
import type { Appointment, LabOrder } from '../api/resources'
import { labColumns } from './labWork'
import { callingOrder, nepalClock, queueByDoctor } from './queue'
import { checkStock } from './stock'

function visit(changes: Partial<Appointment>): Appointment {
  return {
    id: Math.random().toString(36),
    visit_type: 'WALK_IN',
    patient: 'p',
    patient_name: 'P',
    doctor: 'd1',
    doctor_name: 'Anil Sharma',
    department_name: 'General',
    date: '2026-11-19',
    start_time: null,
    end_time: null,
    queue_number: null,
    status: 'BOOKED',
    reason: '',
    cancel_reason: '',
    created_at: '',
    ...changes,
  }
}

describe('callingOrder', () => {
  it('calls due bookings first, then walk-ins by number, then later bookings', () => {
    const later = visit({ patient_name: 'Later', visit_type: 'SCHEDULED', start_time: '11:00:00' })
    const due = visit({ patient_name: 'Due', visit_type: 'SCHEDULED', start_time: '09:40:00' })
    const second = visit({ patient_name: 'Walk 2', queue_number: 2 })
    const first = visit({ patient_name: 'Walk 1', queue_number: 1 })
    const seen = visit({ patient_name: 'Seen', queue_number: 3, status: 'COMPLETED' })

    const order = callingOrder([later, second, seen, due, first], '10:00').map(
      (v) => v.patient_name,
    )

    expect(order).toEqual(['Due', 'Walk 1', 'Walk 2', 'Later'])
  })
})

describe('queueByDoctor', () => {
  it('makes one column per doctor, in name order, with finished visits apart', () => {
    const columns = queueByDoctor(
      [
        visit({ doctor: 'd2', doctor_name: 'Sunita Karki', queue_number: 1 }),
        visit({ doctor: 'd1', queue_number: 1 }),
        visit({ doctor: 'd1', queue_number: 2, status: 'COMPLETED' }),
      ],
      '10:00',
    )
    expect(columns.map((c) => [c.doctorName, c.waiting.length, c.done.length])).toEqual([
      ['Anil Sharma', 1, 1],
      ['Sunita Karki', 1, 0],
    ])
  })

  it('reads the clock in Nepal time', () => {
    expect(nepalClock(new Date('2026-11-19T04:30:00Z'))).toBe('10:15')
  })
})

describe('checkStock', () => {
  it('says how many units are missing per medicine', () => {
    const result = checkStock(
      [
        { medicine: 'm1', medicine_name: 'Paracetamol', quantity: 9 },
        { medicine: 'm2', medicine_name: 'Cough Syrup', quantity: 20 },
      ],
      { m1: 391, m2: 8 },
    )
    expect(result.map((r) => [r.name, r.short])).toEqual([
      ['Paracetamol', 0],
      ['Cough Syrup', 12],
    ])
  })
})

describe('labColumns', () => {
  it('splits orders into to collect, to enter and done today', () => {
    const order = (status: LabOrder['status'], completed_at: string | null = null) =>
      ({
        id: status + completed_at,
        status,
        created_at: '2026-11-19T03:00:00Z',
        completed_at,
      }) as LabOrder
    const columns = labColumns(
      [
        order('ORDERED'),
        order('SAMPLE_COLLECTED'),
        order('COMPLETED', '2026-11-19T05:00:00Z'),
        order('COMPLETED', '2026-11-10T05:00:00Z'),
        order('CANCELLED'),
      ],
      '2026-11-19',
    )
    expect([columns.toCollect.length, columns.toEnter.length, columns.doneToday.length]).toEqual([
      1, 1, 1,
    ])
  })
})

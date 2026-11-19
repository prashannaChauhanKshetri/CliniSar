/** The lab's work board: what to collect, what to enter, what was finished today. */
import type { LabOrder } from '../api/resources'
import { nepalDateOf } from './date'

export interface LabColumns {
  toCollect: LabOrder[]
  toEnter: LabOrder[]
  doneToday: LabOrder[]
}

export function labColumns(orders: LabOrder[], today: string): LabColumns {
  const oldestFirst = (a: LabOrder, b: LabOrder) => a.created_at.localeCompare(b.created_at)
  return {
    toCollect: orders.filter((o) => o.status === 'ORDERED').sort(oldestFirst),
    toEnter: orders.filter((o) => o.status === 'SAMPLE_COLLECTED').sort(oldestFirst),
    doneToday: orders.filter(
      (o) => o.status === 'COMPLETED' && o.completed_at && nepalDateOf(o.completed_at) === today,
    ),
  }
}

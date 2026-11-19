/**
 * How a day's visits are arranged on the queue board and which patient is "next".
 *
 * Order for one doctor: booked slots whose time has come, then walk-ins in queue order,
 * then booked slots later in the day. Seen, cancelled and no-show visits come last.
 */
import type { Appointment } from '../api/resources'
import { formatTime } from './forms'

export interface DoctorQueue {
  doctorId: string
  doctorName: string
  department: string | null
  /** Still to be seen, in the order they should be called. */
  waiting: Appointment[]
  /** Seen, cancelled or no-show. */
  done: Appointment[]
}

/** "10:20:00" vs "10:05" style comparison; times from the API are "HH:MM:SS". */
function timeHasCome(visit: Appointment, nowTime: string): boolean {
  return visit.start_time !== null && visit.start_time.slice(0, 5) <= nowTime
}

/** The waiting visits of one doctor, in calling order. */
export function callingOrder(visits: Appointment[], nowTime: string): Appointment[] {
  const waiting = visits.filter((v) => v.status === 'BOOKED')
  const byTime = (a: Appointment, b: Appointment) =>
    (a.start_time ?? '').localeCompare(b.start_time ?? '')
  const dueBookings = waiting
    .filter((v) => v.visit_type === 'SCHEDULED' && timeHasCome(v, nowTime))
    .sort(byTime)
  const walkIns = waiting
    .filter((v) => v.visit_type === 'WALK_IN')
    .sort((a, b) => (a.queue_number ?? 0) - (b.queue_number ?? 0))
  const laterBookings = waiting
    .filter((v) => v.visit_type === 'SCHEDULED' && !timeHasCome(v, nowTime))
    .sort(byTime)
  return [...dueBookings, ...walkIns, ...laterBookings]
}

/** One column per doctor, doctors in name order. */
export function queueByDoctor(visits: Appointment[], nowTime: string): DoctorQueue[] {
  const byDoctor = new Map<string, Appointment[]>()
  for (const visit of visits)
    byDoctor.set(visit.doctor, [...(byDoctor.get(visit.doctor) ?? []), visit])
  return [...byDoctor.entries()]
    .map(([doctorId, list]) => ({
      doctorId,
      doctorName: list[0].doctor_name,
      department: list[0].department_name,
      waiting: callingOrder(list, nowTime),
      done: list.filter((v) => v.status !== 'BOOKED'),
    }))
    .sort((a, b) => a.doctorName.localeCompare(b.doctorName))
}

/** "14:05", the current time in Nepal, for comparing with slot times. */
export function nepalClock(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kathmandu',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now)
}

/** "#3" for a walk-in, "10:20 AM" for a booked slot. */
export function visitSlot(visit: Appointment): string {
  return visit.visit_type === 'WALK_IN' ? `#${visit.queue_number}` : formatTime(visit.start_time)
}

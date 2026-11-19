/** Shapes of the JSON the CliniSar API sends. Field names match the API exactly. */

export type Role =
  'SUPER_ADMIN' | 'CLINIC_ADMIN' | 'STAFF' | 'DOCTOR' | 'PHARMACIST' | 'LAB_TECHNICIAN'

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super admin',
  CLINIC_ADMIN: 'Clinic admin',
  STAFF: 'Front desk',
  DOCTOR: 'Doctor',
  PHARMACIST: 'Pharmacist',
  LAB_TECHNICIAN: 'Lab technician',
}

export interface ClinicSummary {
  id: string
  name: string
  slug: string
}

export interface User {
  id: string
  email: string
  first_name: string
  last_name: string
  phone: string
  role: Role
  clinic: ClinicSummary | null
  /** Set for doctors: the id used by doctors/<id>/schedules/. */
  doctor_profile_id: string | null
}

/** Every list endpoint answers with pages of 20. */
export interface Paginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

/** "This period vs the previous one" on the dashboard. Money values are decimal text. */
export interface Comparison<T extends number | string = number> {
  value: T
  previous: T
  change_percent: number | null
}

export type SummaryRange = 'today' | 'week' | 'month'

export interface DashboardSummary {
  range: SummaryRange
  start: string
  end: string
  total_patients: number | null
  total_doctors: number
  new_patients: Comparison | null
  appointments: Comparison | null
  earnings: Comparison<string> | null
  vat_collected: Comparison<string> | null
  appointments_by_status: { status: string; count: number }[] | null
  appointments_by_department: { department: string; count: number }[] | null
  recent_doctors: {
    id: string
    name: string
    department: string | null
    specialization: string
    is_active: boolean
  }[]
  new_patients_list:
    | {
        id: string
        name: string
        age: number | null
        gender: string
        address: string
        created_at: string
      }[]
    | null
  stock: {
    low_stock_medicines: number
    expiring_soon_batches: number
    expired_batches: number
  } | null
  pending_lab_orders: number | null
  /** Patients registered at the lab waiting for the front desk to check (admin/staff). */
  patients_to_check: number | null
  unpaid_invoices: number | null
}

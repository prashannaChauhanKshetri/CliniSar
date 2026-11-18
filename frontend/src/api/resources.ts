/**
 * Typed calls for every area of the API. Field names match the API exactly
 * (snake_case), so what you read here is what the server sends.
 */
import { api } from './client'
import type { Paginated } from './types'

export type Params = Record<string, string | number | boolean | undefined | null>

/** Drop empty filters so the URL stays clean (?status= is not sent). */
function clean(params: Params = {}): Params {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null && value !== '',
    ),
  )
}

async function list<T>(path: string, params?: Params): Promise<Paginated<T>> {
  return (await api.get<Paginated<T>>(path, { params: clean(params) })).data
}
async function get<T>(path: string): Promise<T> {
  return (await api.get<T>(path)).data
}
async function post<T>(path: string, body?: unknown): Promise<T> {
  return (await api.post<T>(path, body)).data
}
async function patch<T>(path: string, body: unknown): Promise<T> {
  return (await api.patch<T>(path, body)).data
}
async function remove(path: string): Promise<void> {
  await api.delete(path)
}

/** CRUD helpers for a standard endpoint such as "patients/". */
function resource<T, Input = Partial<T>>(path: string) {
  return {
    list: (params?: Params) => list<T>(path, params),
    get: (id: string) => get<T>(`${path}${id}/`),
    create: (body: Input) => post<T>(path, body),
    update: (id: string, body: Partial<Input>) => patch<T>(`${path}${id}/`, body),
    remove: (id: string) => remove(`${path}${id}/`),
  }
}

// ---------- clinic, people ----------

export interface Clinic {
  id: string
  name: string
  name_nepali: string
  slug: string
  phone: string
  address: string
  address_nepali: string
  pan_number: string
  prescription_note: string
  receipt_width_mm: 80 | 58
  vat_rate: string
  vat_on_consultation: boolean
  vat_on_pharmacy: boolean
  vat_on_lab: boolean
  lab_bills_separately: boolean
  lab_name: string
  lab_pan_number: string
}
export const clinicApi = {
  get: () => get<Clinic>('/clinic/'),
  update: (body: Partial<Clinic>) => patch<Clinic>('/clinic/', body),
}

export interface Department {
  id: string
  name: string
}
export const departmentsApi = resource<Department>('/departments/')

export type StaffRole = 'STAFF' | 'PHARMACIST' | 'LAB_TECHNICIAN'
export interface StaffMember {
  id: string
  email: string
  first_name: string
  last_name: string
  phone: string
  role: StaffRole
  is_active: boolean
}
export const staffApi = resource<StaffMember, Partial<StaffMember> & { password?: string }>(
  '/staff/',
)

export interface Doctor {
  id: string
  email: string
  first_name: string
  last_name: string
  phone: string
  is_active: boolean
  department: string | null
  department_name: string | null
  specialization: string
  name_nepali: string
  qualifications: string
  designation: string
  license_number: string
  consultation_fee: string
  bio: string
}
export const doctorsApi = resource<Doctor, Partial<Doctor> & { password?: string }>('/doctors/')

export type Gender = 'MALE' | 'FEMALE' | 'OTHER'
export interface Patient {
  id: string
  first_name: string
  last_name: string
  full_name: string
  phone: string
  date_of_birth: string | null
  date_of_birth_is_estimated: boolean
  age: number | null
  gender: Gender | ''
  blood_group: string
  address: string
  emergency_contact: string
  created_at: string
}
export type PatientInput = Partial<Omit<Patient, 'id' | 'full_name' | 'age' | 'created_at'>> & {
  age_years?: number
}
export const patientsApi = resource<Patient, PatientInput>('/patients/')

export const profileApi = {
  update: (body: { first_name?: string; last_name?: string; phone?: string }) =>
    patch('/auth/me/', body),
  changePassword: (body: { current_password: string; new_password: string }) =>
    post('/auth/change-password/', body),
}

// ---------- scheduling ----------

export interface Schedule {
  id: string
  weekday: number
  weekday_name: string
  start_time: string
  end_time: string
  slot_minutes: number
}
export const schedulesApi = {
  list: (doctorId: string) => get<Schedule[]>(`/doctors/${doctorId}/schedules/`),
  create: (doctorId: string, body: Omit<Schedule, 'id' | 'weekday_name'>) =>
    post<Schedule>(`/doctors/${doctorId}/schedules/`, body),
  update: (doctorId: string, id: string, body: Partial<Schedule>) =>
    patch<Schedule>(`/doctors/${doctorId}/schedules/${id}/`, body),
  remove: (doctorId: string, id: string) => remove(`/doctors/${doctorId}/schedules/${id}/`),
  slots: (doctorId: string, date: string) =>
    get<{ start_time: string; end_time: string }[]>(`/doctors/${doctorId}/slots/?date=${date}`),
}

export type AppointmentStatus = 'BOOKED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'
export interface Appointment {
  id: string
  visit_type: 'SCHEDULED' | 'WALK_IN'
  patient: string
  patient_name: string
  doctor: string
  doctor_name: string
  department_name: string | null
  date: string
  start_time: string | null
  end_time: string | null
  queue_number: number | null
  status: AppointmentStatus
  reason: string
  cancel_reason: string
  created_at: string
}
export interface AppointmentInput {
  visit_type: 'SCHEDULED' | 'WALK_IN'
  patient: string
  doctor: string
  date?: string
  start_time?: string
  reason?: string
}
export const appointmentsApi = {
  list: (params?: Params) => list<Appointment>('/appointments/', params),
  get: (id: string) => get<Appointment>(`/appointments/${id}/`),
  create: (body: AppointmentInput) => post<Appointment>('/appointments/', body),
  cancel: (id: string, reason: string) =>
    post<Appointment>(`/appointments/${id}/cancel/`, { reason }),
  complete: (id: string) => post<Appointment>(`/appointments/${id}/complete/`),
}

// ---------- billing ----------

export type InvoiceSource = 'CONSULTATION' | 'PHARMACY' | 'LAB'
export type PaymentMethod = 'CASH' | 'CARD' | 'WALLET'
export interface Invoice {
  id: string
  series: 'CLINIC' | 'LAB'
  number: number
  issuer_name: string
  issuer_pan: string
  source: InvoiceSource
  status: 'UNPAID' | 'PAID' | 'CANCELLED'
  patient: string
  patient_name: string
  patient_address: string
  patient_phone: string
  appointment: string | null
  prescription: string | null
  lab_order: string | null
  items: {
    id: string
    description: string
    quantity: number
    unit_price: string
    line_total: string
  }[]
  subtotal: string
  discount: string
  vat_rate: string
  vat_amount: string
  total: string
  payment_method: PaymentMethod | null
  paid_at: string | null
  received_by_name: string | null
  cancel_reason: string
  created_at: string
}
export const invoicesApi = {
  list: (params?: Params) => list<Invoice>('/invoices/', params),
  get: (id: string) => get<Invoice>(`/invoices/${id}/`),
  pay: (id: string, body: { payment_method: PaymentMethod; discount?: string }) =>
    post<Invoice>(`/invoices/${id}/pay/`, body),
  cancel: (id: string, reason: string) => post<Invoice>(`/invoices/${id}/cancel/`, { reason }),
}

// ---------- prescriptions and pharmacy ----------

export interface PrescriptionItem {
  id: string
  medicine: string
  medicine_name: string
  medicine_form: string
  dosage: string
  frequency: string
  duration_days: number
  quantity: number
  instructions: string
}
export interface Prescription {
  id: string
  appointment: string
  visit_date: string
  patient: string
  patient_name: string
  patient_age: number | null
  patient_gender: string
  patient_address: string
  doctor: string
  doctor_name: string
  diagnosis: string
  notes: string
  status: 'PENDING' | 'DISPENSED'
  items: PrescriptionItem[]
  dispensed_by_name: string | null
  dispensed_at: string | null
  created_at: string
}
export interface PrescriptionInput {
  appointment: string
  diagnosis: string
  notes?: string
  items: Omit<PrescriptionItem, 'id' | 'medicine_name' | 'medicine_form'>[]
}
export const prescriptionsApi = {
  list: (params?: Params) => list<Prescription>('/prescriptions/', params),
  get: (id: string) => get<Prescription>(`/prescriptions/${id}/`),
  create: (body: PrescriptionInput) => post<Prescription>('/prescriptions/', body),
  dispense: (id: string) => post<Prescription>(`/prescriptions/${id}/dispense/`),
}

export interface Medicine {
  id: string
  name: string
  generic_name: string
  strength: string
  form: string
  unit_price: string
  reorder_level: number
  available_stock: number
  is_low_stock: boolean
}
export type ExpiryStatus = 'OK' | 'EXPIRING_SOON' | 'EXPIRED'
export interface Batch {
  id: string
  medicine: string
  medicine_name: string
  batch_number: string
  expiry_date: string
  expiry_status: ExpiryStatus
  quantity: number
  created_at: string
}
export interface StockMovement {
  id: string
  batch_number: string
  change: number
  reason: 'PURCHASE' | 'DISPENSE' | 'ADJUSTMENT'
  note: string
  created_by_name: string
  created_at: string
}
export const medicinesApi = {
  ...resource<Medicine>('/medicines/'),
  batches: (id: string, params?: Params) => list<Batch>(`/medicines/${id}/batches/`, params),
  purchase: (id: string, body: { batch_number: string; expiry_date: string; quantity: number }) =>
    post<Batch>(`/medicines/${id}/batches/`, body),
  movements: (id: string, params?: Params) =>
    list<StockMovement>(`/medicines/${id}/stock-movements/`, params),
}
export const batchesApi = {
  list: (params?: Params) => list<Batch>('/batches/', params),
  adjust: (id: string, body: { change: number; note: string }) =>
    post<Batch>(`/batches/${id}/adjust/`, body),
}

// ---------- lab ----------

export interface LabParameter {
  id?: string
  name: string
  unit: string
  reference_range: string
  section: string
  position?: number
}
export interface LabTest {
  id: string
  name: string
  price: string
  category: string
  method: string
  specimen: string
  interpretation: string
  is_active: boolean
  parameters: LabParameter[]
}
export const labTestsApi = resource<LabTest>('/lab-tests/')

export interface LabResult {
  id: string
  name: string
  unit: string
  reference_range: string
  section: string
  value: string
  flag: 'NORMAL' | 'ABNORMAL'
}
export interface LabOrderItem {
  id: string
  lab_test: string
  lab_test_name: string
  category: string
  method: string
  specimen: string
  interpretation: string
  parameters: Required<LabParameter>[]
  results: LabResult[]
}
export type LabStatus = 'ORDERED' | 'SAMPLE_COLLECTED' | 'COMPLETED' | 'CANCELLED'
export interface LabOrder {
  id: string
  lab_number: number
  status: LabStatus
  patient: string
  patient_name: string
  patient_age: number | null
  patient_gender: string
  patient_address: string
  patient_phone: string
  appointment: string | null
  consultant: string
  items: LabOrderItem[]
  ordered_by_name: string
  collected_at: string | null
  completed_at: string | null
  completed_by_name: string | null
  file: string | null
  cancel_reason: string
  created_at: string
}
export interface ResultInput {
  parameter: string
  value: string
  flag: 'NORMAL' | 'ABNORMAL'
}
export const labOrdersApi = {
  list: (params?: Params) => list<LabOrder>('/lab-orders/', params),
  get: (id: string) => get<LabOrder>(`/lab-orders/${id}/`),
  create: (body: { tests: string[]; appointment?: string; patient?: string }) =>
    post<LabOrder>('/lab-orders/', body),
  collect: (id: string) => post<LabOrder>(`/lab-orders/${id}/collect/`),
  cancel: (id: string, reason: string) => post<LabOrder>(`/lab-orders/${id}/cancel/`, { reason }),
  /** JSON, or multipart form data when a file is attached (results then travel as text). */
  complete: (id: string, results: ResultInput[], file?: File | null) => {
    if (!file) return post<LabOrder>(`/lab-orders/${id}/complete/`, { results })
    const form = new FormData()
    form.append('results', JSON.stringify(results))
    form.append('file', file)
    return post<LabOrder>(`/lab-orders/${id}/complete/`, form)
  },
}

// ---------- documents ----------

export interface PatientDocument {
  id: string
  patient: string
  patient_name: string
  title: string
  file: string
  uploaded_by_name: string
  created_at: string
}
export const documentsApi = {
  list: (params?: Params) => list<PatientDocument>('/documents/', params),
  upload: (body: { patient: string; title: string; file: File }) => {
    const form = new FormData()
    form.append('patient', body.patient)
    form.append('title', body.title)
    form.append('file', body.file)
    return post<PatientDocument>('/documents/', form)
  },
  remove: (id: string) => remove(`/documents/${id}/`),
}

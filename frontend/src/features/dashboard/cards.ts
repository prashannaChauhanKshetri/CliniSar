/**
 * Which four numbers each role sees at the top of the dashboard. The server already
 * hides what a role may not see (as null); this only picks a sensible order.
 */
import {
  Banknote,
  CalendarDays,
  FlaskConical,
  Hourglass,
  PackageX,
  Percent,
  Receipt,
  Stethoscope,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { DashboardSummary, Role } from '../../api/types'
import { formatRs } from '../../lib/money'

export interface CardData {
  label: string
  value: string | number
  changePercent?: number | null
  icon: LucideIcon
}

type Builder = (s: DashboardSummary) => CardData | null

const CARDS: Record<string, Builder> = {
  patients: (s) =>
    s.total_patients === null
      ? null
      : {
          label: 'Total patients',
          value: s.total_patients,
          changePercent: s.new_patients?.change_percent ?? null,
          icon: Users,
        },
  doctors: (s) => ({ label: 'Doctors', value: s.total_doctors, icon: Stethoscope }),
  appointments: (s) =>
    s.appointments === null
      ? null
      : {
          label: 'Appointments',
          value: s.appointments.value,
          changePercent: s.appointments.change_percent,
          icon: CalendarDays,
        },
  earnings: (s) =>
    s.earnings === null
      ? null
      : {
          label: 'Earnings (without VAT)',
          value: formatRs(s.earnings.value),
          changePercent: s.earnings.change_percent,
          icon: Banknote,
        },
  vat: (s) =>
    s.vat_collected === null
      ? null
      : {
          label: 'VAT collected',
          value: formatRs(s.vat_collected.value),
          changePercent: s.vat_collected.change_percent,
          icon: Percent,
        },
  labPending: (s) =>
    s.pending_lab_orders === null
      ? null
      : { label: 'Lab orders waiting', value: s.pending_lab_orders, icon: FlaskConical },
  unpaid: (s) =>
    s.unpaid_invoices === null
      ? null
      : { label: 'Unpaid bills', value: s.unpaid_invoices, icon: Receipt },
  lowStock: (s) =>
    s.stock === null
      ? null
      : { label: 'Low-stock medicines', value: s.stock.low_stock_medicines, icon: PackageX },
  expiry: (s) =>
    s.stock === null
      ? null
      : {
          label: 'Expiring or expired batches',
          value: s.stock.expiring_soon_batches + s.stock.expired_batches,
          icon: Hourglass,
        },
}

const ORDER: Record<Role, string[]> = {
  SUPER_ADMIN: [],
  CLINIC_ADMIN: ['patients', 'doctors', 'appointments', 'earnings'],
  STAFF: ['patients', 'doctors', 'appointments', 'earnings'],
  DOCTOR: ['patients', 'appointments', 'labPending', 'doctors'],
  PHARMACIST: ['earnings', 'vat', 'lowStock', 'expiry'],
  LAB_TECHNICIAN: ['earnings', 'vat', 'labPending', 'unpaid'],
}

export function cardsFor(summary: DashboardSummary, role: Role): CardData[] {
  return ORDER[role]
    .map((key) => CARDS[key](summary))
    .filter((card): card is CardData => card !== null)
}

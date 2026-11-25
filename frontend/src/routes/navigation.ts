/**
 * Which screens exist and which roles may use them. The sidebar AND the route guards
 * both read this list, so a menu item and its page can never disagree about access.
 * (The API checks permissions again on every request; this only shapes the screens.)
 */
import {
  Banknote,
  Building2,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  FileText,
  FlaskConical,
  Hourglass,
  LayoutDashboard,
  Pill,
  Settings,
  Stethoscope,
  TestTubes,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '../api/types'

export const CLINIC_ROLES: Role[] = ['CLINIC_ADMIN', 'STAFF', 'DOCTOR', 'LAB_TECHNICIAN']

export interface NavItem {
  label: string
  path: string
  icon: LucideIcon
  roles: Role[]
  /** One sentence shown at the top of the page. */
  description: string
}

export interface NavSection {
  title: string | null
  items: NavItem[]
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: null,
    items: [
      {
        label: 'Dashboard',
        path: '/dashboard',
        icon: LayoutDashboard,
        roles: CLINIC_ROLES,
        description: 'Today at a glance.',
      },
      {
        label: 'Appointments',
        path: '/appointments',
        icon: CalendarDays,
        roles: ['CLINIC_ADMIN', 'STAFF', 'DOCTOR'],
        description: 'Booked visits and today’s walk-in queue.',
      },
      {
        label: 'My schedule',
        path: '/schedule',
        icon: CalendarClock,
        roles: ['DOCTOR'],
        description: 'Your weekly working hours, which decide the bookable slots.',
      },
      {
        label: 'Patients',
        path: '/patients',
        icon: Users,
        roles: ['CLINIC_ADMIN', 'STAFF', 'DOCTOR'],
        description: 'Patient records, visits, prescriptions and reports.',
      },
      {
        label: 'Prescriptions',
        path: '/prescriptions',
        icon: ClipboardList,
        roles: ['CLINIC_ADMIN', 'STAFF', 'DOCTOR'],
        description: 'Prescriptions written by doctors, waiting or dispensed.',
      },
      {
        label: 'Documents',
        path: '/documents',
        icon: FileText,
        roles: ['CLINIC_ADMIN', 'STAFF', 'DOCTOR'],
        description: 'Scans and old reports kept for patients.',
      },
    ],
  },
  {
    title: 'Pharmacy',
    items: [
      {
        label: 'Medicines',
        path: '/medicines',
        icon: Pill,
        roles: ['CLINIC_ADMIN', 'STAFF'],
        description: 'Medicines, stock by batch and stock history.',
      },
      {
        label: 'Expiry',
        path: '/expiry',
        icon: Hourglass,
        roles: ['CLINIC_ADMIN', 'STAFF'],
        description: 'Batches that expire soon or have expired.',
      },
    ],
  },
  {
    title: 'Laboratory',
    items: [
      {
        label: 'Lab orders',
        path: '/lab-orders',
        icon: TestTubes,
        roles: ['CLINIC_ADMIN', 'STAFF', 'DOCTOR', 'LAB_TECHNICIAN'],
        description: 'Ordered tests, samples and results.',
      },
      {
        label: 'Lab tests',
        path: '/lab-tests',
        icon: FlaskConical,
        roles: ['CLINIC_ADMIN', 'LAB_TECHNICIAN'],
        description: 'The tests the lab offers, with their report rows.',
      },
    ],
  },
  {
    title: 'Billing',
    items: [
      {
        label: 'Invoices',
        path: '/invoices',
        icon: Banknote,
        roles: ['CLINIC_ADMIN', 'STAFF', 'LAB_TECHNICIAN'],
        description: 'Bills for visits, medicines and lab tests.',
      },
    ],
  },
  {
    title: 'Administration',
    items: [
      {
        label: 'Doctors',
        path: '/doctors',
        icon: Stethoscope,
        roles: ['CLINIC_ADMIN', 'STAFF'],
        description: 'Doctors, their departments and consultation fees.',
      },
      {
        label: 'Staff',
        path: '/staff',
        icon: UserRound,
        roles: ['CLINIC_ADMIN'],
        description: 'Front desk, pharmacy and lab logins.',
      },
      {
        label: 'Departments',
        path: '/departments',
        icon: Building2,
        roles: ['CLINIC_ADMIN'],
        description: 'The clinic’s medical departments.',
      },
    ],
  },
]

/** Screens that are not in the sidebar menu. */
export const OTHER_SCREENS: NavItem[] = [
  {
    label: 'Settings',
    path: '/settings',
    icon: Settings,
    roles: ['CLINIC_ADMIN'],
    description: 'Clinic details, printing and VAT.',
  },
  {
    label: 'My profile',
    path: '/profile',
    icon: UserRound,
    roles: CLINIC_ROLES,
    description: 'Your name, phone and password.',
  },
  // Print pages: same roles as the record they print.
  {
    label: 'Print bill',
    path: '/print/invoice',
    icon: Banknote,
    roles: ['CLINIC_ADMIN', 'STAFF', 'LAB_TECHNICIAN'],
    description: 'A4 bill.',
  },
  {
    label: 'Print receipt',
    path: '/print/receipt',
    icon: Banknote,
    roles: ['CLINIC_ADMIN', 'STAFF', 'LAB_TECHNICIAN'],
    description: 'Thermal receipt.',
  },
  {
    label: 'Print prescription',
    path: '/print/prescription',
    icon: ClipboardList,
    roles: ['CLINIC_ADMIN', 'STAFF', 'DOCTOR'],
    description: 'A4 prescription.',
  },
  {
    label: 'Print lab report',
    path: '/print/lab-order',
    icon: TestTubes,
    roles: ['CLINIC_ADMIN', 'STAFF', 'DOCTOR', 'LAB_TECHNICIAN'],
    description: 'A4 lab report.',
  },
  {
    label: 'New appointment',
    path: '/appointments/new',
    icon: CalendarDays,
    roles: ['CLINIC_ADMIN', 'STAFF'],
    description: 'Book a time slot or add a walk-in to today’s queue.',
  },
]

const ALL_SCREENS = [...NAV_SECTIONS.flatMap((section) => section.items), ...OTHER_SCREENS]

/** The sidebar for one role: only sections and items that role may open. */
export function navFor(role: Role): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.roles.includes(role)),
  })).filter((section) => section.items.length > 0)
}

/** The screen a path belongs to: "/patients/123" belongs to "/patients". */
export function screenFor(path: string): NavItem | undefined {
  const exact = ALL_SCREENS.find((screen) => screen.path === path)
  if (exact) return exact
  return ALL_SCREENS.filter((screen) => path.startsWith(`${screen.path}/`)).sort(
    (a, b) => b.path.length - a.path.length,
  )[0]
}

export function canOpen(role: Role, path: string): boolean {
  return screenFor(path)?.roles.includes(role) ?? false
}

/**
 * All the addresses of the app. Every signed-in page sits inside AppLayout (sidebar
 * and top bar) and behind RequireRole (the same role list as the sidebar).
 *
 * Pages are loaded on first visit (React.lazy), so the first download stays small and
 * a pharmacist never downloads the code of, say, the doctors' screens.
 */
import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react'
import { Navigate, type RouteObject } from 'react-router'
import { AppLayout } from '../components/layout/AppLayout'
import { PageLoader } from '../components/PageLoader'
import { LoginPage } from '../pages/LoginPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { PlaceholderPage } from '../pages/PlaceholderPage'
import { RequireAuth } from './RequireAuth'
import { RequireRole } from './RequireRole'

/** lazy() for files that export a named component. */
function page<K extends string>(
  load: () => Promise<Record<K, ComponentType>>,
  name: K,
): LazyExoticComponent<ComponentType> {
  return lazy(async () => ({ default: (await load())[name] }))
}

const SCREENS: Record<string, LazyExoticComponent<ComponentType> | null> = {
  '/dashboard': null,
  '/doctors': page(() => import('../features/admin/DoctorsPage'), 'DoctorsPage'),
  '/staff': page(() => import('../features/admin/StaffPage'), 'StaffPage'),
  '/departments': page(() => import('../features/admin/DepartmentsPage'), 'DepartmentsPage'),
  '/settings': page(() => import('../features/admin/SettingsPage'), 'SettingsPage'),
  '/profile': page(() => import('../features/admin/ProfilePage'), 'ProfilePage'),
  '/patients': page(() => import('../features/patients/PatientsPage'), 'PatientsPage'),
  '/patients/:id': page(
    () => import('../features/patients/PatientDetailPage'),
    'PatientDetailPage',
  ),
  '/schedule': page(() => import('../features/scheduling/SchedulePage'), 'SchedulePage'),
  '/appointments': page(
    () => import('../features/appointments/AppointmentsPage'),
    'AppointmentsPage',
  ),
  '/appointments/new': page(
    () => import('../features/appointments/NewAppointmentPage'),
    'NewAppointmentPage',
  ),
  '/prescriptions': page(
    () => import('../features/prescriptions/PrescriptionsPage'),
    'PrescriptionsPage',
  ),
  '/prescriptions/:id': page(
    () => import('../features/prescriptions/PrescriptionDetailPage'),
    'PrescriptionDetailPage',
  ),
  '/medicines': page(() => import('../features/pharmacy/MedicinesPage'), 'MedicinesPage'),
  '/medicines/:id': page(
    () => import('../features/pharmacy/MedicineDetailPage'),
    'MedicineDetailPage',
  ),
  '/expiry': page(() => import('../features/pharmacy/ExpiryPage'), 'ExpiryPage'),
  '/lab-tests': page(() => import('../features/lab/LabTestsPage'), 'LabTestsPage'),
  '/lab-orders': page(() => import('../features/lab/LabOrdersPage'), 'LabOrdersPage'),
  '/lab-orders/:id': page(() => import('../features/lab/LabOrderDetailPage'), 'LabOrderDetailPage'),
  '/invoices': page(() => import('../features/billing/InvoicesPage'), 'InvoicesPage'),
  '/invoices/:id': page(() => import('../features/billing/InvoiceDetailPage'), 'InvoiceDetailPage'),
  '/documents': page(() => import('../features/documents/DocumentsPage'), 'DocumentsPage'),
}

function screenRoute(path: string, Page: LazyExoticComponent<ComponentType> | null): RouteObject {
  return {
    path,
    element: (
      <RequireRole>
        <Suspense fallback={<PageLoader />}>{Page ? <Page /> : <PlaceholderPage />}</Suspense>
      </RequireRole>
    ),
  }
}

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          ...Object.entries(SCREENS).map(([path, Page]) => screenRoute(path, Page)),
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]

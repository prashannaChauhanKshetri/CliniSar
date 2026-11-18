/**
 * All the addresses of the app. Every signed-in page sits inside AppLayout (sidebar
 * and top bar) and behind RequireRole (the same role list as the sidebar).
 */
import { Navigate, type RouteObject } from 'react-router'
import { AppLayout } from '../components/layout/AppLayout'
import { LoginPage } from '../pages/LoginPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { PlaceholderPage } from '../pages/PlaceholderPage'
import { RequireAuth } from './RequireAuth'
import { RequireRole } from './RequireRole'

/** The screens from the brief. Each becomes a real page in phase 10. */
const SCREEN_PATHS = [
  '/dashboard',
  '/doctors',
  '/staff',
  '/patients',
  '/patients/:id',
  '/departments',
  '/settings',
  '/appointments',
  '/appointments/new',
  '/schedule',
  '/prescriptions',
  '/prescriptions/:id',
  '/medicines',
  '/medicines/:id',
  '/expiry',
  '/lab-tests',
  '/lab-orders',
  '/lab-orders/:id',
  '/invoices',
  '/invoices/:id',
  '/documents',
  '/profile',
]

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          ...SCREEN_PATHS.map((path) => ({
            path,
            element: (
              <RequireRole>
                <PlaceholderPage />
              </RequireRole>
            ),
          })),
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]

import type { ReactNode } from 'react'
import { useLocation } from 'react-router'
import { useAuth } from '../features/auth/useAuth'
import { ForbiddenPage } from '../pages/ForbiddenPage'
import { canOpen } from './navigation'

/**
 * Shows the page only if the user's role may open it (same list as the sidebar).
 * Typing a URL by hand gives a clear "not for your role" page instead of a broken one.
 */
export function RequireRole({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { pathname } = useLocation()
  if (!user || !canOpen(user.role, pathname)) return <ForbiddenPage />
  return <>{children}</>
}

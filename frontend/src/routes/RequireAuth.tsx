import { Navigate, Outlet, useLocation } from 'react-router'
import { FullPageLoader } from '../components/FullPageLoader'
import { useAuth } from '../features/auth/useAuth'

/** Signed-in pages only. Others go to /login, which sends them back here afterwards. */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'checking') return <FullPageLoader />
  if (status === 'signed-out') return <Navigate to="/login" replace state={{ from: location }} />
  return <Outlet />
}

import { useContext } from 'react'
import { AuthContext, type AuthValue } from './AuthContext'

/** The logged-in user and the sign-in/sign-out actions. */
export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.')
  return value
}

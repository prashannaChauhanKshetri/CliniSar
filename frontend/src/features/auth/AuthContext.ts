/** What the rest of the app can read about the logged-in user. */
import { createContext } from 'react'
import type { User } from '../../api/types'

export type AuthStatus = 'checking' | 'signed-in' | 'signed-out'

export interface AuthValue {
  status: AuthStatus
  user: User | null
  /** Why the user is signed out, shown on the login page (e.g. session ended). */
  notice: string | null
  signIn: (email: string, password: string) => Promise<User>
  signOut: () => Promise<void>
  /** Read the user again after they changed their own details. */
  reloadUser: () => Promise<void>
}

export const AuthContext = createContext<AuthValue | null>(null)

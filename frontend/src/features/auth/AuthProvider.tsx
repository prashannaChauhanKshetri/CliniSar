/**
 * Keeps track of who is logged in.
 *
 * On page load the access token is gone (it lived only in memory), so we ask the server
 * for a new one using the refresh cookie. If that works the user stays signed in after
 * a page reload; if not, they see the login page.
 */
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as authApi from '../../api/auth'
import { refreshAccessToken, setSessionExpiredHandler } from '../../api/client'
import type { User } from '../../api/types'
import { AuthContext, type AuthStatus, type AuthValue } from './AuthContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<AuthStatus>('checking')
  const [user, setUser] = useState<User | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const endSession = useCallback(
    (message: string | null) => {
      queryClient.clear() // never show one user's cached data to the next user
      setUser(null)
      setStatus('signed-out')
      setNotice(message)
    },
    [queryClient],
  )

  // Restore the session once, when the app starts.
  useEffect(() => {
    let active = true
    refreshAccessToken()
      .then(() => authApi.fetchMe())
      .then((me) => {
        if (!active) return
        setUser(me)
        setStatus('signed-in')
      })
      .catch(() => active && endSession(null))
    return () => {
      active = false
    }
  }, [endSession])

  // If a refresh fails later (e.g. after 7 days), send the user back to the login page.
  useEffect(() => {
    setSessionExpiredHandler(() => endSession('Your session has ended. Please sign in again.'))
    return () => setSessionExpiredHandler(null)
  }, [endSession])

  const signIn = useCallback(async (email: string, password: string) => {
    const signedInUser = await authApi.login(email, password)
    setUser(signedInUser)
    setNotice(null)
    setStatus('signed-in')
    return signedInUser
  }, [])

  const signOut = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      endSession('You have signed out.')
    }
  }, [endSession])

  const value = useMemo<AuthValue>(
    () => ({ status, user, notice, signIn, signOut }),
    [status, user, notice, signIn, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

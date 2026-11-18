/** Calls to the /auth/ endpoints. */
import { api, authClient, setAccessToken } from './client'
import type { User } from './types'

export async function login(email: string, password: string): Promise<User> {
  const response = await authClient.post<{ access: string; user: User }>('/auth/login/', {
    email,
    password,
  })
  setAccessToken(response.data.access)
  return response.data.user
}

export async function fetchMe(): Promise<User> {
  return (await api.get<User>('/auth/me/')).data
}

/** Ends the session on the server (blacklists the refresh token, clears the cookie). */
export async function logout(): Promise<void> {
  try {
    await authClient.post('/auth/logout/')
  } finally {
    setAccessToken(null)
  }
}

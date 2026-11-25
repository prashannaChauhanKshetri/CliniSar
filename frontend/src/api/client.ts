/**
 * The one HTTP client every screen uses to talk to the API.
 *
 * Session design (see docs/FRONTEND.md):
 * - The ACCESS token (15 minutes) lives only in this module's memory, never in
 *   localStorage, so a malicious script injected into the page cannot steal it from
 *   storage, and it disappears when the tab closes.
 * - The REFRESH token (7 days) is an httpOnly cookie that JavaScript cannot read. The
 *   browser sends it automatically, and only to /api/v1/auth/.
 * - On a 401 the client asks for a new access token ONCE and repeats the request.
 */
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

/**
 * Where the API lives. In production the app (app.clinic...) and the API (api.clinic...)
 * are on different addresses, so the build sets VITE_API_URL. In development it is
 * empty and Vite's proxy forwards /api to Django on the same address.
 * Both addresses must be on the same site (one domain), or the browser will not send
 * the SameSite=Strict refresh cookie.
 */
export const API_BASE = `${import.meta.env.VITE_API_URL ?? ''}/api/v1`

let accessToken: string | null = null
let onSessionExpired: (() => void) | null = null
let refreshInFlight: Promise<string> | null = null

export function setAccessToken(token: string | null): void {
  accessToken = token
}

export function getAccessToken(): string | null {
  return accessToken
}

/** Called by the AuthProvider so the app can react when the session really ends. */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler
}

/** For the login/refresh/logout calls: no token header, no retry logic. */
export const authClient = axios.create({
  baseURL: API_BASE,
  withCredentials: true, // send and receive the refresh cookie
  timeout: 20_000,
})

/** For everything else. */
export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  timeout: 20_000,
})

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

/**
 * Get a new access token using the refresh cookie.
 *
 * If several requests fail at the same moment they all wait for ONE refresh. This
 * matters: the server rotates refresh tokens, so a second parallel refresh would use
 * an already-used token and log the user out.
 *
 * NP: Dashboard kholda 10 ota request ekai choti 401 aaucha. Sabai le chuttai refresh
 *     garyo bhane pahilo le token use garcha, baki ko "purano token" bhayera logout
 *     huncha. Tesaile `refreshInFlight` ma eutai Promise rakhera sabai lai parkhauna
 *     lagaucha. Yo interview ma sodhna sakcha hai!
 */
export function refreshAccessToken(): Promise<string> {
  refreshInFlight ??= authClient
    .post<{ access: string }>('/auth/refresh/')
    .then((response) => {
      setAccessToken(response.data.access)
      return response.data.access
    })
    .finally(() => {
      refreshInFlight = null
    })
  return refreshInFlight
}

interface RetriableConfig extends InternalAxiosRequestConfig {
  alreadyRetried?: boolean
}

api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const original = error.config as RetriableConfig | undefined
  const expired = error.response?.status === 401
  if (!expired || !original || original.alreadyRetried) throw error

  original.alreadyRetried = true
  try {
    const token = await refreshAccessToken()
    original.headers.Authorization = `Bearer ${token}`
    return api(original)
  } catch {
    // The refresh cookie is gone or expired too: the session is over.
    setAccessToken(null)
    onSessionExpired?.()
    throw error
  }
})

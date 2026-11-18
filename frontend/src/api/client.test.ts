/**
 * The session rules of the HTTP client: Bearer header, one refresh on a 401 then a
 * retry, ONE shared refresh for parallel failures, and a clean sign-out when the
 * refresh itself fails. The network is replaced by fake adapters.
 */
import { AxiosError, AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  api,
  authClient,
  getAccessToken,
  refreshAccessToken,
  setAccessToken,
  setSessionExpiredHandler,
} from './client'

function reply(config: InternalAxiosRequestConfig, status: number, data: unknown = {}) {
  const response = { data, status, statusText: String(status), headers: {}, config }
  if (status >= 400) {
    return Promise.reject(new AxiosError('failed', String(status), config, null, response))
  }
  return Promise.resolve(response)
}

const seenTokens: (string | undefined)[] = []
let refreshCalls = 0

/** The API: 401 for an old token, 200 for "new-token". */
const apiAdapter: AxiosAdapter = (config) => {
  const header = AxiosHeaders.from(config.headers).get('Authorization') as string | undefined
  seenTokens.push(header)
  return reply(config, header === 'Bearer new-token' ? 200 : 401, { ok: true })
}

beforeEach(() => {
  seenTokens.length = 0
  refreshCalls = 0
  setAccessToken('old-token')
  api.defaults.adapter = apiAdapter
  authClient.defaults.adapter = async (config) => {
    refreshCalls += 1
    await new Promise((resolve) => setTimeout(resolve, 10)) // a slow network
    return reply(config, 200, { access: 'new-token' })
  }
})

afterEach(() => {
  setSessionExpiredHandler(null)
  setAccessToken(null)
})

describe('api client', () => {
  it('sends the access token as a Bearer header', async () => {
    setAccessToken('new-token')
    await api.get('/patients/')
    expect(seenTokens).toEqual(['Bearer new-token'])
  })

  it('refreshes once after a 401 and repeats the request with the new token', async () => {
    const response = await api.get('/patients/')
    expect(response.data).toEqual({ ok: true })
    expect(seenTokens).toEqual(['Bearer old-token', 'Bearer new-token'])
    expect(refreshCalls).toBe(1)
    expect(getAccessToken()).toBe('new-token')
  })

  it('shares ONE refresh between requests that fail at the same moment', async () => {
    await Promise.all([api.get('/a/'), api.get('/b/'), api.get('/c/')])
    expect(refreshCalls).toBe(1) // the server rotates refresh tokens; a second call would fail
  })

  it('ends the session when the refresh fails', async () => {
    authClient.defaults.adapter = (config) => reply(config, 401)
    const expired = vi.fn()
    setSessionExpiredHandler(expired)

    await expect(api.get('/patients/')).rejects.toThrow()

    expect(expired).toHaveBeenCalledOnce()
    expect(getAccessToken()).toBeNull()
  })

  it('does not loop: a second 401 after the refresh is passed on', async () => {
    api.defaults.adapter = (config) => reply(config, 401) // even the new token is refused
    await expect(api.get('/patients/')).rejects.toThrow()
    expect(refreshCalls).toBe(1)
  })

  it('stores the token from refreshAccessToken', async () => {
    setAccessToken(null)
    await expect(refreshAccessToken()).resolves.toBe('new-token')
    expect(getAccessToken()).toBe('new-token')
  })
})

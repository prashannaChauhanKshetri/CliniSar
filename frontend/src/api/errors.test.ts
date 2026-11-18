import { AxiosError, AxiosHeaders } from 'axios'
import { describe, expect, it } from 'vitest'
import { getErrorMessage, getFieldErrors } from './errors'

function httpError(status: number, data: unknown, headers: Record<string, string> = {}) {
  const config = { headers: new AxiosHeaders() }
  return new AxiosError('failed', String(status), config, null, {
    data,
    status,
    statusText: '',
    headers,
    config,
  })
}

describe('getErrorMessage', () => {
  it('uses the server detail message', () => {
    expect(getErrorMessage(httpError(409, { detail: 'Not enough Cough Syrup.' }))).toBe(
      'Not enough Cough Syrup.',
    )
  })

  it('uses the first field message of a 400', () => {
    expect(
      getErrorMessage(httpError(400, { start_time: ['The doctor has no slot at this time.'] })),
    ).toBe('The doctor has no slot at this time.')
  })

  it('explains rate limits, missing access and lost connections in plain words', () => {
    expect(getErrorMessage(httpError(429, {}))).toMatch(/wait a minute/)
    expect(getErrorMessage(httpError(403, {}))).toMatch(/role/)
    expect(getErrorMessage(new AxiosError('Network Error'))).toMatch(/Cannot reach/)
  })

  it('gives the request id when the server says nothing useful', () => {
    expect(getErrorMessage(httpError(500, '', { 'x-request-id': 'abcdef1234567890' }))).toContain(
      'abcdef12',
    )
  })
})

describe('getFieldErrors', () => {
  it('maps each field to its first message', () => {
    expect(
      getFieldErrors(httpError(400, { email: ['Already in use.'], phone: 'Too long.' })),
    ).toEqual({
      email: 'Already in use.',
      phone: 'Too long.',
    })
    expect(getFieldErrors(httpError(409, { detail: 'x' }))).toEqual({})
  })
})

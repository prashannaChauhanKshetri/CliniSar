/** Turn any failed request into a short sentence a clinic worker can act on. */
import { isAxiosError } from 'axios'

type ApiErrorBody = { detail?: unknown } & Record<string, unknown>

function firstMessage(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return firstMessage(value[0])
  if (value && typeof value === 'object') return firstMessage(Object.values(value)[0])
  return null
}

/** The message to show for a failed request. */
export function getErrorMessage(error: unknown): string {
  if (!isAxiosError(error)) return 'Something went wrong. Please try again.'
  if (!error.response) {
    return 'Cannot reach the CliniSar server. Check the internet connection and try again.'
  }
  const { status, headers } = error.response
  const body = (error.response.data ?? {}) as ApiErrorBody
  if (status === 429) return 'Too many attempts. Please wait a minute and try again.'
  if (status === 403) return 'Your role does not allow this action.'
  if (status === 404) return 'This record was not found. It may have been removed.'

  const message = firstMessage(body.detail) ?? firstMessage(body)
  if (message) return message
  const requestId = headers?.['x-request-id']
  return requestId
    ? `The server could not complete the request (reference ${String(requestId).slice(0, 8)}).`
    : 'The server could not complete the request.'
}

/** Field-by-field messages from a 400 answer, e.g. { email: "Already in use." }. */
export function getFieldErrors(error: unknown): Record<string, string> {
  if (!isAxiosError(error) || error.response?.status !== 400) return {}
  const body = error.response.data as ApiErrorBody
  const fields: Record<string, string> = {}
  for (const [field, value] of Object.entries(body ?? {})) {
    const message = firstMessage(value)
    if (message && field !== 'detail' && field !== 'non_field_errors') fields[field] = message
  }
  return fields
}

/** The patient a 409 "already registered" answer points to, or null for any other error. */
export function getDuplicatePatient(error: unknown): { id: string; name: string } | null {
  if (!isAxiosError(error) || error.response?.status !== 409) return null
  const body = (error.response.data ?? {}) as ApiErrorBody
  const id = body.existing_patient_id
  const name = body.existing_patient_name
  return typeof id === 'string' && typeof name === 'string' ? { id, name } : null
}

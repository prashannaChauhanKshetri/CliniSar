/** Small helpers shared by every form. */
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { getFieldErrors } from '../api/errors'

/**
 * Put the server's field messages (from a 400) next to the matching inputs.
 * Returns true when at least one field message was placed.
 */
export function showServerFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly string[],
): boolean {
  let placed = false
  for (const [field, message] of Object.entries(getFieldErrors(error))) {
    if (fields.includes(field)) {
      setError(field as Path<T>, { type: 'server', message })
      placed = true
    }
  }
  return placed
}

/** "Ram Thapa" style names for users and doctors. */
export function fullName(person: { first_name: string; last_name: string }): string {
  return `${person.first_name} ${person.last_name}`.trim()
}

/** "10:20:00" -> "10:20 AM" for showing slot times. */
export function formatTime(time: string | null): string {
  if (!time) return '—'
  const [hourText, minute] = time.split(':')
  const hour = Number(hourText)
  const suffix = hour >= 12 ? 'PM' : 'AM'
  return `${hour % 12 || 12}:${minute} ${suffix}`
}

/** How people's details are shown. */
import type { Gender } from '../api/resources'

export const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'FEMALE', label: 'Female' },
  { value: 'MALE', label: 'Male' },
  { value: 'OTHER', label: 'Other' },
]

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

/** "30 yrs / F", the way the clinic's register and reports write it. */
export function ageSex(age: number | null, gender: string): string {
  const sex = { MALE: 'M', FEMALE: 'F', OTHER: 'O' }[gender] ?? '—'
  return `${age ?? '—'} yrs / ${sex}`
}

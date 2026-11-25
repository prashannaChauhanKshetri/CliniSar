/**
 * Who does which counter job. The API checks the same rule (prescriptions/dispense/
 * allows CLINIC_ADMIN and STAFF); this only decides which screen a role starts on.
 *
 * EN: Since phase 12 the front desk and the pharmacy are one role, and the admin can do
 *     every job too. Only a doctor writes prescriptions.
 * NP: Dispense garne: front desk/pharmacy ra admin. Prescription lekhne chai doctor
 *     matra, kina bhane tyo license ko kaam ho.
 */
import type { Role } from '../api/types'

export function canDispense(role: Role | undefined): boolean {
  return role === 'STAFF' || role === 'CLINIC_ADMIN'
}

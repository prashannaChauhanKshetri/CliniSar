/**
 * Who does which counter job. The API checks the same rule (prescriptions/dispense/
 * allows PHARMACIST and STAFF); this only decides which screen a role starts on.
 */
import type { Role } from '../api/types'

/** The pharmacist, or the front desk in a small clinic where one person does both. */
export function canDispense(role: Role | undefined): boolean {
  return role === 'PHARMACIST' || role === 'STAFF'
}

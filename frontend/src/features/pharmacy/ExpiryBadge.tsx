import type { ExpiryStatus } from '../../api/resources'
import { StatusBadge } from '../../components/StatusBadge'

/** "Expires soon" (within 90 days) or "Expired"; nothing for batches that are fine. */
export function ExpiryBadge({ status }: { status: ExpiryStatus }) {
  if (status === 'OK') return null
  return <StatusBadge status={status} label={status === 'EXPIRED' ? 'Expired' : 'Expires soon'} />
}

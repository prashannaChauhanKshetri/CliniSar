import { Badge } from '@mantine/core'
import { statusLabel } from '../lib/labels'

/**
 * One badge style per status, everywhere in the app (golden rule 1: consistency).
 * Colours: success = finished/paid, danger = cancelled/expired/inactive,
 * primary = in progress, slate = waiting, grey = did not happen.
 */
const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'success',
  INACTIVE: 'danger',
  BOOKED: 'primary',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  NO_SHOW: 'grey',
  PENDING: 'slate',
  DISPENSED: 'success',
  ORDERED: 'slate',
  SAMPLE_COLLECTED: 'primary',
  UNPAID: 'slate',
  PAID: 'success',
  EXPIRED: 'danger',
  EXPIRING_SOON: 'danger',
  LOW_STOCK: 'danger',
  OK: 'success',
  NORMAL: 'success',
  ABNORMAL: 'danger',
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const color = STATUS_COLORS[status] ?? 'grey'
  return (
    <Badge color={color} variant="light" leftSection={<span aria-hidden="true">●</span>}>
      {label ?? statusLabel(status)}
    </Badge>
  )
}

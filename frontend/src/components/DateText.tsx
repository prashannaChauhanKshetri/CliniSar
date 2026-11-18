import { Stack, Text } from '@mantine/core'
import { formatAD, formatBS } from '../lib/date'

/**
 * A date as people in Nepal read it: BS first, with the AD date in small muted text
 * underneath (used for visits, bills, prescriptions, lab results and expiry dates).
 */
export function DateText({
  iso,
  withAD = true,
}: {
  iso: string | null | undefined
  withAD?: boolean
}) {
  if (!iso)
    return (
      <Text span c="dimmed">
        —
      </Text>
    )
  return (
    <Stack gap={0}>
      <Text span size="sm">
        {formatBS(iso)}
      </Text>
      {withAD && (
        <Text span size="xs" c="dimmed">
          {formatAD(iso)}
        </Text>
      )}
    </Stack>
  )
}

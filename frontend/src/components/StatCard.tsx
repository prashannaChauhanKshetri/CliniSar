import { Card, Group, Stack, Text, ThemeIcon } from '@mantine/core'
import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string | number
  /** % change against the previous period; null when there is nothing to compare. */
  changePercent?: number | null
  /** e.g. "vs previous week" */
  comparedTo?: string
  icon: LucideIcon
}

function ChangeText({ change, comparedTo }: { change: number | null; comparedTo: string }) {
  if (change === null) {
    return (
      <Text size="xs" c="dimmed">
        No earlier figures to compare
      </Text>
    )
  }
  const rising = change >= 0
  return (
    <Text size="xs" c="dimmed">
      <Text span fw={600} c={rising ? 'success.6' : 'danger.6'}>
        {rising ? '+' : ''}
        {change}%
      </Text>{' '}
      {comparedTo}
    </Text>
  )
}

/** One number on the dashboard: label, big value, change, and a blue icon tile. */
export function StatCard({
  label,
  value,
  changePercent,
  comparedTo = '',
  icon: Icon,
}: StatCardProps) {
  return (
    // Phones show two cards per row: less padding, and the icon tile is hidden.
    <Card p={{ base: 'md', sm: 'lg' }}>
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            {label}
          </Text>
          <Text
            // long amounts like "Rs. 4,466.00" stay on one line
            fz={String(value).length > 9 ? { base: 18, sm: 22 } : { base: 24, sm: 28 }}
            fw={700}
            lh={1.1}
            className="tabular-numbers"
            style={{ whiteSpace: 'nowrap' }}
          >
            {value}
          </Text>
          {changePercent !== undefined && (
            <ChangeText change={changePercent} comparedTo={comparedTo} />
          )}
        </Stack>
        <ThemeIcon size={48} radius="md" aria-hidden="true" visibleFrom="sm">
          <Icon size={24} strokeWidth={1.75} />
        </ThemeIcon>
      </Group>
    </Card>
  )
}

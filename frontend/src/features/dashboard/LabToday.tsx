/** Lab technician: today's numbers and the working board. */
import { Button, Group, Stack, Title } from '@mantine/core'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { formatRs } from '../../lib/money'
import { LabBoard } from '../lab/LabBoard'
import { OrderLabTestsModal } from '../lab/OrderLabTestsModal'
import { TodayStrip } from './TodayStrip'
import { useTodaySummary } from './useToday'

export function LabToday() {
  const summary = useTodaySummary().data
  const [ordering, setOrdering] = useState(false)
  return (
    <Stack gap="xl">
      <TodayStrip
        figures={[
          {
            label: 'Orders in progress',
            value: summary?.pending_lab_orders ?? undefined,
            to: '/lab-orders',
          },
          {
            label: 'Earned today',
            value: summary?.earnings ? formatRs(summary.earnings.value) : undefined,
          },
          {
            label: 'Unpaid lab bills',
            value: summary?.unpaid_invoices ?? undefined,
            to: '/invoices?status=UNPAID',
            alert: true,
          },
        ]}
      />
      <Stack gap="sm">
        <Group justify="space-between">
          <Title order={2} fz={18}>
            Work
          </Title>
          <Button size="xs" leftSection={<Plus size={14} />} onClick={() => setOrdering(true)}>
            New lab order
          </Button>
        </Group>
        <LabBoard />
      </Stack>
      {ordering && <OrderLabTestsModal appointment={null} onClose={() => setOrdering(false)} />}
    </Stack>
  )
}

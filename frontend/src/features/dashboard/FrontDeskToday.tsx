/** Front desk and clinic admin: the live queue, what needs action, then the clinic's figures. */
import { Button, Grid, Group, Skeleton, Stack, Title } from '@mantine/core'
import { Plus } from 'lucide-react'
import { Link } from 'react-router'
import { formatRs } from '../../lib/money'
import { QueueBoard } from '../appointments/QueueBoard'
import { useVisitActions } from '../appointments/useVisitActions'
import { AnalyticsSection } from './AnalyticsSection'
import { NeedsAction } from './NeedsAction'
import { TodayStrip } from './TodayStrip'
import { useTodaySummary, useTodayVisits } from './useToday'

export function FrontDeskToday({ isAdmin }: { isAdmin: boolean }) {
  const summary = useTodaySummary().data
  const visits = useTodayVisits()
  const actions = useVisitActions()
  const all = visits.data?.results ?? []
  const waiting = all.filter((v) => v.status === 'BOOKED').length
  const seen = all.filter((v) => v.status === 'COMPLETED').length

  return (
    <Stack gap="xl">
      <TodayStrip
        figures={[
          { label: 'Waiting now', value: visits.data ? waiting : undefined, to: '/appointments' },
          {
            label: 'Seen today',
            value: visits.data ? seen : undefined,
            to: '/appointments?view=list&status=COMPLETED',
          },
          {
            label: 'Earned today',
            value: summary?.earnings ? formatRs(summary.earnings.value) : undefined,
            to: '/invoices?status=PAID',
          },
          {
            label: 'Unpaid bills',
            value: summary?.unpaid_invoices ?? undefined,
            to: '/invoices?status=UNPAID',
            alert: true,
          },
        ]}
      />
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Stack gap="sm">
            <Group justify="space-between">
              <Title order={2} fz={18}>
                Queue now
              </Title>
              <Button
                component={Link}
                to="/appointments/new"
                size="xs"
                leftSection={<Plus size={14} />}
              >
                New appointment
              </Button>
            </Group>
            {visits.data ? (
              <QueueBoard visits={all} actions={actions} isDoctor={false} isToday />
            ) : (
              <Skeleton h={240} radius="lg" />
            )}
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <NeedsAction
            items={[
              {
                count: summary?.unpaid_invoices,
                one: 'bill not paid',
                many: 'bills not paid',
                to: '/invoices?status=UNPAID',
              },
              {
                count: summary?.patients_to_check,
                one: 'patient from the lab to check',
                many: 'patients from the lab to check',
                to: '/patients?needs_review=true',
              },
              {
                count: summary?.pending_lab_orders,
                one: 'lab order in progress',
                many: 'lab orders in progress',
                to: '/lab-orders?view=list',
              },
              ...(isAdmin
                ? [
                    {
                      count: summary?.stock?.low_stock_medicines,
                      one: 'medicine low on stock',
                      many: 'medicines low on stock',
                      to: '/medicines?low_stock=true',
                    },
                    {
                      count: summary?.stock?.expired_batches,
                      one: 'expired batch to write off',
                      many: 'expired batches to write off',
                      to: '/expiry?view=expired',
                    },
                  ]
                : []),
            ]}
          />
        </Grid.Col>
      </Grid>
      <AnalyticsSection />
      {actions.dialogs}
    </Stack>
  )
}

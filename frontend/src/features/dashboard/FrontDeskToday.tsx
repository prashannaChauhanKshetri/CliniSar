/**
 * "Today" for the front desk & pharmacy and for the clinic admin: the live queue, who is
 * waiting for medicines, what needs action, then the clinic's figures.
 *
 * EN: Phase 12 rules: one role does reception and pharmacy, and the admin handles the
 *     money. So the admin sees "Earned today" and the bills the front desk cancelled;
 *     the front desk sees how many are waiting for medicines instead.
 * NP: Admin le paisa ko hisab herne, front desk le chai kaam (queue, ausadhi, unpaid
 *     bill). Ekai component ho, role herera ali farak kura dekhaucha.
 */
import { Button, Grid, Group, Skeleton, Stack, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Link } from 'react-router'
import { prescriptionsApi } from '../../api/resources'
import { formatRs } from '../../lib/money'
import { QueueBoard } from '../appointments/QueueBoard'
import { useVisitActions } from '../appointments/useVisitActions'
import { useAuth } from '../auth/useAuth'
import { AnalyticsSection } from './AnalyticsSection'
import { NeedsAction } from './NeedsAction'
import { TodayStrip } from './TodayStrip'
import { useTodaySummary, useTodayVisits } from './useToday'
import { WaitingForMedicines } from './WaitingForMedicines'

export function FrontDeskToday() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'CLINIC_ADMIN'
  const summary = useTodaySummary().data
  const waitingForMedicines = useQuery({
    queryKey: ['prescriptions', { status: 'PENDING', page_size: 6 }],
    queryFn: () => prescriptionsApi.list({ status: 'PENDING', page_size: 6 }),
    refetchInterval: 30_000, // the counter changes all day; refresh every 30 s
  }).data
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
          isAdmin
            ? {
                label: 'Earned today',
                value: summary?.earnings ? formatRs(summary.earnings.value) : undefined,
                to: '/invoices?status=PAID',
              }
            : {
                label: 'Waiting for medicines',
                value: waitingForMedicines?.count,
                to: '/prescriptions',
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
            <Group justify="space-between" wrap="nowrap">
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
          <Stack gap="lg">
            <NeedsAction
              items={[
                {
                  // Admin only (the server sends null to everyone else).
                  count: summary?.cancelled_bills_to_review,
                  one: 'cancelled bill to review',
                  many: 'cancelled bills to review',
                  to: '/invoices?cancel_needs_review=true',
                },
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
              ]}
            />
            <WaitingForMedicines waiting={waitingForMedicines} />
          </Stack>
        </Grid.Col>
      </Grid>
      <AnalyticsSection />
      {actions.dialogs}
    </Stack>
  )
}

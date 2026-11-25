/** Doctor: the next patient up front, the rest of today's queue, and recent lab results. */
import {
  Anchor,
  Button,
  Card,
  EmptyState,
  Grid,
  Group,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Check, ClipboardPlus, Coffee, FlaskConical, UserRound } from 'lucide-react'
import { Link } from 'react-router'
import { labOrdersApi, type Appointment } from '../../api/resources'
import { formatNepalTime } from '../../lib/date'
import { callingOrder, nepalClock, visitSlot } from '../../lib/queue'
import { useVisitActions, type VisitActions } from '../appointments/useVisitActions'
import { VisitRow } from '../appointments/VisitRow'
import { ReturningSummary } from '../patients/PatientHistory'
import classes from './Today.module.css'
import { NeedsAction } from './NeedsAction'
import { TodayStrip } from './TodayStrip'
import { useTodaySummary, useTodayVisits } from './useToday'

export function DoctorToday() {
  const summary = useTodaySummary().data
  const visits = useTodayVisits()
  const actions = useVisitActions()
  const all = visits.data?.results ?? []
  const queue = callingOrder(all, nepalClock())
  const [next, ...rest] = queue
  const results = useQuery({
    queryKey: ['lab-orders', { status: 'COMPLETED', page_size: 5 }],
    queryFn: () => labOrdersApi.list({ status: 'COMPLETED', page_size: 5 }),
  })

  return (
    <Stack gap="xl">
      <TodayStrip
        figures={[
          { label: 'Waiting', value: visits.data ? queue.length : undefined, to: '/appointments' },
          {
            label: 'Seen today',
            value: visits.data ? all.filter((v) => v.status === 'COMPLETED').length : undefined,
          },
          {
            label: 'Lab orders in progress',
            value: summary?.pending_lab_orders ?? undefined,
            to: '/lab-orders',
          },
        ]}
      />
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Stack gap="lg">
            {!visits.data ? (
              <Skeleton h={160} radius="lg" />
            ) : next ? (
              <NextPatient visit={next} actions={actions} />
            ) : (
              <Card>
                <EmptyState
                  icon={<Coffee size={28} />}
                  title="Nobody waiting"
                  description="New walk-ins appear here."
                  py="lg"
                />
              </Card>
            )}
            {rest.length > 0 && (
              <Card padding="md">
                <Title order={2} fz={16} mb="sm">
                  After that
                </Title>
                <Stack gap={4}>
                  {rest.map((visit) => (
                    <VisitRow key={visit.id} visit={visit} actions={actions} isDoctor />
                  ))}
                </Stack>
              </Card>
            )}
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Stack gap="lg">
            <Card padding="md">
              <Title order={2} fz={16} mb="sm">
                Latest lab results
              </Title>
              {results.data?.results.length ? (
                <Stack gap="xs">
                  {results.data.results.map((order) => (
                    <Group key={order.id} justify="space-between" wrap="nowrap">
                      <div style={{ minWidth: 0 }}>
                        <Anchor component={Link} to={`/lab-orders/${order.id}`} size="sm" fw={500}>
                          {order.patient_name}
                        </Anchor>
                        <Text size="xs" c="dimmed" truncate="end">
                          {order.items.map((i) => i.lab_test_name).join(', ')}
                        </Text>
                      </div>
                      <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                        {order.completed_at
                          ? formatNepalTime(order.completed_at).split(', ')[0]
                          : ''}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              ) : (
                <Text size="sm" c="dimmed">
                  No results yet.
                </Text>
              )}
            </Card>
            <NeedsAction
              title="Later"
              items={[
                {
                  count: summary?.pending_lab_orders,
                  one: 'lab order not finished',
                  many: 'lab orders not finished',
                  to: '/lab-orders',
                },
              ]}
            />
          </Stack>
        </Grid.Col>
      </Grid>
      {actions.dialogs}
    </Stack>
  )
}

function NextPatient({ visit, actions }: { visit: Appointment; actions: VisitActions }) {
  return (
    <Card className={classes.next}>
      <Text size="xs" c="dimmed" fw={600} tt="uppercase" lts={0.4}>
        Next patient · {visitSlot(visit)}
      </Text>
      <Title order={2} fz={24} mt={4}>
        {visit.patient_name}
      </Title>
      <Text size="sm" c="dimmed" mt={4}>
        {visit.reason || 'No reason written at the desk.'}
      </Text>
      {/* EN: Returning patient? Last diagnosis, medicines and any abnormal lab value.
          NP: Patient feri aako ho bhane last time ke bhako thiyo yahi dekhincha. */}
      <ReturningSummary patientId={visit.patient} previousVisits={visit.previous_visits} />
      <Group mt="lg" gap="sm">
        <Button leftSection={<ClipboardPlus size={16} />} onClick={() => actions.prescribe(visit)}>
          Write prescription
        </Button>
        <Button
          variant="light"
          leftSection={<FlaskConical size={16} />}
          onClick={() => actions.orderTests(visit)}
        >
          Order lab tests
        </Button>
        <Button
          variant="light"
          color="success"
          leftSection={<Check size={16} />}
          loading={actions.markingId === visit.id}
          onClick={() => actions.markSeen(visit)}
        >
          Seen
        </Button>
        <Button
          variant="subtle"
          color="grey"
          component={Link}
          to={`/patients/${visit.patient}`}
          leftSection={<UserRound size={16} />}
        >
          Record
        </Button>
      </Group>
    </Card>
  )
}

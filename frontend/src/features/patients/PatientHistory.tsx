/**
 * The history panel for returning patients (phase 12): visits, what was found last
 * time, current medicines, and lab values over time.
 *
 * EN: The data comes from ONE request (GET patients/<id>/history/), worked out on the
 *     server. The doctor reads it before writing today's prescription.
 * NP: Patient feri aauda doctor lai "last time ke bhako thiyo" herna yo panel. Sabai data
 *     ekai API call bata aaucha, server le nai milayera pathaucha.
 */
import { Badge, Card, Grid, Group, SimpleGrid, Skeleton, Stack, Text, Title } from '@mantine/core'
import { History } from 'lucide-react'
import { lazy, Suspense } from 'react'
import type { PatientHistory as History_ } from '../../api/resources'
import { formatBS } from '../../lib/date'
import { lastChange, visitLabel } from '../../lib/history'
import { usePatientHistory } from './usePatientHistory'

// The chart library loads only when there is a trend to draw.
const LabTrendChart = lazy(() => import('./LabTrendChart'))

export function PatientHistory({ patientId }: { patientId: string }) {
  const query = usePatientHistory(patientId)
  if (query.isPending) return <Skeleton h={160} radius="lg" />
  if (!query.data) return null // an error here should not hide the rest of the page
  const history = query.data
  const { visits } = history
  const trends = history.lab_trends.filter((trend) => trend.points.length > 1)
  const singles = history.lab_trends.filter((trend) => trend.points.length === 1)

  return (
    <Card>
      <Group justify="space-between" mb="md" gap="sm">
        <Group gap="sm" wrap="nowrap">
          <History size={20} aria-hidden="true" />
          <Title order={2} fz={18}>
            History
          </Title>
        </Group>
        <Text size="sm" c="dimmed">
          {visits.count === 0
            ? 'First visit: nothing recorded yet.'
            : `${visits.count} ${visits.count === 1 ? 'visit' : 'visits'} · first ${formatBS(visits.first!)} · last ${formatBS(visits.last!)}`}
        </Text>
      </Group>

      {visits.count > 0 && (
        <Grid gap="lg">
          <Grid.Col span={{ base: 12, md: 6 }}>
            <RecentVisits rows={history.recent_visits} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <CurrentMedicines medicines={history.current_medicines} />
          </Grid.Col>
        </Grid>
      )}

      {/* EN: Values measured more than once get a chart; one-off values a short list.
          NP: Dui choti bhanda badi measure bhako value ko graph, ek choti matra bhako ko list. */}
      {trends.length > 0 && (
        <Stack gap="sm" mt="lg">
          <Text size="sm" fw={600}>
            Lab values over time
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            {trends.map((trend) => (
              <LabTrend key={`${trend.name}-${trend.unit}`} trend={trend} />
            ))}
          </SimpleGrid>
        </Stack>
      )}
      {singles.length > 0 && (
        <Stack gap="sm" mt="lg">
          <Text size="sm" fw={600}>
            Latest single results
          </Text>
          {singles.map((trend) => (
            <SingleResult key={`${trend.name}-${trend.unit}`} trend={trend} />
          ))}
        </Stack>
      )}
    </Card>
  )
}

function RecentVisits({ rows }: { rows: History_['recent_visits'] }) {
  return (
    <Stack gap="sm">
      <Text size="sm" fw={600}>
        Recent visits
      </Text>
      {rows.map((row) => (
        <div key={`${row.date}-${row.doctor_name}`}>
          <Text size="sm">
            <Text span fw={500}>
              {formatBS(row.date)}
            </Text>{' '}
            · Dr. {row.doctor_name}
          </Text>
          <Text size="xs" c="dimmed">
            {row.diagnosis || row.reason || 'No diagnosis written.'}
          </Text>
        </div>
      ))}
    </Stack>
  )
}

function CurrentMedicines({ medicines }: { medicines: History_['current_medicines'] }) {
  return (
    <Stack gap="sm">
      <Text size="sm" fw={600}>
        Last prescription
        {medicines && (
          <Text span size="xs" c="dimmed" fw={400}>
            {' '}
            · {formatBS(medicines.date)}
          </Text>
        )}
      </Text>
      {medicines ? (
        medicines.items.map((item) => (
          <div key={item.medicine}>
            <Text size="sm" fw={500}>
              {item.medicine}
            </Text>
            <Text size="xs" c="dimmed">
              {item.dosage}, {item.frequency}, {item.duration_days} days
            </Text>
          </div>
        ))
      ) : (
        <Text size="sm" c="dimmed">
          No prescription yet.
        </Text>
      )}
    </Stack>
  )
}

function LabTrend({ trend }: { trend: History_['lab_trends'][number] }) {
  const latest = trend.points[trend.points.length - 1]
  const change = lastChange(trend.points.map((point) => point.value))
  return (
    <Card withBorder padding="md" radius="md">
      <Group justify="space-between" gap="sm" wrap="nowrap" align="flex-start">
        <div style={{ minWidth: 0 }}>
          <Text size="sm" fw={600} truncate="end">
            {trend.name}
          </Text>
          <Text size="xs" c="dimmed">
            Normal {trend.reference_range || 'not given'} {trend.unit}
          </Text>
        </div>
        <Stack gap={2} align="flex-end">
          <Text size="lg" fw={700} className="tabular-numbers" lh={1}>
            {latest.value}{' '}
            <Text span size="xs" c="dimmed">
              {trend.unit}
            </Text>
          </Text>
          {latest.flag === 'ABNORMAL' && (
            <Badge color="danger" size="sm">
              Outside range
            </Badge>
          )}
        </Stack>
      </Group>
      {change && (
        <Text size="xs" c="dimmed" mt={4}>
          Before: {change.from} → now {change.to}
        </Text>
      )}
      {trend.points.length > 1 && (
        <Suspense fallback={<Skeleton h={140} mt="sm" />}>
          <div style={{ marginTop: 8 }}>
            <LabTrendChart trend={trend} />
          </div>
        </Suspense>
      )}
    </Card>
  )
}

function SingleResult({ trend }: { trend: History_['lab_trends'][number] }) {
  const point = trend.points[0]
  return (
    <Group justify="space-between" gap="sm" wrap="nowrap" align="flex-start">
      <div style={{ minWidth: 0 }}>
        <Text size="sm">{trend.name}</Text>
        <Text size="xs" c="dimmed">
          Normal {trend.reference_range || 'not given'}
          {point.date && ` · ${formatBS(point.date)}`}
        </Text>
      </div>
      <Stack gap={2} align="flex-end">
        <Text size="sm" fw={600} className="tabular-numbers" style={{ whiteSpace: 'nowrap' }}>
          {point.value} {trend.unit}
        </Text>
        {point.flag === 'ABNORMAL' && (
          <Badge color="danger" size="xs">
            Outside range
          </Badge>
        )}
      </Stack>
    </Group>
  )
}

/** One line for the doctor's "Next patient" card: "3rd visit · last time: Diabetes". */
export function ReturningSummary({
  patientId,
  previousVisits,
}: {
  patientId: string
  previousVisits: number
}) {
  const query = usePatientHistory(patientId)
  const label = visitLabel(previousVisits)
  if (!label) {
    return (
      <Badge variant="light" color="success" mt="sm">
        First visit
      </Badge>
    )
  }
  const last = query.data?.recent_visits[0]
  const abnormal = query.data?.lab_trends.find(
    (trend) => trend.points[trend.points.length - 1].flag === 'ABNORMAL',
  )
  return (
    <Stack gap={4} mt="sm">
      <Group gap="xs">
        <Badge variant="light">{label}</Badge>
        {abnormal && (
          <Badge variant="light" color="danger">
            {abnormal.name}: {abnormal.points[abnormal.points.length - 1].value} {abnormal.unit}
          </Badge>
        )}
      </Group>
      {last && (
        <Text size="sm" c="dimmed">
          Last time ({formatBS(last.date)}):{' '}
          {last.diagnosis || last.reason || 'no diagnosis written'}
          {query.data?.current_medicines?.items.length
            ? ` · on ${query.data.current_medicines.items.map((item) => item.medicine).join(', ')}`
            : ''}
        </Text>
      )}
    </Stack>
  )
}

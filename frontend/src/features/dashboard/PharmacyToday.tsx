/** Pharmacist: who is waiting at the counter, and which stock needs attention. */
import { Anchor, Button, Card, Grid, Group, Stack, Text, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Pill } from 'lucide-react'
import { Link } from 'react-router'
import { batchesApi, medicinesApi, prescriptionsApi } from '../../api/resources'
import { DateText } from '../../components/DateText'
import { formatNepalTime } from '../../lib/date'
import { formatRs } from '../../lib/money'
import { TodayStrip } from './TodayStrip'
import { useTodaySummary } from './useToday'

export function PharmacyToday() {
  const summary = useTodaySummary().data
  const waiting = useQuery({
    queryKey: ['prescriptions', { status: 'PENDING', page_size: 6 }],
    queryFn: () => prescriptionsApi.list({ status: 'PENDING', page_size: 6 }),
    refetchInterval: 30_000,
  })
  const low = useQuery({
    queryKey: ['medicines', { low_stock: true, page_size: 6 }],
    queryFn: () => medicinesApi.list({ low_stock: true, page_size: 6 }),
  })
  const expiring = useQuery({
    queryKey: ['batches', { expiring_within: 90, page_size: 5 }],
    queryFn: () => batchesApi.list({ expiring_within: 90, page_size: 5 }),
  })

  return (
    <Stack gap="xl">
      <TodayStrip
        figures={[
          { label: 'Waiting at the counter', value: waiting.data?.count, to: '/prescriptions' },
          {
            label: 'Earned today',
            value: summary?.earnings ? formatRs(summary.earnings.value) : undefined,
          },
          {
            label: 'Low on stock',
            value: summary?.stock?.low_stock_medicines,
            to: '/medicines?low_stock=true',
            alert: true,
          },
          {
            label: 'Expired batches',
            value: summary?.stock?.expired_batches,
            to: '/expiry?view=expired',
            alert: true,
          },
        ]}
      />
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <Card padding="md">
            <Group justify="space-between" mb="sm">
              <Title order={2} fz={16}>
                Waiting at the counter
              </Title>
              <Button
                component={Link}
                to="/prescriptions"
                size="xs"
                leftSection={<Pill size={14} />}
              >
                Open counter
              </Button>
            </Group>
            {waiting.data?.results.length ? (
              <Stack gap="xs">
                {waiting.data.results.map((p) => (
                  <Group key={p.id} justify="space-between" wrap="nowrap">
                    <div style={{ minWidth: 0 }}>
                      <Text size="sm" fw={500}>
                        {p.patient_name}
                      </Text>
                      <Text size="xs" c="dimmed" truncate="end">
                        Dr. {p.doctor_name} · {p.items.map((i) => i.medicine_name).join(', ')}
                      </Text>
                    </div>
                    <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                      {formatNepalTime(p.created_at).split(', ')[1]}
                    </Text>
                  </Group>
                ))}
              </Stack>
            ) : (
              <Text size="sm" c="dimmed">
                Nobody waiting.
              </Text>
            )}
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <Stack gap="lg">
            <Card padding="md">
              <Title order={2} fz={16} mb="sm">
                Low on stock
              </Title>
              {low.data?.results.length ? (
                <Stack gap="xs">
                  {low.data.results.map((m) => (
                    <Group key={m.id} justify="space-between">
                      <Anchor component={Link} to={`/medicines/${m.id}`} size="sm">
                        {m.name} {m.strength}
                      </Anchor>
                      <Text size="sm" c="danger.6" fw={600} className="tabular-numbers">
                        {m.available_stock} / {m.reorder_level}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              ) : (
                <Text size="sm" c="dimmed">
                  Stock is fine.
                </Text>
              )}
            </Card>
            <Card padding="md">
              <Title order={2} fz={16} mb="sm">
                Expiring within 90 days
              </Title>
              {expiring.data?.results.length ? (
                <Stack gap="xs">
                  {expiring.data.results.map((b) => (
                    <Group key={b.id} justify="space-between" wrap="nowrap">
                      <div>
                        <Anchor component={Link} to={`/medicines/${b.medicine}`} size="sm">
                          {b.medicine_name}
                        </Anchor>
                        <Text size="xs" c="dimmed">
                          Batch {b.batch_number} · {b.quantity} left
                        </Text>
                      </div>
                      <DateText iso={b.expiry_date} />
                    </Group>
                  ))}
                </Stack>
              ) : (
                <Text size="sm" c="dimmed">
                  Nothing expires soon.
                </Text>
              )}
            </Card>
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  )
}

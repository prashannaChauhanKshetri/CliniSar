/**
 * The lab's working board: samples to collect, results to enter, and reports finished
 * today. Oldest orders first, so nobody waits longer than necessary.
 */
import {
  Badge,
  Button,
  Card,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Printer, TestTube } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { labOrdersApi, type LabOrder } from '../../api/resources'
import { ErrorState } from '../../components/ErrorState'
import { formatNepalTime, todayInNepal } from '../../lib/date'
import { labColumns } from '../../lib/labWork'
import { notifyError, notifySuccess } from '../../lib/notify'
import classes from './LabBoard.module.css'

export function LabBoard({ compact = false }: { compact?: boolean }) {
  const query = useQuery({
    queryKey: ['lab-orders', { board: true }],
    queryFn: () => labOrdersApi.list({ page_size: 100 }),
    refetchInterval: 30_000,
  })
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  if (!query.data) return <Skeleton h={240} radius="lg" />
  const columns = labColumns(query.data.results, todayInNepal())

  return (
    <SimpleGrid cols={{ base: 1, md: compact ? 2 : 3 }} spacing="lg">
      <Column title="To collect" count={columns.toCollect.length} empty="No samples to collect.">
        {columns.toCollect.map((order) => (
          <OrderCard key={order.id} order={order} action="collect" />
        ))}
      </Column>
      <Column title="Results to enter" count={columns.toEnter.length} empty="No results waiting.">
        {columns.toEnter.map((order) => (
          <OrderCard key={order.id} order={order} action="enter" />
        ))}
      </Column>
      {!compact && (
        <Column
          title="Done today"
          count={columns.doneToday.length}
          empty="Nothing finished yet today."
        >
          {columns.doneToday.map((order) => (
            <OrderCard key={order.id} order={order} action="print" />
          ))}
        </Column>
      )}
    </SimpleGrid>
  )
}

function Column({
  title,
  count,
  empty,
  children,
}: {
  title: string
  count: number
  empty: string
  children: ReactNode
}) {
  return (
    <Card padding="md">
      <Group justify="space-between" mb="sm">
        <Text fw={600} size="sm">
          {title}
        </Text>
        <Badge variant="light" color={count ? 'primary' : 'grey'}>
          {count}
        </Badge>
      </Group>
      <Stack gap="xs">
        {count === 0 ? (
          <Text size="sm" c="dimmed">
            {empty}
          </Text>
        ) : (
          children
        )}
      </Stack>
    </Card>
  )
}

function OrderCard({ order, action }: { order: LabOrder; action: 'collect' | 'enter' | 'print' }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const collect = useMutation({
    mutationFn: () => labOrdersApi.collect(order.id),
    onSuccess: () => {
      notifySuccess(`Sample for Lab No. ${order.lab_number} collected.`)
      void queryClient.invalidateQueries({ queryKey: ['lab-orders'] })
    },
    onError: (error) => notifyError(error),
  })
  return (
    <div className={classes.card}>
      <UnstyledButton
        className={classes.open}
        onClick={() => navigate(`/lab-orders/${order.id}`)}
        aria-label={`Open Lab No. ${order.lab_number}`}
      >
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Text size="sm" fw={600} truncate="end">
            {order.patient_name}
          </Text>
          <Text size="xs" fw={600} c="primary.7" style={{ whiteSpace: 'nowrap' }}>
            No. {order.lab_number}
          </Text>
        </Group>
        <Text size="xs" c="dimmed" truncate="end">
          {order.items.map((item) => item.lab_test_name).join(', ')}
        </Text>
        <Text size="xs" c="dimmed">
          {order.consultant} · {formatNepalTime(order.created_at).split(', ')[1]}
        </Text>
      </UnstyledButton>
      {action === 'collect' && (
        <Button
          size="compact-xs"
          variant="light"
          leftSection={<TestTube size={12} />}
          loading={collect.isPending}
          onClick={() => collect.mutate()}
        >
          Sample collected
        </Button>
      )}
      {action === 'enter' && (
        <Button
          size="compact-xs"
          variant="light"
          onClick={() => navigate(`/lab-orders/${order.id}`)}
        >
          Enter results
        </Button>
      )}
      {action === 'print' && (
        <Button
          size="compact-xs"
          variant="subtle"
          color="grey"
          component="a"
          href={`/print/lab-order/${order.id}`}
          target="_blank"
          leftSection={<Printer size={12} />}
        >
          Print
        </Button>
      )}
    </div>
  )
}

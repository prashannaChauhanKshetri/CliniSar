/**
 * The day's visits. "Board" shows each doctor's queue in calling order (how the front
 * desk actually works); "List" is a plain table for searching and filtering.
 */
import {
  ActionIcon,
  Anchor,
  Button,
  Card,
  Group,
  SegmentedControl,
  Select,
  Text,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Columns3, List, Plus } from 'lucide-react'
import { Link } from 'react-router'
import { appointmentsApi, doctorsApi, type Appointment } from '../../api/resources'
import { BsDatePicker } from '../../components/BsDatePicker'
import { DataTable } from '../../components/DataTable'
import { ErrorState } from '../../components/ErrorState'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'
import { addDays, formatBS, todayInNepal } from '../../lib/date'
import { visitSlot } from '../../lib/queue'
import { useListState } from '../../lib/useListState'
import { useAuth } from '../auth/useAuth'
import { QueueBoard } from './QueueBoard'
import { useVisitActions } from './useVisitActions'
import { VisitActionButtons } from './VisitRow'

const STATUS_OPTIONS = [
  { value: 'BOOKED', label: 'Waiting' },
  { value: 'COMPLETED', label: 'Seen' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'NO_SHOW', label: 'No show' },
]

export function AppointmentsPage() {
  const { user } = useAuth()
  const isDoctor = user?.role === 'DOCTOR'
  const list = useListState()
  const actions = useVisitActions()
  const today = todayInNepal()
  const day = list.get('date') || today
  const view = list.get('view') === 'list' ? 'list' : 'board'

  return (
    <>
      <PageHeader
        title={day === today ? 'Today’s visits' : `Visits on ${formatBS(day)}`}
        actions={
          <Group gap="sm">
            <SegmentedControl
              value={view}
              onChange={(value) => list.setFilter('view', value === 'list' ? 'list' : null)}
              data={[
                {
                  value: 'board',
                  label: (
                    <Group gap={6} wrap="nowrap">
                      <Columns3 size={14} />
                      Queue
                    </Group>
                  ),
                },
                {
                  value: 'list',
                  label: (
                    <Group gap={6} wrap="nowrap">
                      <List size={14} />
                      List
                    </Group>
                  ),
                },
              ]}
            />
            {!isDoctor && (
              <Button component={Link} to="/appointments/new" leftSection={<Plus size={16} />}>
                New appointment
              </Button>
            )}
          </Group>
        }
      />
      <Group mb="md" gap="xs" align="flex-end" wrap="nowrap">
        <ActionIcon
          variant="default"
          size={36}
          aria-label="Previous day"
          onClick={() => list.setFilter('date', addDays(day, -1))}
        >
          <ChevronLeft size={18} />
        </ActionIcon>
        <BsDatePicker
          label="Day"
          value={day}
          onChange={(value) => list.setFilter('date', value === today ? null : value)}
        />
        <ActionIcon
          variant="default"
          size={36}
          aria-label="Next day"
          onClick={() => list.setFilter('date', addDays(day, 1))}
        >
          <ChevronRight size={18} />
        </ActionIcon>
        {day !== today && (
          <Button variant="subtle" onClick={() => list.setFilter('date', null)}>
            Back to today
          </Button>
        )}
      </Group>
      {view === 'board' ? (
        <BoardView day={day} isToday={day === today} isDoctor={isDoctor} actions={actions} />
      ) : (
        <ListView day={day} isDoctor={isDoctor} actions={actions} />
      )}
      {actions.dialogs}
    </>
  )
}

function BoardView({
  day,
  isToday,
  isDoctor,
  actions,
}: {
  day: string
  isToday: boolean
  isDoctor: boolean
  actions: ReturnType<typeof useVisitActions>
}) {
  const query = useQuery({
    queryKey: ['appointments', { date: day, page_size: 100 }],
    queryFn: () => appointmentsApi.list({ date: day, page_size: 100 }),
    refetchInterval: isToday ? 30_000 : false, // the queue changes all day
  })
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  if (!query.data) return <Card h={240} />
  return (
    <QueueBoard
      visits={query.data.results}
      actions={actions}
      isDoctor={isDoctor}
      isToday={isToday}
    />
  )
}

function ListView({
  day,
  isDoctor,
  actions,
}: {
  day: string
  isDoctor: boolean
  actions: ReturnType<typeof useVisitActions>
}) {
  const list = useListState()
  const filters = {
    page: list.page,
    date: day,
    doctor: list.get('doctor'),
    status: list.get('status'),
    search: list.get('search'),
  }
  const query = useQuery({
    queryKey: ['appointments', filters],
    queryFn: () => appointmentsApi.list(filters),
  })
  const doctors = useQuery({
    queryKey: ['doctors', 'all'],
    queryFn: () => doctorsApi.list({ page_size: 100 }),
    enabled: !isDoctor,
  })
  return (
    <Card>
      <Group mb="md" gap="md">
        {!isDoctor && (
          <Select
            aria-label="Doctor"
            placeholder="All doctors"
            data={(doctors.data?.results ?? []).map((d) => ({
              value: d.id,
              label: `Dr. ${d.first_name} ${d.last_name}`,
            }))}
            value={filters.doctor || null}
            onChange={(value) => list.setFilter('doctor', value)}
            clearable
            w={220}
          />
        )}
        <Select
          aria-label="Status"
          placeholder="Any status"
          data={STATUS_OPTIONS}
          value={filters.status || null}
          onChange={(value) => list.setFilter('status', value)}
          clearable
          w={160}
        />
      </Group>
      <DataTable
        caption={`Visits on ${formatBS(day)}`}
        rows={query.data?.results}
        rowKey={(row) => row.id}
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={{ title: `No visits on ${formatBS(day)}` }}
        pagination={{ page: list.page, total: query.data?.count ?? 0, onChange: list.setPage }}
        columns={[
          {
            key: 'when',
            header: 'Time / no.',
            width: 90,
            render: (row) => (
              <Text size="sm" fw={600} className="tabular-numbers">
                {visitSlot(row)}
              </Text>
            ),
          },
          {
            key: 'patient',
            header: 'Patient',
            render: (row) => (
              <Anchor component={Link} to={`/patients/${row.patient}`} size="sm">
                {row.patient_name}
              </Anchor>
            ),
          },
          ...(isDoctor
            ? []
            : [
                {
                  key: 'doctor',
                  header: 'Doctor',
                  render: (row: Appointment) => `Dr. ${row.doctor_name}`,
                },
              ]),
          { key: 'reason', header: 'Reason', render: (row) => row.reason || '—' },
          {
            key: 'status',
            header: 'Status',
            render: (row) => (
              <StatusBadge
                status={row.status}
                label={row.status === 'BOOKED' ? 'Waiting' : undefined}
              />
            ),
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            width: 110,
            // The same quick actions as on the board.
            render: (row) =>
              row.status === 'BOOKED' ? (
                <Group justify="flex-end">
                  <VisitActionButtons visit={row} actions={actions} isDoctor={isDoctor} />
                </Group>
              ) : null,
          },
        ]}
      />
    </Card>
  )
}

/**
 * Appointments for one day: booked slots and the walk-in queue. Front desk completes or
 * cancels visits; doctors see their own day and can write a prescription or order tests.
 */
import { ActionIcon, Anchor, Button, Card, Group, Menu, Select, Text, Tooltip } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardPlus,
  FlaskConical,
  MoreHorizontal,
  Plus,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { appointmentsApi, doctorsApi, type Appointment } from '../../api/resources'
import { BsDatePicker } from '../../components/BsDatePicker'
import { DataTable } from '../../components/DataTable'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'
import { addDays, formatBS, todayInNepal } from '../../lib/date'
import { formatTime } from '../../lib/forms'
import { notifyError, notifySuccess } from '../../lib/notify'
import { useListState } from '../../lib/useListState'
import { useAuth } from '../auth/useAuth'
import { OrderLabTestsModal } from '../lab/OrderLabTestsModal'
import { WritePrescriptionModal } from '../prescriptions/WritePrescriptionModal'
import { CancelWithReason } from './CancelWithReason'

const STATUS_OPTIONS = [
  { value: 'BOOKED', label: 'Booked' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'NO_SHOW', label: 'No show' },
]

export function AppointmentsPage() {
  const { user } = useAuth()
  const isDoctor = user?.role === 'DOCTOR'
  const list = useListState()
  const queryClient = useQueryClient()
  const today = todayInNepal()
  const day = list.get('date') || today
  const filters = {
    page: list.page,
    date: day,
    doctor: list.get('doctor'),
    status: list.get('status'),
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
  const [cancelling, setCancelling] = useState<Appointment | null>(null)
  const [prescribing, setPrescribing] = useState<Appointment | null>(null)
  const [ordering, setOrdering] = useState<Appointment | null>(null)

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['appointments'] })
  const complete = useMutation({
    mutationFn: (visit: Appointment) => appointmentsApi.complete(visit.id),
    onSuccess: (visit) => {
      notifySuccess(`${visit.patient_name}'s visit is marked as seen.`)
      refresh()
    },
    onError: (error) => notifyError(error),
  })
  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      appointmentsApi.cancel(id, reason),
    onSuccess: (visit) => {
      notifySuccess(
        `${visit.patient_name}'s visit was cancelled. An unpaid bill for it was cancelled too.`,
      )
      setCancelling(null)
      refresh()
      void queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
    onError: (error) => notifyError(error),
  })

  return (
    <>
      <PageHeader
        title="Appointments"
        description={
          isDoctor ? 'Your visits for the day.' : 'Booked visits and the walk-in queue for the day.'
        }
        actions={
          !isDoctor && (
            <Button component={Link} to="/appointments/new" leftSection={<Plus size={16} />}>
              New appointment
            </Button>
          )
        }
      />
      <Card>
        <Group mb="md" gap="md" align="flex-end">
          <Group gap="xs" align="flex-end" wrap="nowrap">
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
              onChange={(value) => list.setFilter('date', value ?? today)}
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
                Today
              </Button>
            )}
          </Group>
          {!isDoctor && (
            <Select
              label="Doctor"
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
            label="Status"
            placeholder="Any status"
            data={STATUS_OPTIONS}
            value={filters.status || null}
            onChange={(value) => list.setFilter('status', value)}
            clearable
            w={180}
          />
        </Group>
        <DataTable
          caption={`Appointments on ${formatBS(day)}`}
          rows={query.data?.results}
          rowKey={(row) => row.id}
          loading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          empty={{
            title: `No visits on ${formatBS(day)}`,
            description: isDoctor
              ? 'Nothing is booked with you for this day.'
              : 'Add a walk-in or book a time.',
            action: !isDoctor && (
              <Button component={Link} to="/appointments/new" variant="light">
                New appointment
              </Button>
            ),
          }}
          pagination={{ page: list.page, total: query.data?.count ?? 0, onChange: list.setPage }}
          columns={[
            {
              key: 'when',
              header: 'Time / queue',
              render: (row) =>
                row.visit_type === 'WALK_IN' ? (
                  <StatusBadge status="WALK_IN" label={`Walk-in #${row.queue_number}`} />
                ) : (
                  <Text size="sm" className="tabular-numbers">
                    {formatTime(row.start_time)}
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
              render: (row) => <StatusBadge status={row.status} />,
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              width: 140,
              render: (row) =>
                row.status === 'CANCELLED' || row.status === 'NO_SHOW' ? null : (
                  <Group gap="xs" justify="flex-end" wrap="nowrap">
                    {row.status === 'BOOKED' && (
                      <Tooltip label="Mark as seen">
                        <ActionIcon
                          variant="light"
                          color="success"
                          aria-label={`Mark ${row.patient_name} as seen`}
                          loading={complete.isPending && complete.variables?.id === row.id}
                          onClick={() => complete.mutate(row)}
                        >
                          <Check size={16} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                    <Menu position="bottom-end" withinPortal>
                      <Menu.Target>
                        <ActionIcon
                          variant="subtle"
                          color="grey"
                          aria-label={`More actions for ${row.patient_name}`}
                        >
                          <MoreHorizontal size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        {isDoctor && (
                          <>
                            <Menu.Item
                              leftSection={<ClipboardPlus size={16} />}
                              onClick={() => setPrescribing(row)}
                            >
                              Write prescription
                            </Menu.Item>
                            <Menu.Item
                              leftSection={<FlaskConical size={16} />}
                              onClick={() => setOrdering(row)}
                            >
                              Order lab tests
                            </Menu.Item>
                          </>
                        )}
                        <Menu.Item component={Link} to={`/patients/${row.patient}`}>
                          Open patient record
                        </Menu.Item>
                        {row.status === 'BOOKED' && (
                          <Menu.Item
                            color="danger"
                            leftSection={<X size={16} />}
                            onClick={() => setCancelling(row)}
                          >
                            Cancel visit
                          </Menu.Item>
                        )}
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
                ),
            },
          ]}
        />
      </Card>
      <CancelWithReason
        opened={cancelling !== null}
        title="Cancel this visit?"
        message={`${cancelling?.patient_name}'s visit will be cancelled. If its bill is unpaid it is cancelled too; a paid bill stays paid.`}
        loading={cancel.isPending}
        onConfirm={(reason) => cancelling && cancel.mutate({ id: cancelling.id, reason })}
        onClose={() => setCancelling(null)}
      />
      {prescribing && (
        <WritePrescriptionModal appointment={prescribing} onClose={() => setPrescribing(null)} />
      )}
      {ordering && <OrderLabTestsModal appointment={ordering} onClose={() => setOrdering(null)} />}
    </>
  )
}

/**
 * Figures for the dashboard, laid out like the reference design: four stat cards, appointments by
 * status (donut) beside appointments per department (bars), then recent doctors and
 * new patients. Every number comes from GET dashboard/summary/ in one request.
 */
import { BarChart, DonutChart } from '@mantine/charts'
// Chart styles load with this page only, so other pages never download chart code.
import '@mantine/charts/styles.css'
import {
  ActionIcon,
  Card,
  EmptyState,
  Group,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BarChart3, Pencil, Trash2, UserX } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { fetchSummary } from '../../api/dashboard'
import { doctorsApi, patientsApi } from '../../api/resources'
import type { DashboardSummary } from '../../api/types'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ErrorState } from '../../components/ErrorState'
import { StatCard } from '../../components/StatCard'
import { StatusBadge } from '../../components/StatusBadge'
import { formatBS, nepalDateOf } from '../../lib/date'
import { statusLabel } from '../../lib/labels'
import { notifyError, notifySuccess } from '../../lib/notify'
import { ageSex } from '../../lib/people'
import { useListState } from '../../lib/useListState'
import { CHART_SERIES } from '../../theme'
import { useAuth } from '../auth/useAuth'
import { cardsFor } from './cards'

type Range = 'week' | 'month'

/**
 * The clinic's figures over the last 7 or 30 days: cards with the change against the
 * period before, appointments by status and by department, recent doctors and new
 * patients. Shown under "Today" for the clinic admin and the front desk.
 */
export function AnalyticsSection() {
  const { user } = useAuth()
  const list = useListState()
  const range: Range = list.get('range') === 'month' ? 'month' : 'week'
  const query = useQuery({
    queryKey: ['dashboard', 'summary', range],
    queryFn: () => fetchSummary(range),
  })
  if (!user) return null
  const comparedTo = range === 'week' ? 'vs previous 7 days' : 'vs previous 30 days'

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2} fz={18}>
            Clinic figures
          </Title>
          {query.data && (
            <Text size="sm" c="dimmed">
              {formatBS(query.data.start)} to {formatBS(query.data.end)}
            </Text>
          )}
        </div>
        <Select
          aria-label="Period"
          w={170}
          allowDeselect={false}
          value={range}
          onChange={(value) => list.setFilter('range', value === 'month' ? 'month' : null)}
          data={[
            { value: 'week', label: 'Last 7 days' },
            { value: 'month', label: 'Last 30 days' },
          ]}
        />
      </Group>
      {query.error ? (
        <Card>
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </Card>
      ) : !query.data ? (
        <Skeleton h={340} radius="lg" />
      ) : (
        <Stack gap="lg">
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg">
            {cardsFor(query.data, user.role).map((card) => (
              <StatCard key={card.label} {...card} comparedTo={comparedTo} />
            ))}
          </SimpleGrid>
          {query.data.appointments_by_status && (
            <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
              <StatusChart summary={query.data} />
              <DepartmentChart summary={query.data} />
            </SimpleGrid>
          )}
          <SimpleGrid cols={{ base: 1, lg: query.data.new_patients_list ? 2 : 1 }} spacing="lg">
            <RecentDoctors summary={query.data} canManage={user.role === 'CLINIC_ADMIN'} />
            {query.data.new_patients_list && (
              <NewPatients
                summary={query.data}
                canManage={user.role === 'CLINIC_ADMIN' || user.role === 'STAFF'}
              />
            )}
          </SimpleGrid>
        </Stack>
      )}
    </Stack>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <Title order={2} fz={16} mb="md">
        {title}
      </Title>
      {children}
    </Card>
  )
}

function NoData({ text }: { text: string }) {
  return <EmptyState icon={<BarChart3 size={24} />} title={text} size="sm" py="xl" />
}

function StatusChart({ summary }: { summary: DashboardSummary }) {
  const rows = summary.appointments_by_status ?? []
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  const data = rows.map((row, index) => ({
    name: statusLabel(row.status),
    value: row.count,
    color: CHART_SERIES[index % CHART_SERIES.length],
  }))
  return (
    <Panel title="Appointments by status">
      {total === 0 ? (
        <NoData text="No appointments in this period" />
      ) : (
        <Group justify="space-around" gap="lg" wrap="wrap">
          <DonutChart
            data={data}
            size={200}
            thickness={28}
            chartLabel={total}
            withTooltip
            tooltipDataSource="segment"
            aria-label="Appointments by status"
          />
          <Stack gap="sm" miw={180}>
            {data.map((row) => (
              <Group key={row.name} justify="space-between" gap="lg">
                <Group gap="sm">
                  <span
                    aria-hidden="true"
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      background: `var(--mantine-color-${row.color.replace('.', '-')})`,
                    }}
                  />
                  <Text size="sm">{row.name}</Text>
                </Group>
                <Text size="sm" fw={600} className="tabular-numbers">
                  {row.value}
                </Text>
              </Group>
            ))}
          </Stack>
        </Group>
      )}
    </Panel>
  )
}

function DepartmentChart({ summary }: { summary: DashboardSummary }) {
  const data = summary.appointments_by_department ?? []
  return (
    <Panel title="Appointments per department">
      {data.length === 0 ? (
        <NoData text="No appointments in this period" />
      ) : (
        <BarChart
          h={240}
          data={data}
          dataKey="department"
          series={[{ name: 'count', label: 'Appointments', color: CHART_SERIES[0] }]}
          tickLine="y"
          gridAxis="y"
          maxBarWidth={56}
          aria-label="Appointments per department"
        />
      )}
    </Panel>
  )
}

function RecentDoctors({ summary, canManage }: { summary: DashboardSummary; canManage: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [deactivating, setDeactivating] = useState<{ id: string; name: string } | null>(null)
  const deactivate = useMutation({
    mutationFn: (id: string) => doctorsApi.remove(id),
    onSuccess: () => {
      notifySuccess(`Dr. ${deactivating?.name} was deactivated.`)
      setDeactivating(null)
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['doctors'] })
    },
    onError: (error) => notifyError(error),
  })
  return (
    <Panel title="Recent doctors">
      {summary.recent_doctors.length === 0 ? (
        <NoData text="No doctors yet" />
      ) : (
        <Table.ScrollContainer minWidth={420}>
          <Table>
            <Table.Thead bg="var(--clinisar-page)">
              <Table.Tr>
                <Table.Th>Doctor</Table.Th>
                <Table.Th>Department</Table.Th>
                <Table.Th>Status</Table.Th>
                {canManage && <Table.Th />}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {summary.recent_doctors.map((doctor) => (
                <Table.Tr key={doctor.id}>
                  <Table.Td>
                    <Text size="sm" fw={500}>
                      Dr. {doctor.name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {doctor.specialization}
                    </Text>
                  </Table.Td>
                  <Table.Td fz="sm">{doctor.department ?? '—'}</Table.Td>
                  <Table.Td>
                    <StatusBadge status={doctor.is_active ? 'ACTIVE' : 'INACTIVE'} />
                  </Table.Td>
                  {canManage && (
                    <Table.Td>
                      <Group gap="xs" justify="flex-end" wrap="nowrap">
                        <Tooltip label="Edit">
                          <ActionIcon
                            variant="subtle"
                            color="grey"
                            aria-label={`Edit Dr. ${doctor.name}`}
                            onClick={() =>
                              navigate(`/doctors?search=${encodeURIComponent(doctor.name)}`)
                            }
                          >
                            <Pencil size={16} />
                          </ActionIcon>
                        </Tooltip>
                        {doctor.is_active && (
                          <Tooltip label="Deactivate">
                            <ActionIcon
                              variant="subtle"
                              color="danger"
                              aria-label={`Deactivate Dr. ${doctor.name}`}
                              onClick={() => setDeactivating(doctor)}
                            >
                              <UserX size={16} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </Group>
                    </Table.Td>
                  )}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <ConfirmDialog
        opened={deactivating !== null}
        title="Deactivate this doctor?"
        message="They will not be able to sign in, and new visits cannot be booked with them. Their history stays."
        confirmLabel="Deactivate"
        loading={deactivate.isPending}
        onConfirm={() => deactivating && deactivate.mutate(deactivating.id)}
        onClose={() => setDeactivating(null)}
      />
    </Panel>
  )
}

function NewPatients({ summary, canManage }: { summary: DashboardSummary; canManage: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null)
  const remove = useMutation({
    mutationFn: (id: string) => patientsApi.remove(id),
    onSuccess: () => {
      notifySuccess(`${deleting?.name} was removed.`)
      setDeleting(null)
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['patients'] })
    },
    onError: (error) => {
      setDeleting(null)
      notifyError(error, 'Patient kept') // a patient with visits cannot be removed (409)
    },
  })
  const patients = summary.new_patients_list ?? []
  return (
    <Panel title="New patients">
      {patients.length === 0 ? (
        <NoData text="No patients yet" />
      ) : (
        <Table.ScrollContainer minWidth={420}>
          <Table>
            <Table.Thead bg="var(--clinisar-page)">
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Address</Table.Th>
                <Table.Th>Registered</Table.Th>
                {canManage && <Table.Th />}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {patients.map((patient) => (
                <Table.Tr
                  key={patient.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/patients/${patient.id}`)}
                >
                  <Table.Td>
                    <Text size="sm" fw={500}>
                      {patient.name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {ageSex(patient.age, patient.gender)}
                    </Text>
                  </Table.Td>
                  <Table.Td fz="sm">{patient.address || '—'}</Table.Td>
                  <Table.Td fz="sm">{formatBS(nepalDateOf(patient.created_at))}</Table.Td>
                  {canManage && (
                    <Table.Td onClick={(event) => event.stopPropagation()}>
                      <Group gap="xs" justify="flex-end" wrap="nowrap">
                        <Tooltip label="Edit">
                          <ActionIcon
                            variant="subtle"
                            color="grey"
                            aria-label={`Edit ${patient.name}`}
                            onClick={() => navigate(`/patients/${patient.id}`)}
                          >
                            <Pencil size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Delete">
                          <ActionIcon
                            variant="subtle"
                            color="danger"
                            aria-label={`Delete ${patient.name}`}
                            onClick={() => setDeleting(patient)}
                          >
                            <Trash2 size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  )}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <ConfirmDialog
        opened={deleting !== null}
        title="Delete this patient?"
        message={`${deleting?.name} will be removed. A patient who already has visits, bills or reports is kept, to protect the medical history.`}
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </Panel>
  )
}

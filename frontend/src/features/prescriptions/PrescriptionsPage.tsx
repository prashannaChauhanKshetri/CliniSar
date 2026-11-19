/**
 * Prescriptions. For the pharmacist, "Waiting" opens the dispensing counter (waiting
 * list + stock check + dispense). Other views, and other roles, get the plain list.
 */
import { Card, SegmentedControl, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { prescriptionsApi } from '../../api/resources'
import { DataTable } from '../../components/DataTable'
import { DateText } from '../../components/DateText'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'
import { useListState } from '../../lib/useListState'
import { useAuth } from '../auth/useAuth'
import { DispensingCounter } from './DispensingCounter'

export function PrescriptionsPage() {
  const { user } = useAuth()
  const list = useListState()
  const navigate = useNavigate()
  // Pharmacists start on the waiting list; everyone else on all prescriptions.
  const status = list.get('status') || (user?.role === 'PHARMACIST' ? 'PENDING' : 'ALL')
  const atCounter = user?.role === 'PHARMACIST' && status === 'PENDING'
  const filters = { page: list.page, status: status === 'ALL' ? '' : status }
  const query = useQuery({
    queryKey: ['prescriptions', filters],
    queryFn: () => prescriptionsApi.list(filters),
    enabled: !atCounter,
  })

  return (
    <>
      <PageHeader
        title={atCounter ? 'Dispensing counter' : 'Prescriptions'}
        actions={
          <SegmentedControl
            value={status}
            onChange={(value) => list.setFilter('status', value)}
            data={[
              { value: 'PENDING', label: 'Waiting' },
              { value: 'DISPENSED', label: 'Dispensed' },
              { value: 'ALL', label: 'All' },
            ]}
          />
        }
      />
      {atCounter ? (
        <DispensingCounter />
      ) : (
        <Card>
          <DataTable
            caption="Prescriptions"
            rows={query.data?.results}
            rowKey={(row) => row.id}
            loading={query.isPending}
            error={query.error}
            onRetry={() => void query.refetch()}
            onRowClick={(row) => navigate(`/prescriptions/${row.id}`)}
            empty={{
              title:
                status === 'PENDING' ? 'Nothing waiting at the pharmacy' : 'No prescriptions found',
            }}
            pagination={{ page: list.page, total: query.data?.count ?? 0, onChange: list.setPage }}
            columns={[
              { key: 'date', header: 'Visit', render: (row) => <DateText iso={row.visit_date} /> },
              {
                key: 'patient',
                header: 'Patient',
                render: (row) => (
                  <Text size="sm" fw={500}>
                    {row.patient_name}
                  </Text>
                ),
              },
              { key: 'doctor', header: 'Doctor', render: (row) => `Dr. ${row.doctor_name}` },
              { key: 'diagnosis', header: 'Diagnosis', render: (row) => row.diagnosis },
              {
                key: 'items',
                header: 'Medicines',
                align: 'right',
                render: (row) => row.items.length,
              },
              {
                key: 'status',
                header: 'Status',
                render: (row) => (
                  <StatusBadge
                    status={row.status}
                    label={row.status === 'PENDING' ? 'Waiting' : 'Dispensed'}
                  />
                ),
              },
            ]}
          />
        </Card>
      )}
    </>
  )
}

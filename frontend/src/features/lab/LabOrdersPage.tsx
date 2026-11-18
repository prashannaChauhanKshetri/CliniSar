/** Lab orders: waiting for a sample, waiting for results, or done. */
import { Button, Card, Group, SegmentedControl, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { labOrdersApi } from '../../api/resources'
import { DataTable } from '../../components/DataTable'
import { DateText } from '../../components/DateText'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'
import { nepalDateOf } from '../../lib/date'
import { useListState } from '../../lib/useListState'
import { useAuth } from '../auth/useAuth'
import { OrderLabTestsModal } from './OrderLabTestsModal'

export function LabOrdersPage() {
  const { user } = useAuth()
  const list = useListState()
  const navigate = useNavigate()
  const [ordering, setOrdering] = useState(false)
  const status = list.get('status') || 'ALL'
  const filters = { page: list.page, status: status === 'ALL' ? '' : status }
  const query = useQuery({
    queryKey: ['lab-orders', filters],
    queryFn: () => labOrdersApi.list(filters),
  })

  return (
    <>
      <PageHeader
        title="Lab orders"
        description="Doctors order tests from a visit; the lab can also take patients who come on their own."
        actions={
          user?.role === 'LAB_TECHNICIAN' && (
            <Button leftSection={<Plus size={16} />} onClick={() => setOrdering(true)}>
              New lab order
            </Button>
          )
        }
      />
      <Card>
        <Group mb="md">
          <SegmentedControl
            value={status}
            onChange={(value) => list.setFilter('status', value === 'ALL' ? null : value)}
            data={[
              { value: 'ALL', label: 'All' },
              { value: 'ORDERED', label: 'Waiting for sample' },
              { value: 'SAMPLE_COLLECTED', label: 'Waiting for results' },
              { value: 'COMPLETED', label: 'Completed' },
            ]}
          />
        </Group>
        <DataTable
          caption="Lab orders"
          rows={query.data?.results}
          rowKey={(row) => row.id}
          loading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          onRowClick={(row) => navigate(`/lab-orders/${row.id}`)}
          empty={{ title: 'No lab orders here' }}
          pagination={{ page: list.page, total: query.data?.count ?? 0, onChange: list.setPage }}
          columns={[
            {
              key: 'number',
              header: 'Lab No.',
              render: (row) => (
                <Text size="sm" fw={600}>
                  {row.lab_number}
                </Text>
              ),
            },
            {
              key: 'date',
              header: 'Ordered',
              render: (row) => <DateText iso={nepalDateOf(row.created_at)} />,
            },
            { key: 'patient', header: 'Patient', render: (row) => row.patient_name },
            { key: 'consultant', header: 'Consultant', render: (row) => row.consultant },
            {
              key: 'tests',
              header: 'Tests',
              render: (row) => row.items.map((item) => item.lab_test_name).join(', '),
            },
            {
              key: 'status',
              header: 'Status',
              render: (row) => <StatusBadge status={row.status} />,
            },
          ]}
        />
      </Card>
      {ordering && <OrderLabTestsModal appointment={null} onClose={() => setOrdering(false)} />}
    </>
  )
}

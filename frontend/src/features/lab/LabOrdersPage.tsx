/** Lab work: the lab technician's board (collect, enter, done today), or the plain list. */
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
import { LabBoard } from './LabBoard'
import { OrderLabTestsModal } from './OrderLabTestsModal'

export function LabOrdersPage() {
  const { user } = useAuth()
  const isLab = user?.role === 'LAB_TECHNICIAN'
  const list = useListState()
  const [ordering, setOrdering] = useState(false)
  // The lab technician works from the board; everyone else looks things up in the list.
  const view = list.get('view') || (isLab ? 'board' : 'list')

  return (
    <>
      <PageHeader
        title={view === 'board' ? 'Lab work' : 'Lab orders'}
        actions={
          <Group gap="sm">
            <SegmentedControl
              value={view}
              onChange={(value) => list.setFilter('view', value)}
              data={[
                { value: 'board', label: 'Board' },
                { value: 'list', label: 'List' },
              ]}
            />
            {isLab && (
              <Button leftSection={<Plus size={16} />} onClick={() => setOrdering(true)}>
                New lab order
              </Button>
            )}
          </Group>
        }
      />
      {view === 'board' ? <LabBoard /> : <OrdersList />}
      {ordering && <OrderLabTestsModal appointment={null} onClose={() => setOrdering(false)} />}
    </>
  )
}

function OrdersList() {
  const list = useListState()
  const navigate = useNavigate()
  const status = list.get('status') || 'ALL'
  const filters = {
    page: list.page,
    status: status === 'ALL' ? '' : status,
    search: list.get('search'),
  }
  const query = useQuery({
    queryKey: ['lab-orders', filters],
    queryFn: () => labOrdersApi.list(filters),
  })
  return (
    <Card>
      <Group mb="md">
        <SegmentedControl
          value={status}
          onChange={(value) => list.setFilter('status', value === 'ALL' ? null : value)}
          data={[
            { value: 'ALL', label: 'All' },
            { value: 'ORDERED', label: 'To collect' },
            { value: 'SAMPLE_COLLECTED', label: 'Results to enter' },
            { value: 'COMPLETED', label: 'Completed' },
            { value: 'CANCELLED', label: 'Cancelled' },
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
          { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
        ]}
      />
    </Card>
  )
}

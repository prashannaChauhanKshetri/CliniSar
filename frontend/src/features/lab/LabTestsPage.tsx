/** The tests the lab offers, with price and report rows. */
import { ActionIcon, Button, Card, Group, Text, TextInput, Tooltip } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Pencil, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { labTestsApi, type LabTest } from '../../api/resources'
import { DataTable } from '../../components/DataTable'
import { Money } from '../../components/Money'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'
import { useListState } from '../../lib/useListState'
import { LabTestForm } from './LabTestForm'

export function LabTestsPage() {
  const list = useListState()
  const [editing, setEditing] = useState<LabTest | 'new' | null>(null)
  const filters = { page: list.page, search: list.get('search') }
  const query = useQuery({
    queryKey: ['lab-tests', filters],
    queryFn: () => labTestsApi.list(filters),
  })
  return (
    <>
      <PageHeader
        title="Lab tests"
        description="Each test is a set of report rows, like the printed report."
        actions={
          <Button leftSection={<Plus size={16} />} onClick={() => setEditing('new')}>
            Add lab test
          </Button>
        }
      />
      <Card>
        <Group mb="md">
          <TextInput
            placeholder="Search tests"
            leftSection={<Search size={16} />}
            defaultValue={filters.search}
            onChange={(e) => list.setFilter('search', e.currentTarget.value)}
            aria-label="Search lab tests"
            w={280}
          />
        </Group>
        <DataTable
          caption="Lab tests"
          rows={query.data?.results}
          rowKey={(row) => row.id}
          loading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          empty={{ title: 'No lab tests yet', description: 'Add the first test, e.g. CBC.' }}
          pagination={{ page: list.page, total: query.data?.count ?? 0, onChange: list.setPage }}
          columns={[
            {
              key: 'name',
              header: 'Test',
              render: (row) => (
                <div>
                  <Text size="sm" fw={500}>
                    {row.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {row.category || '—'}
                  </Text>
                </div>
              ),
            },
            {
              key: 'rows',
              header: 'Report rows',
              align: 'right',
              render: (row) => row.parameters.length,
            },
            {
              key: 'price',
              header: 'Price',
              align: 'right',
              render: (row) => <Money amount={row.price} />,
            },
            {
              key: 'active',
              header: 'Status',
              render: (row) => (
                <StatusBadge
                  status={row.is_active ? 'ACTIVE' : 'INACTIVE'}
                  label={row.is_active ? 'Offered' : 'Not offered'}
                />
              ),
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              width: 64,
              render: (row) => (
                <Tooltip label="Edit">
                  <ActionIcon
                    variant="subtle"
                    color="grey"
                    aria-label={`Edit ${row.name}`}
                    onClick={() => setEditing(row)}
                  >
                    <Pencil size={16} />
                  </ActionIcon>
                </Tooltip>
              ),
            },
          ]}
        />
      </Card>
      {editing && (
        <LabTestForm
          labTest={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

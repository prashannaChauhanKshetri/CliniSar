/** Medicines with their stock (unexpired batches only) and a "Low stock" badge. */
import { Button, Card, Group, SegmentedControl, Text, TextInput } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { medicinesApi } from '../../api/resources'
import { DataTable } from '../../components/DataTable'
import { Money } from '../../components/Money'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'
import { useListState } from '../../lib/useListState'
import { MedicineForm } from './MedicineForm'

export function MedicinesPage() {
  const list = useListState()
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const filters = { page: list.page, search: list.get('search'), low_stock: list.get('low_stock') }
  const query = useQuery({
    queryKey: ['medicines', filters],
    queryFn: () => medicinesApi.list(filters),
  })

  return (
    <>
      <PageHeader
        title="Medicines"
        description="Stock counts only batches that have not expired."
        actions={
          <Button leftSection={<Plus size={16} />} onClick={() => setAdding(true)}>
            Add medicine
          </Button>
        }
      />
      <Card>
        <Group mb="md" gap="md">
          <TextInput
            placeholder="Search medicines"
            leftSection={<Search size={16} />}
            defaultValue={filters.search}
            onChange={(e) => list.setFilter('search', e.currentTarget.value)}
            aria-label="Search medicines"
            w={280}
          />
          <SegmentedControl
            value={filters.low_stock === 'true' ? 'low' : 'all'}
            onChange={(value) => list.setFilter('low_stock', value === 'low' ? 'true' : null)}
            data={[
              { value: 'all', label: 'All' },
              { value: 'low', label: 'Low stock' },
            ]}
          />
        </Group>
        <DataTable
          caption="Medicines"
          rows={query.data?.results}
          rowKey={(row) => row.id}
          loading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          onRowClick={(row) => navigate(`/medicines/${row.id}`)}
          empty={{ title: filters.low_stock ? 'Nothing is low on stock' : 'No medicines found' }}
          pagination={{ page: list.page, total: query.data?.count ?? 0, onChange: list.setPage }}
          columns={[
            {
              key: 'name',
              header: 'Medicine',
              render: (row) => (
                <div>
                  <Text size="sm" fw={500}>
                    {row.name} {row.strength}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {[row.generic_name, row.form].filter(Boolean).join(' · ') || '—'}
                  </Text>
                </div>
              ),
            },
            {
              key: 'price',
              header: 'Price per unit',
              align: 'right',
              render: (row) => <Money amount={row.unit_price} />,
            },
            {
              key: 'stock',
              header: 'In stock',
              align: 'right',
              render: (row) => (
                <Group gap="sm" justify="flex-end" wrap="nowrap">
                  {row.is_low_stock && <StatusBadge status="LOW_STOCK" label="Low stock" />}
                  <Text size="sm" fw={600} className="tabular-numbers">
                    {row.available_stock}
                  </Text>
                </Group>
              ),
            },
            {
              key: 'reorder',
              header: 'Reorder at',
              align: 'right',
              render: (row) => row.reorder_level,
            },
          ]}
        />
      </Card>
      {adding && (
        <MedicineForm
          medicine={null}
          onClose={() => setAdding(false)}
          // Open the new medicine with "Record purchase" ready: stock is the next step.
          onSaved={(saved) =>
            navigate(`/medicines/${saved.id}`, { state: { recordPurchase: true } })
          }
        />
      )}
    </>
  )
}

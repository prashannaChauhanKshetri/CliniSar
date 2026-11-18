/** Batches that expire within 90 days, and expired batches still holding stock. */
import { Anchor, Button, Card, Group, SegmentedControl, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { batchesApi, type Batch } from '../../api/resources'
import { DataTable } from '../../components/DataTable'
import { DateText } from '../../components/DateText'
import { PageHeader } from '../../components/PageHeader'
import { useListState } from '../../lib/useListState'
import { AdjustDialog } from './BatchDialogs'
import { ExpiryBadge } from './ExpiryBadge'

export function ExpiryPage() {
  const list = useListState()
  const view = list.get('view') === 'expired' ? 'expired' : 'soon'
  const [writingOff, setWritingOff] = useState<Batch | null>(null)
  const filters =
    view === 'expired'
      ? { expired: true, page: list.page }
      : { expiring_within: 90, page: list.page }
  const query = useQuery({
    queryKey: ['batches', filters],
    queryFn: () => batchesApi.list(filters),
  })

  return (
    <>
      <PageHeader
        title="Expiry"
        description="Expired batches are never dispensed and do not count as stock. Write them off to clear them."
      />
      <Card>
        <Group mb="md">
          <SegmentedControl
            value={view}
            onChange={(value) => list.setFilter('view', value === 'expired' ? 'expired' : null)}
            data={[
              { value: 'soon', label: 'Expiring within 90 days' },
              { value: 'expired', label: 'Expired' },
            ]}
          />
        </Group>
        <DataTable
          caption={view === 'expired' ? 'Expired batches' : 'Batches expiring soon'}
          rows={query.data?.results}
          rowKey={(row) => row.id}
          loading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          empty={{
            title: view === 'expired' ? 'No expired stock' : 'Nothing expires in the next 90 days',
          }}
          pagination={{ page: list.page, total: query.data?.count ?? 0, onChange: list.setPage }}
          columns={[
            {
              key: 'medicine',
              header: 'Medicine',
              render: (row) => (
                <Anchor component={Link} to={`/medicines/${row.medicine}`} size="sm">
                  {row.medicine_name}
                </Anchor>
              ),
            },
            { key: 'batch', header: 'Batch', render: (row) => row.batch_number },
            {
              key: 'expiry',
              header: 'Expiry',
              render: (row) => (
                <Group gap="sm" wrap="nowrap">
                  <DateText iso={row.expiry_date} />
                  <ExpiryBadge status={row.expiry_status} />
                </Group>
              ),
            },
            {
              key: 'quantity',
              header: 'Units left',
              align: 'right',
              render: (row) => (
                <Text size="sm" className="tabular-numbers">
                  {row.quantity}
                </Text>
              ),
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (row) =>
                row.expiry_status === 'EXPIRED' && (
                  <Button
                    size="xs"
                    variant="light"
                    color="danger"
                    onClick={() => setWritingOff(row)}
                  >
                    Write off
                  </Button>
                ),
            },
          ]}
        />
      </Card>
      {writingOff && (
        <AdjustDialog batch={writingOff} writeOff onClose={() => setWritingOff(null)} />
      )}
    </>
  )
}

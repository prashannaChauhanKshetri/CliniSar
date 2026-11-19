/** One medicine: its batches (with expiry badges), purchases, adjustments and history. */
import {
  ActionIcon,
  Button,
  Card,
  Group,
  Skeleton,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { PackagePlus, Pencil, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { medicinesApi, type Batch } from '../../api/resources'
import { DataTable } from '../../components/DataTable'
import { DateText } from '../../components/DateText'
import { DetailList } from '../../components/DetailList'
import { ErrorState } from '../../components/ErrorState'
import { Money } from '../../components/Money'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'
import { formatNepalTime } from '../../lib/date'
import { statusLabel } from '../../lib/labels'
import { useListState } from '../../lib/useListState'
import { AdjustDialog, PurchaseDialog } from './BatchDialogs'
import { ExpiryBadge } from './ExpiryBadge'
import { MedicineForm } from './MedicineForm'

export function MedicineDetailPage() {
  const { id = '' } = useParams()
  const list = useListState()
  const [editing, setEditing] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  // Just added on the list page: open "Record purchase" straight away.
  const [buying, setBuying] = useState(
    (location.state as { recordPurchase?: boolean } | null)?.recordPurchase === true,
  )
  const [adjusting, setAdjusting] = useState<Batch | null>(null)
  const medicine = useQuery({ queryKey: ['medicines', id], queryFn: () => medicinesApi.get(id) })
  const batches = useQuery({
    queryKey: ['batches', { medicine: id }],
    queryFn: () => medicinesApi.batches(id, { page_size: 100 }),
  })
  const history = useQuery({
    queryKey: ['medicines', id, 'movements', list.page],
    queryFn: () => medicinesApi.movements(id, { page: list.page }),
  })

  if (medicine.error)
    return <ErrorState error={medicine.error} onRetry={() => void medicine.refetch()} />
  if (!medicine.data) return <Skeleton h={320} radius="lg" />
  const m = medicine.data

  return (
    <>
      <PageHeader
        title={`${m.name} ${m.strength}`}
        description={[m.generic_name, m.form].filter(Boolean).join(' · ')}
        back={{ to: '/medicines', label: 'Medicines' }}
        actions={
          <Group gap="sm">
            <Button
              variant="default"
              leftSection={<Pencil size={16} />}
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
            <Button leftSection={<PackagePlus size={16} />} onClick={() => setBuying(true)}>
              Record purchase
            </Button>
          </Group>
        }
      />
      <Stack gap="lg">
        <Card>
          <DetailList
            cols={4}
            items={[
              [
                'In stock (not expired)',
                <Group key="s" gap="sm">
                  <Text fw={600}>{m.available_stock} units</Text>
                  {m.is_low_stock && <StatusBadge status="LOW_STOCK" label="Low stock" />}
                </Group>,
              ],
              ['Price per unit', <Money key="p" amount={m.unit_price} />],
              ['Reorder at', `${m.reorder_level} units`],
            ]}
          />
        </Card>
        <Card>
          <Title order={2} fz={16} mb="md">
            Batches
          </Title>
          <DataTable
            caption="Batches"
            rows={batches.data?.results}
            rowKey={(row) => row.id}
            loading={batches.isPending}
            error={batches.error}
            empty={{
              title: 'No stock yet',
              description: 'Record a purchase to add the first batch.',
            }}
            columns={[
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
                width: 64,
                render: (row) => (
                  <Tooltip label="Adjust stock">
                    <ActionIcon
                      variant="subtle"
                      color="grey"
                      aria-label={`Adjust batch ${row.batch_number}`}
                      onClick={() => setAdjusting(row)}
                    >
                      <SlidersHorizontal size={16} />
                    </ActionIcon>
                  </Tooltip>
                ),
              },
            ]}
          />
        </Card>
        <Card>
          <Title order={2} fz={16} mb="md">
            Stock history
          </Title>
          <DataTable
            caption="Stock history"
            rows={history.data?.results}
            rowKey={(row) => row.id}
            loading={history.isPending}
            error={history.error}
            empty={{ title: 'No stock changes yet' }}
            pagination={{
              page: list.page,
              total: history.data?.count ?? 0,
              onChange: list.setPage,
            }}
            columns={[
              { key: 'when', header: 'When', render: (row) => formatNepalTime(row.created_at) },
              { key: 'batch', header: 'Batch', render: (row) => row.batch_number },
              { key: 'reason', header: 'Type', render: (row) => statusLabel(row.reason) },
              {
                key: 'change',
                header: 'Change',
                align: 'right',
                render: (row) => (
                  <Text
                    size="sm"
                    fw={600}
                    c={row.change > 0 ? 'success.6' : 'danger.6'}
                    className="tabular-numbers"
                  >
                    {row.change > 0 ? '+' : ''}
                    {row.change}
                  </Text>
                ),
              },
              { key: 'note', header: 'Note', render: (row) => row.note || '—' },
              { key: 'by', header: 'By', render: (row) => row.created_by_name },
            ]}
          />
        </Card>
      </Stack>
      {editing && <MedicineForm medicine={m} onClose={() => setEditing(false)} />}
      {buying && (
        <PurchaseDialog
          medicine={m}
          onClose={() => {
            setBuying(false)
            // Forget the "just added" note so a page refresh does not reopen the dialog.
            if (location.state) void navigate(location.pathname, { replace: true, state: null })
          }}
        />
      )}
      {adjusting && <AdjustDialog batch={adjusting} onClose={() => setAdjusting(null)} />}
    </>
  )
}

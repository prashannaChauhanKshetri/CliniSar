/** Bills: created automatically by visits, dispensing and lab orders. */
import { Card, Group, Select, Text, TextInput } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useNavigate } from 'react-router'
import { invoicesApi } from '../../api/resources'
import { DataTable } from '../../components/DataTable'
import { DateText } from '../../components/DateText'
import { Money } from '../../components/Money'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'
import { billNumber, SOURCE_LABELS } from '../../lib/bills'
import { nepalDateOf } from '../../lib/date'
import { useListState } from '../../lib/useListState'
import { useAuth } from '../auth/useAuth'

export function InvoicesPage() {
  const { user } = useAuth()
  const seesAllSources = user?.role === 'CLINIC_ADMIN' || user?.role === 'STAFF'
  const list = useListState()
  const navigate = useNavigate()
  const filters = {
    page: list.page,
    status: list.get('status'),
    source: list.get('source'),
    search: list.get('search'),
  }
  const query = useQuery({
    queryKey: ['invoices', filters],
    queryFn: () => invoicesApi.list(filters),
  })

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Bills are created automatically; take payment or print them here."
      />
      <Card>
        <Group mb="md" gap="md">
          <TextInput
            placeholder="Patient name or phone"
            leftSection={<Search size={16} />}
            defaultValue={filters.search}
            onChange={(e) => list.setFilter('search', e.currentTarget.value)}
            aria-label="Search bills by patient"
            w={260}
          />
          <Select
            placeholder="Any status"
            aria-label="Status"
            data={[
              { value: 'UNPAID', label: 'Unpaid' },
              { value: 'PAID', label: 'Paid' },
              { value: 'CANCELLED', label: 'Cancelled' },
            ]}
            value={filters.status || null}
            onChange={(v) => list.setFilter('status', v)}
            clearable
            w={160}
          />
          {seesAllSources && (
            <Select
              placeholder="All kinds"
              aria-label="Kind of bill"
              data={Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label }))}
              value={filters.source || null}
              onChange={(v) => list.setFilter('source', v)}
              clearable
              w={180}
            />
          )}
        </Group>
        <DataTable
          caption="Invoices"
          rows={query.data?.results}
          rowKey={(row) => row.id}
          loading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          onRowClick={(row) => navigate(`/invoices/${row.id}`)}
          empty={{
            title: 'No bills found',
            description: 'Change the filters, or check the spelling of the name.',
          }}
          pagination={{ page: list.page, total: query.data?.count ?? 0, onChange: list.setPage }}
          columns={[
            {
              key: 'number',
              header: 'Bill No.',
              render: (row) => (
                <Text size="sm" fw={600}>
                  {billNumber(row)}
                </Text>
              ),
            },
            {
              key: 'date',
              header: 'Date',
              render: (row) => <DateText iso={nepalDateOf(row.created_at)} />,
            },
            { key: 'patient', header: 'Patient', render: (row) => row.patient_name },
            {
              key: 'source',
              header: 'For',
              render: (row) => (
                <StatusBadge status={row.source} label={SOURCE_LABELS[row.source]} />
              ),
            },
            {
              key: 'total',
              header: 'Total',
              align: 'right',
              render: (row) => <Money amount={row.total} fw={600} />,
            },
            {
              key: 'status',
              header: 'Status',
              render: (row) => <StatusBadge status={row.status} />,
            },
          ]}
        />
      </Card>
    </>
  )
}

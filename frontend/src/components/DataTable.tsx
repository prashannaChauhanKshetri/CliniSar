/**
 * Every list in CliniSar uses this table, so they all behave the same way: the same
 * loading skeleton, empty message, error message with "Try again", and pagination.
 */
import { EmptyState, Group, Pagination, Skeleton, Table, Text } from '@mantine/core'
import { Inbox } from 'lucide-react'
import type { ReactNode } from 'react'
import { ErrorState } from './ErrorState'

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  align?: 'left' | 'right' | 'center'
  width?: number | string
}

interface DataTableProps<T> {
  /** Read by screen readers, e.g. "Patients". */
  caption: string
  columns: Column<T>[]
  rows: T[] | undefined
  rowKey: (row: T) => string
  loading?: boolean
  error?: unknown
  onRetry?: () => void
  empty: { title: string; description?: string; action?: ReactNode }
  /** Page numbers start at 1. Leave out for lists without pages. */
  pagination?: { page: number; total: number; pageSize?: number; onChange: (page: number) => void }
  onRowClick?: (row: T) => void
}

const SKELETON_ROWS = 5

export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  loading = false,
  error,
  onRetry,
  empty,
  pagination,
  onRowClick,
}: DataTableProps<T>) {
  if (error) return <ErrorState error={error} onRetry={onRetry} />

  if (!loading && rows && rows.length === 0) {
    return (
      <EmptyState
        icon={<Inbox size={28} />}
        title={empty.title}
        description={empty.description}
        py="xl"
      >
        {empty.action}
      </EmptyState>
    )
  }

  return (
    <>
      <Table.ScrollContainer minWidth={640}>
        <Table aria-busy={loading}>
          <Table.Caption
            style={{ captionSide: 'top', textAlign: 'left' }}
            className="visually-hidden"
          >
            {caption}
          </Table.Caption>
          <Table.Thead bg="var(--clinisar-page)">
            <Table.Tr>
              {columns.map((column) => (
                <Table.Th key={column.key} ta={column.align} w={column.width} fz="sm" fw={600}>
                  {column.header}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {loading
              ? Array.from({ length: SKELETON_ROWS }, (_, index) => (
                  <Table.Tr key={index}>
                    {columns.map((column) => (
                      <Table.Td key={column.key}>
                        <Skeleton height={14} radius="sm" />
                      </Table.Td>
                    ))}
                  </Table.Tr>
                ))
              : rows?.map((row) => (
                  <Table.Tr
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    style={onRowClick ? { cursor: 'pointer' } : undefined}
                  >
                    {columns.map((column) => (
                      <Table.Td key={column.key} ta={column.align} fz="sm">
                        {column.render(row)}
                      </Table.Td>
                    ))}
                  </Table.Tr>
                ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {pagination && !loading && <TableFooter {...pagination} />}
    </>
  )
}

function TableFooter({
  page,
  total,
  pageSize = 20,
  onChange,
}: {
  page: number
  total: number
  pageSize?: number
  onChange: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)
  return (
    <Group justify="space-between" mt="md" gap="md">
      <Text size="sm" c="dimmed" className="tabular-numbers">
        Showing {first}–{last} of {total}
      </Text>
      <Pagination total={pages} value={page} onChange={onChange} size="sm" hideWithOnePage />
    </Group>
  )
}

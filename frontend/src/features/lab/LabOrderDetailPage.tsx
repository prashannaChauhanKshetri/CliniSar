/**
 * One lab order. The lab technician moves it forward: sample collected -> results
 * entered (a value and normal/abnormal for every row) -> completed, then prints it.
 */
import {
  Alert,
  Anchor,
  Button,
  Card,
  FileInput,
  Group,
  SegmentedControl,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileCheck, Printer, TestTube, Upload, X } from 'lucide-react'
import { Fragment, useState } from 'react'
import { useParams } from 'react-router'
import { getErrorMessage } from '../../api/errors'
import {
  labOrdersApi,
  type LabOrder,
  type LabOrderItem,
  type ResultInput,
} from '../../api/resources'
import { DetailList } from '../../components/DetailList'
import { ErrorState } from '../../components/ErrorState'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'
import { formatNepalTime } from '../../lib/date'
import { notifyError, notifySuccess } from '../../lib/notify'
import { ageSex } from '../../lib/people'
import { CancelWithReason } from '../appointments/CancelWithReason'
import { useAuth } from '../auth/useAuth'
import { BillLink } from '../billing/BillLink'

export function LabOrderDetailPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [cancelling, setCancelling] = useState(false)
  const query = useQuery({ queryKey: ['lab-orders', id], queryFn: () => labOrdersApi.get(id) })
  const update = (order: LabOrder) => {
    queryClient.setQueryData(['lab-orders', id], order)
    void queryClient.invalidateQueries({ queryKey: ['lab-orders'] })
  }
  const collect = useMutation({
    mutationFn: () => labOrdersApi.collect(id),
    onSuccess: (order) => {
      update(order)
      notifySuccess(
        `Sample for Lab No. ${order.lab_number} recorded. Enter the results when ready.`,
      )
    },
    onError: (error) => notifyError(error),
  })
  const cancel = useMutation({
    mutationFn: (reason: string) => labOrdersApi.cancel(id, reason),
    onSuccess: (order) => {
      update(order)
      setCancelling(false)
      notifySuccess(`Lab No. ${order.lab_number} cancelled; its unpaid bill was cancelled too.`)
      void queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
    onError: (error) => notifyError(error),
  })

  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  if (!query.data) return <Skeleton h={320} radius="lg" />
  const order = query.data
  const isLab = user?.role === 'LAB_TECHNICIAN'

  return (
    <>
      <PageHeader
        title={`Lab No. ${order.lab_number}: ${order.patient_name}`}
        description={`${ageSex(order.patient_age, order.patient_gender)} · Consultant: ${order.consultant}`}
        back={{ to: '/lab-orders', label: 'Lab orders' }}
        actions={
          <Group gap="sm">
            <BillLink filter={{ lab_order: id }} />
            {order.status === 'COMPLETED' && (
              <Button
                component="a"
                href={`/print/lab-order/${id}`}
                target="_blank"
                variant="default"
                leftSection={<Printer size={16} />}
              >
                Print report
              </Button>
            )}
            {isLab && order.status === 'ORDERED' && (
              <>
                <Button
                  variant="default"
                  color="danger"
                  leftSection={<X size={16} />}
                  onClick={() => setCancelling(true)}
                >
                  Cancel order
                </Button>
                <Button
                  leftSection={<TestTube size={16} />}
                  loading={collect.isPending}
                  onClick={() => collect.mutate()}
                >
                  Sample collected
                </Button>
              </>
            )}
          </Group>
        }
      />
      <Stack gap="lg">
        <Card>
          <DetailList
            cols={4}
            items={[
              ['Status', <StatusBadge key="s" status={order.status} />],
              ['Ordered', `${formatNepalTime(order.created_at)} by ${order.ordered_by_name}`],
              ['Sample collected', order.collected_at ? formatNepalTime(order.collected_at) : ''],
              [
                'Completed',
                order.completed_at
                  ? `${formatNepalTime(order.completed_at)} by ${order.completed_by_name}`
                  : '',
              ],
            ]}
          />
          {order.status === 'CANCELLED' && (
            <Text size="sm" mt="md" c="danger.6">
              Cancelled: {order.cancel_reason}
            </Text>
          )}
          {order.file && (
            <Anchor
              href={order.file}
              target="_blank"
              rel="noreferrer"
              size="sm"
              mt="md"
              display="block"
            >
              Open the attached file
            </Anchor>
          )}
        </Card>
        {order.status === 'SAMPLE_COLLECTED' && isLab ? (
          <ResultsForm order={order} onDone={update} />
        ) : (
          order.items.map((item) => <ResultsCard key={item.id} item={item} />)
        )}
      </Stack>
      <CancelWithReason
        opened={cancelling}
        title="Cancel this lab order?"
        message="Only possible before the sample is taken. An unpaid bill for it is cancelled too."
        loading={cancel.isPending}
        onConfirm={(reason) => cancel.mutate(reason)}
        onClose={() => setCancelling(false)}
      />
    </>
  )
}

/** Rows grouped by section, so sub-headings appear once, as on the printed report. */
function withSectionHeadings<T extends { section: string }>(
  rows: T[],
): { heading: string | null; row: T }[] {
  let current = ''
  return rows.map((row) => {
    const heading = row.section && row.section !== current ? row.section : null
    current = row.section
    return { heading, row }
  })
}

function ResultsCard({ item }: { item: LabOrderItem }) {
  return (
    <Card>
      <Title order={2} fz={16}>
        {item.lab_test_name}
      </Title>
      <Text size="xs" c="dimmed" mb="md">
        {[item.category, item.method, item.specimen && `Specimen: ${item.specimen}`]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      {item.results.length === 0 ? (
        <Text size="sm" c="dimmed">
          No results yet.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={560}>
          <Table>
            <Table.Thead bg="var(--clinisar-page)">
              <Table.Tr>
                <Table.Th>Test</Table.Th>
                <Table.Th>Result</Table.Th>
                <Table.Th>Unit</Table.Th>
                <Table.Th>Reference range</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {withSectionHeadings(item.results).map(({ heading, row }) => (
                <Fragment key={row.id}>
                  {heading && (
                    <Table.Tr>
                      <Table.Td colSpan={4} fw={600} fz="sm">
                        {heading}
                      </Table.Td>
                    </Table.Tr>
                  )}
                  <Table.Tr>
                    <Table.Td fz="sm" pl={row.section ? 'xl' : undefined}>
                      {row.name}
                    </Table.Td>
                    <Table.Td
                      fz="sm"
                      fw={row.flag === 'ABNORMAL' ? 700 : 400}
                      c={row.flag === 'ABNORMAL' ? 'danger.6' : undefined}
                    >
                      {row.value}
                      {row.flag === 'ABNORMAL' && ' (abnormal)'}
                    </Table.Td>
                    <Table.Td fz="sm">{row.unit}</Table.Td>
                    <Table.Td fz="sm">{row.reference_range}</Table.Td>
                  </Table.Tr>
                </Fragment>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      {item.interpretation && (
        <Text size="xs" c="dimmed" mt="md">
          {item.interpretation}
        </Text>
      )}
    </Card>
  )
}

type Entry = { value: string; flag: 'NORMAL' | 'ABNORMAL' }

/** Enter a value and normal/abnormal for every row of every test, then complete. */
function ResultsForm({ order, onDone }: { order: LabOrder; onDone: (order: LabOrder) => void }) {
  const allRows = order.items.flatMap((item) => item.parameters)
  const [entries, setEntries] = useState<Record<string, Entry>>(() =>
    Object.fromEntries(allRows.map((p) => [p.id, { value: '', flag: 'NORMAL' }])),
  )
  const [file, setFile] = useState<File | null>(null)
  const [missing, setMissing] = useState<string[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const set = (id: string, change: Partial<Entry>) => {
    setEntries((current) => ({ ...current, [id]: { ...current[id], ...change } }))
    // Clear "Required" as soon as the row is filled in.
    if (change.value?.trim()) setMissing((current) => current.filter((rowId) => rowId !== id))
  }
  const complete = useMutation({
    mutationFn: (results: ResultInput[]) => labOrdersApi.complete(order.id, results, file),
    onSuccess: (done) => {
      onDone(done)
      notifySuccess(
        `Results for Lab No. ${done.lab_number} saved. The report can be printed.`,
        'Completed',
      )
    },
    onError: (error) => setProblem(getErrorMessage(error)),
  })

  function submit() {
    const empty = allRows.filter((p) => !entries[p.id].value.trim()).map((p) => p.id)
    setMissing(empty)
    if (empty.length) return setProblem(`Enter a result in every row (${empty.length} empty).`)
    if (file && file.size > 10 * 1024 * 1024) return setProblem('The file is larger than 10 MB.')
    setProblem(null)
    complete.mutate(
      allRows.map((p) => ({
        parameter: p.id,
        value: entries[p.id].value.trim(),
        flag: entries[p.id].flag,
      })),
    )
  }

  return (
    <Card>
      <Stack gap="lg">
        <Title order={2} fz={16}>
          Enter results
        </Title>
        {order.items.map((item) => (
          <Stack key={item.id} gap="xs">
            <Text fw={600} size="sm">
              {item.lab_test_name}
            </Text>
            <Table.ScrollContainer minWidth={720}>
              <Table verticalSpacing={6} highlightOnHover={false}>
                <Table.Thead bg="var(--clinisar-page)">
                  <Table.Tr>
                    <Table.Th>Test</Table.Th>
                    <Table.Th w={180}>Result</Table.Th>
                    <Table.Th>Unit</Table.Th>
                    <Table.Th>Reference range</Table.Th>
                    <Table.Th w={210}>Flag</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {withSectionHeadings(item.parameters).map(({ heading, row }) => (
                    <Fragment key={row.id}>
                      {heading && (
                        <Table.Tr>
                          <Table.Td colSpan={5} fw={600} fz="sm">
                            {heading}
                          </Table.Td>
                        </Table.Tr>
                      )}
                      <Table.Tr>
                        <Table.Td fz="sm" pl={row.section ? 'xl' : undefined}>
                          {row.name}
                        </Table.Td>
                        <Table.Td>
                          <TextInput
                            size="xs"
                            aria-label={`${row.name} result`}
                            value={entries[row.id].value}
                            error={missing.includes(row.id) ? 'Required' : undefined}
                            onChange={(e) => set(row.id, { value: e.currentTarget.value })}
                          />
                        </Table.Td>
                        <Table.Td fz="sm">{row.unit}</Table.Td>
                        <Table.Td fz="sm">{row.reference_range}</Table.Td>
                        <Table.Td>
                          <SegmentedControl
                            size="xs"
                            fullWidth
                            aria-label={`${row.name} flag`}
                            color={entries[row.id].flag === 'ABNORMAL' ? 'danger' : 'success'}
                            value={entries[row.id].flag}
                            onChange={(flag) => set(row.id, { flag: flag as Entry['flag'] })}
                            data={[
                              { value: 'NORMAL', label: 'Normal' },
                              { value: 'ABNORMAL', label: 'Abnormal' },
                            ]}
                          />
                        </Table.Td>
                      </Table.Tr>
                    </Fragment>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Stack>
        ))}
        <FileInput
          label="Attach the machine print-out (optional)"
          description="PDF, JPG or PNG, up to 10 MB."
          accept="application/pdf,image/jpeg,image/png"
          leftSection={<Upload size={16} />}
          clearable
          value={file}
          onChange={setFile}
          w={420}
          maw="100%"
        />
        {problem && (
          <Alert color="danger" variant="light" role="alert">
            {problem}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button
            leftSection={<FileCheck size={16} />}
            loading={complete.isPending}
            onClick={submit}
          >
            Save results
          </Button>
        </Group>
      </Stack>
    </Card>
  )
}

/** One bill: its lines and totals, taking payment, cancelling and printing. */
import {
  Alert,
  Button,
  Card,
  Divider,
  Group,
  NumberInput,
  SegmentedControl,
  Skeleton,
  Stack,
  Table,
  Text,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Banknote, Eye, Info, Printer, ReceiptText, X } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router'
import { invoicesApi, type Invoice, type PaymentMethod } from '../../api/resources'
import { DetailList } from '../../components/DetailList'
import { ErrorState } from '../../components/ErrorState'
import { FormModal } from '../../components/FormModal'
import { Money } from '../../components/Money'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'
import { billNumber, SOURCE_LABELS, totalLines } from '../../lib/bills'
import { formatBS, formatNepalTime, nepalDateOf } from '../../lib/date'
import { formatRs } from '../../lib/money'
import { notifyError, notifySuccess } from '../../lib/notify'
import { CancelWithReason } from '../appointments/CancelWithReason'
import { useAuth } from '../auth/useAuth'

export function InvoiceDetailPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [paying, setPaying] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const query = useQuery({ queryKey: ['invoices', id], queryFn: () => invoicesApi.get(id) })
  const cancel = useMutation({
    mutationFn: (reason: string) => invoicesApi.cancel(id, reason),
    onSuccess: (bill) => {
      queryClient.setQueryData(['invoices', id], bill)
      void queryClient.invalidateQueries({ queryKey: ['invoices'] })
      setCancelling(false)
      notifySuccess(`Bill ${billNumber(bill)} was cancelled.`)
    },
    onError: (error) => notifyError(error),
  })
  // EN: The admin confirms having seen a cancellation made by the front desk.
  // NP: Front desk le bill cancel garyo bhane admin le yaha "Seen" thichcha, ani bell
  //     bata hatcha.
  const markReviewed = useMutation({
    mutationFn: () => invoicesApi.markReviewed(id),
    onSuccess: (bill) => {
      queryClient.setQueryData(['invoices', id], bill)
      void queryClient.invalidateQueries({ queryKey: ['invoices'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      notifySuccess('Marked as seen.')
    },
    onError: (error) => notifyError(error),
  })

  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  if (!query.data) return <Skeleton h={320} radius="lg" />
  const bill = query.data
  const canCancel =
    bill.status === 'UNPAID' && (user?.role === 'CLINIC_ADMIN' || user?.role === 'STAFF')

  return (
    <>
      <PageHeader
        title={`Bill ${billNumber(bill)}`}
        description={`${bill.issuer_name} · ${SOURCE_LABELS[bill.source]} · ${formatBS(nepalDateOf(bill.created_at))}`}
        back={{ to: '/invoices', label: 'Invoices' }}
        actions={
          <Group gap="sm">
            <Button
              component="a"
              href={`/print/invoice/${id}`}
              target="_blank"
              variant="default"
              leftSection={<Printer size={16} />}
            >
              Print A4
            </Button>
            {bill.status === 'PAID' && (
              <Button
                component="a"
                href={`/print/receipt/${id}`}
                target="_blank"
                variant="default"
                leftSection={<ReceiptText size={16} />}
              >
                Print receipt
              </Button>
            )}
            {canCancel && (
              <Button
                variant="default"
                color="danger"
                leftSection={<X size={16} />}
                onClick={() => setCancelling(true)}
              >
                Cancel bill
              </Button>
            )}
            {bill.status === 'UNPAID' && (
              <Button leftSection={<Banknote size={16} />} onClick={() => setPaying(true)}>
                Take payment
              </Button>
            )}
          </Group>
        }
      />
      <Stack gap="lg">
        <Card>
          <DetailList
            cols={4}
            items={[
              ['Patient', bill.patient_name],
              ['Address', bill.patient_address],
              ['Status', <StatusBadge key="s" status={bill.status} />],
              [
                'Paid',
                bill.paid_at
                  ? `${formatNepalTime(bill.paid_at)} · ${bill.payment_method?.toLowerCase()} · received by ${bill.received_by_name}`
                  : '',
              ],
            ]}
          />
          {bill.status === 'CANCELLED' && (
            <Alert
              mt="md"
              color={bill.cancel_needs_review ? 'danger' : 'gray'}
              variant="light"
              icon={<X size={18} />}
              title={
                bill.cancel_needs_review
                  ? 'Cancelled, waiting for the admin to review'
                  : 'Cancelled'
              }
            >
              <Stack gap="sm" align="flex-start">
                <Text size="sm">
                  {bill.cancel_reason}
                  {bill.cancelled_by_name && (
                    <>
                      {' '}
                      · by {bill.cancelled_by_name}
                      {bill.cancelled_at && `, ${formatNepalTime(bill.cancelled_at)}`}
                    </>
                  )}
                </Text>
                {bill.cancel_needs_review && user?.role === 'CLINIC_ADMIN' && (
                  <Button
                    size="xs"
                    variant="white"
                    color="danger"
                    leftSection={<Eye size={14} />}
                    loading={markReviewed.isPending}
                    onClick={() => markReviewed.mutate()}
                  >
                    Seen
                  </Button>
                )}
              </Stack>
            </Alert>
          )}
        </Card>
        <Card>
          <Table.ScrollContainer minWidth={560}>
            <Table>
              <Table.Thead bg="var(--clinisar-page)">
                <Table.Tr>
                  <Table.Th w={56}>S.N.</Table.Th>
                  <Table.Th>Particular</Table.Th>
                  <Table.Th ta="right">Qty</Table.Th>
                  <Table.Th ta="right">Rate</Table.Th>
                  <Table.Th ta="right">Amount</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {bill.items.map((line, index) => (
                  <Table.Tr key={line.id}>
                    <Table.Td fz="sm">{index + 1}</Table.Td>
                    <Table.Td fz="sm">{line.description}</Table.Td>
                    <Table.Td fz="sm" ta="right">
                      {line.quantity}
                    </Table.Td>
                    <Table.Td ta="right">
                      <Money amount={line.unit_price} />
                    </Table.Td>
                    <Table.Td ta="right">
                      <Money amount={line.line_total} />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          <Totals bill={bill} />
        </Card>
      </Stack>
      {paying && <PayDialog bill={bill} onClose={() => setPaying(false)} />}
      <CancelWithReason
        opened={cancelling}
        title={`Cancel bill ${billNumber(bill)}?`}
        message="Only unpaid bills can be cancelled. A cancelled bill cannot be paid later."
        loading={cancel.isPending}
        onConfirm={(reason) => cancel.mutate(reason)}
        onClose={() => setCancelling(false)}
      />
    </>
  )
}

/** The bill's total lines, the same ones the printouts use (lib/bills.ts). */
export function Totals({ bill }: { bill: Invoice }) {
  return (
    <Stack gap={6} align="flex-end" mt="md">
      {totalLines(bill).map((line) => (
        <Stack key={line.label} gap={6} w={320} maw="100%">
          {line.strong && <Divider />}
          <Group justify="space-between">
            <Text size="sm" fw={line.strong ? 700 : 400} c={line.strong ? undefined : 'dimmed'}>
              {line.label}
            </Text>
            <Money
              amount={line.amount}
              fw={line.strong ? 700 : 500}
              size={line.strong ? 'md' : 'sm'}
            />
          </Group>
        </Stack>
      ))}
    </Stack>
  )
}

function PayDialog({ bill, onClose }: { bill: Invoice; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [method, setMethod] = useState<PaymentMethod>('CASH')
  const [discount, setDiscount] = useState<number | string>('')
  const [error, setError] = useState<string | null>(null)
  const pay = useMutation({
    mutationFn: () =>
      invoicesApi.pay(bill.id, {
        payment_method: method,
        ...(discount !== '' && Number(discount) > 0
          ? { discount: Number(discount).toFixed(2) }
          : {}),
      }),
    onSuccess: (paid) => {
      queryClient.setQueryData(['invoices', bill.id], paid)
      void queryClient.invalidateQueries({ queryKey: ['invoices'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      notifySuccess(
        `${formatRs(paid.total)} received for bill ${billNumber(paid)}. You can print the receipt now.`,
        'Payment received',
      )
      onClose()
    },
    onError: (e) => notifyError(e),
  })
  return (
    <FormModal
      opened
      onClose={onClose}
      size="md"
      title={`Take payment: bill ${billNumber(bill)}`}
      submitLabel="Payment received"
      submitting={pay.isPending}
      onSubmit={(event) => {
        event.preventDefault()
        if (Number(discount) > Number(bill.subtotal))
          return setError(`The discount cannot be more than ${formatRs(bill.subtotal)}.`)
        setError(null)
        pay.mutate()
      }}
    >
      <Text size="sm">
        Amount due:{' '}
        <Text span fw={700}>
          {formatRs(bill.total)}
        </Text>
      </Text>
      <SegmentedControl
        value={method}
        onChange={(v) => setMethod(v as PaymentMethod)}
        data={[
          { value: 'CASH', label: 'Cash' },
          { value: 'CARD', label: 'Card' },
          { value: 'WALLET', label: 'Wallet' },
        ]}
      />
      <NumberInput
        label="Discount (Rs.)"
        description="Optional"
        min={0}
        max={Number(bill.subtotal)}
        decimalScale={2}
        value={discount}
        onChange={setDiscount}
        error={error}
      />
      {discount !== '' && Number(discount) > 0 && (
        <Alert color="primary" variant="light" icon={<Info size={18} />}>
          The VAT and total are recalculated by the system after the discount.
        </Alert>
      )}
    </FormModal>
  )
}

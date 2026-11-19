/** One prescription: what was prescribed, and dispensing it (pharmacist). */
import { Alert, Button, Card, Group, Skeleton, Stack, Table, Text } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PackageCheck, Printer } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router'
import { getErrorMessage } from '../../api/errors'
import { prescriptionsApi } from '../../api/resources'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DateText } from '../../components/DateText'
import { DetailList } from '../../components/DetailList'
import { ErrorState } from '../../components/ErrorState'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'
import { formatNepalTime } from '../../lib/date'
import { notifySuccess } from '../../lib/notify'
import { ageSex } from '../../lib/people'
import { canDispense } from '../../lib/roles'
import { useAuth } from '../auth/useAuth'
import { BillLink } from '../billing/BillLink'

export function PrescriptionDetailPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const query = useQuery({
    queryKey: ['prescriptions', id],
    queryFn: () => prescriptionsApi.get(id),
  })
  const dispense = useMutation({
    mutationFn: () => prescriptionsApi.dispense(id),
    onSuccess: (done) => {
      queryClient.setQueryData(['prescriptions', id], done)
      void queryClient.invalidateQueries({ queryKey: ['prescriptions'] })
      void queryClient.invalidateQueries({ queryKey: ['invoices'] })
      void queryClient.invalidateQueries({ queryKey: ['medicines'] })
      setConfirming(false)
      notifySuccess(
        `Medicines handed over to ${done.patient_name}. The pharmacy bill is ready.`,
        'Dispensed',
      )
    },
    onError: (error) => {
      setConfirming(false)
      setProblem(getErrorMessage(error)) // e.g. "Not enough Cough Syrup 100ml: 20 needed, 8 in stock."
    },
  })

  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  if (!query.data) return <Skeleton h={320} radius="lg" />
  const prescription = query.data
  const dispensable = canDispense(user?.role) && prescription.status === 'PENDING'

  return (
    <>
      <PageHeader
        title={`Prescription: ${prescription.patient_name}`}
        description={`${ageSex(prescription.patient_age, prescription.patient_gender)} · Dr. ${prescription.doctor_name}`}
        back={{ to: '/prescriptions', label: 'Prescriptions' }}
        actions={
          <Group gap="sm">
            {prescription.status === 'DISPENSED' && <BillLink filter={{ prescription: id }} />}
            <Button
              component="a"
              href={`/print/prescription/${id}`}
              target="_blank"
              variant="default"
              leftSection={<Printer size={16} />}
            >
              Print
            </Button>
            {dispensable && (
              <Button leftSection={<PackageCheck size={16} />} onClick={() => setConfirming(true)}>
                Dispense
              </Button>
            )}
          </Group>
        }
      />
      <Stack gap="lg">
        {problem && (
          <Alert
            color="danger"
            variant="light"
            title="Could not dispense"
            withCloseButton
            onClose={() => setProblem(null)}
            role="alert"
          >
            {problem} Nothing was taken from stock. Record a purchase on the Medicines page, then
            try again.
          </Alert>
        )}
        <Card>
          <DetailList
            cols={4}
            items={[
              ['Visit', <DateText key="d" iso={prescription.visit_date} />],
              ['Diagnosis', prescription.diagnosis],
              [
                'Status',
                <StatusBadge
                  key="s"
                  status={prescription.status}
                  label={prescription.status === 'PENDING' ? 'Waiting' : 'Dispensed'}
                />,
              ],
              [
                'Dispensed',
                prescription.dispensed_at
                  ? `${formatNepalTime(prescription.dispensed_at)} by ${prescription.dispensed_by_name}`
                  : '',
              ],
            ]}
          />
          {prescription.notes && (
            <Text size="sm" mt="md">
              <Text span c="dimmed">
                Notes:{' '}
              </Text>
              {prescription.notes}
            </Text>
          )}
        </Card>
        <Card>
          <Table.ScrollContainer minWidth={640}>
            <Table>
              <Table.Thead bg="var(--clinisar-page)">
                <Table.Tr>
                  <Table.Th>Medicine</Table.Th>
                  <Table.Th>Dosage</Table.Th>
                  <Table.Th>How often</Table.Th>
                  <Table.Th ta="right">Days</Table.Th>
                  <Table.Th ta="right">Quantity</Table.Th>
                  <Table.Th>Instructions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {prescription.items.map((item) => (
                  <Table.Tr key={item.id}>
                    <Table.Td>
                      <Text size="sm" fw={500}>
                        {item.medicine_name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {item.medicine_form}
                      </Text>
                    </Table.Td>
                    <Table.Td fz="sm">{item.dosage}</Table.Td>
                    <Table.Td fz="sm">{item.frequency}</Table.Td>
                    <Table.Td ta="right" fz="sm">
                      {item.duration_days}
                    </Table.Td>
                    <Table.Td ta="right" fz="sm">
                      {item.quantity}
                    </Table.Td>
                    <Table.Td fz="sm">{item.instructions || '—'}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      </Stack>
      <ConfirmDialog
        opened={confirming}
        tone="primary"
        title="Dispense these medicines?"
        message="Stock is taken from the batches that expire first, and a pharmacy bill is created. Expired stock is never used. If anything is short, nothing changes."
        confirmLabel="Dispense"
        loading={dispense.isPending}
        onConfirm={() => dispense.mutate()}
        onClose={() => setConfirming(false)}
      />
    </>
  )
}

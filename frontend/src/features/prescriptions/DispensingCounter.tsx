/**
 * The pharmacy counter: waiting prescriptions on the left, the chosen one on the right
 * with its stock checked BEFORE dispensing, so a shortage shows up front instead of as
 * an error after pressing the button.
 */
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  EmptyState,
  Grid,
  Group,
  ScrollArea,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Banknote, PackageCheck, PackageX, Pill } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { invoicesApi, medicinesApi, prescriptionsApi, type Prescription } from '../../api/resources'
import { getErrorMessage } from '../../api/errors'
import { formatNepalTime } from '../../lib/date'
import { billNumber } from '../../lib/bills'
import { formatRs } from '../../lib/money'
import { notifySuccess } from '../../lib/notify'
import { ageSex } from '../../lib/people'
import { checkStock } from '../../lib/stock'
import classes from './DispensingCounter.module.css'

export function DispensingCounter() {
  const waiting = useQuery({
    queryKey: ['prescriptions', { status: 'PENDING', page_size: 50 }],
    queryFn: () => prescriptionsApi.list({ status: 'PENDING', page_size: 50 }),
    refetchInterval: 30_000,
  })
  const [chosenId, setChosenId] = useState<string | null>(null)
  const [justDone, setJustDone] = useState<Prescription | null>(null)
  const list = waiting.data?.results ?? []
  const chosen = list.find((p) => p.id === chosenId) ?? list[0] ?? null

  if (waiting.isPending) return <Skeleton h={360} radius="lg" />
  return (
    <Grid gap="lg">
      <Grid.Col span={{ base: 12, md: 5, lg: 4 }}>
        <Card padding="xs">
          <Group justify="space-between" px="sm" py="xs">
            <Text fw={600} size="sm">
              Waiting
            </Text>
            <Badge variant="light">{list.length}</Badge>
          </Group>
          {list.length === 0 ? (
            <EmptyState icon={<Pill size={24} />} title="Nobody waiting" size="sm" py="lg" />
          ) : (
            <ScrollArea.Autosize mah={560}>
              <Stack gap={2}>
                {list.map((p) => (
                  <UnstyledButton
                    key={p.id}
                    className={classes.item}
                    data-active={p.id === chosen?.id || undefined}
                    onClick={() => {
                      setChosenId(p.id)
                      setJustDone(null)
                    }}
                  >
                    <Group justify="space-between" wrap="nowrap" gap="sm">
                      <div style={{ minWidth: 0 }}>
                        <Text size="sm" fw={600} truncate="end">
                          {p.patient_name}
                        </Text>
                        <Text size="xs" c="dimmed" truncate="end">
                          Dr. {p.doctor_name} · {p.items.length}{' '}
                          {p.items.length === 1 ? 'medicine' : 'medicines'}
                        </Text>
                      </div>
                      <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                        {formatNepalTime(p.created_at).split(', ')[1]}
                      </Text>
                    </Group>
                  </UnstyledButton>
                ))}
              </Stack>
            </ScrollArea.Autosize>
          )}
        </Card>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 7, lg: 8 }}>
        {justDone ? (
          <DoneCard prescription={justDone} onNext={() => setJustDone(null)} />
        ) : chosen ? (
          <CounterDetail
            key={chosen.id}
            prescription={chosen}
            onDispensed={(done) => {
              setJustDone(done)
              setChosenId(null)
            }}
          />
        ) : (
          <Card>
            <Text c="dimmed" size="sm">
              Choose a prescription on the left.
            </Text>
          </Card>
        )}
      </Grid.Col>
    </Grid>
  )
}

function CounterDetail({
  prescription,
  onDispensed,
}: {
  prescription: Prescription
  onDispensed: (done: Prescription) => void
}) {
  const queryClient = useQueryClient()
  const [problem, setProblem] = useState<string | null>(null)
  const stockQueries = useQueries({
    queries: prescription.items.map((item) => ({
      queryKey: ['medicines', item.medicine],
      queryFn: () => medicinesApi.get(item.medicine),
    })),
  })
  const stockLoaded = stockQueries.every((q) => q.data)
  const available = Object.fromEntries(
    stockQueries.map((q, i) => [prescription.items[i].medicine, q.data?.available_stock]),
  )
  const checks = checkStock(prescription.items, available)
  const shortages = checks.filter((c) => c.short > 0)
  const dispense = useMutation({
    mutationFn: () => prescriptionsApi.dispense(prescription.id),
    onSuccess: (done) => {
      for (const key of ['prescriptions', 'medicines', 'invoices', 'dashboard'])
        void queryClient.invalidateQueries({ queryKey: [key] })
      notifySuccess(`Medicines handed over to ${done.patient_name}.`, 'Dispensed')
      onDispensed(done)
    },
    onError: (error) => setProblem(getErrorMessage(error)),
  })

  return (
    <Card>
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={2} fz={18}>
              {prescription.patient_name}
            </Title>
            <Text size="sm" c="dimmed">
              {ageSex(prescription.patient_age, prescription.patient_gender)} · Dr.{' '}
              {prescription.doctor_name} · {prescription.diagnosis}
            </Text>
          </div>
          <Anchor component={Link} to={`/prescriptions/${prescription.id}`} size="sm">
            Full prescription
          </Anchor>
        </Group>
        <Table.ScrollContainer minWidth={520}>
          <Table>
            <Table.Thead bg="var(--clinisar-page)">
              <Table.Tr>
                <Table.Th>Medicine</Table.Th>
                <Table.Th>Dose</Table.Th>
                <Table.Th ta="right">Give</Table.Th>
                <Table.Th ta="right">In stock</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {prescription.items.map((item, i) => {
                const check = checks[i]
                return (
                  <Table.Tr key={item.id}>
                    <Table.Td>
                      <Text size="sm" fw={500}>
                        {item.medicine_name}
                      </Text>
                      {item.instructions && (
                        <Text size="xs" c="dimmed">
                          {item.instructions}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td fz="sm">
                      {item.dosage} · {item.frequency} · {item.duration_days} days
                    </Table.Td>
                    <Table.Td ta="right" fz="sm" fw={600}>
                      {item.quantity}
                    </Table.Td>
                    <Table.Td ta="right">
                      {!stockLoaded ? (
                        <Skeleton h={14} w={40} ml="auto" />
                      ) : check.short > 0 ? (
                        <Anchor
                          component={Link}
                          to={`/medicines/${item.medicine}`}
                          size="sm"
                          c="danger.6"
                          fw={600}
                        >
                          {check.available} · short by {check.short}
                        </Anchor>
                      ) : (
                        <Text size="sm" c="success.7" className="tabular-numbers">
                          {check.available}
                        </Text>
                      )}
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {shortages.length > 0 && (
          <Alert color="danger" variant="light" icon={<PackageX size={18} />}>
            Not enough {shortages.map((s) => s.name).join(', ')}. Record a purchase on the
            medicine’s page first; nothing is taken from stock until everything is available.
          </Alert>
        )}
        {problem && (
          <Alert color="danger" variant="light" role="alert">
            {problem}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button
            leftSection={<PackageCheck size={16} />}
            disabled={!stockLoaded || shortages.length > 0}
            loading={dispense.isPending}
            onClick={() => dispense.mutate()}
          >
            Dispense
          </Button>
        </Group>
        <Text size="xs" c="dimmed" ta="right">
          Stock is taken from the batches that expire first. A bill is created.
        </Text>
      </Stack>
    </Card>
  )
}

/** After dispensing: the bill is ready, take payment now or go to the next patient. */
function DoneCard({ prescription, onNext }: { prescription: Prescription; onNext: () => void }) {
  const bill = useQuery({
    queryKey: ['invoices', { prescription: prescription.id }],
    queryFn: () => invoicesApi.list({ prescription: prescription.id }),
  })
  const invoice = bill.data?.results[0]
  return (
    <Card>
      <Stack gap="md" align="flex-start">
        <Title order={2} fz={18}>
          Dispensed to {prescription.patient_name}
        </Title>
        {invoice ? (
          <Text size="sm">
            Bill {billNumber(invoice)}: <b>{formatRs(invoice.total)}</b>
          </Text>
        ) : (
          <Skeleton h={14} w={160} />
        )}
        <Group>
          {invoice && (
            <Button
              component={Link}
              to={`/invoices/${invoice.id}`}
              leftSection={<Banknote size={16} />}
            >
              Take payment
            </Button>
          )}
          <Button variant="default" onClick={onNext}>
            Next prescription
          </Button>
        </Group>
      </Stack>
    </Card>
  )
}

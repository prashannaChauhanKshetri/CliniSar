/**
 * Who is waiting at the pharmacy counter (prescriptions not dispensed yet).
 *
 * EN: Front desk and pharmacy are one role since phase 12, so this list sits on the
 *     same "Today" screen as the visit queue, next to the work it belongs with.
 * NP: Pahila yo pharmacist ko chuttai dashboard ma thiyo. Aba front desk le nai ausadhi
 *     dine bhayepachi yahi rakheko, ekai screen ma queue ra pharmacy dubai dekhincha.
 */
import { Button, Card, Group, Stack, Text, Title } from '@mantine/core'
import { Pill } from 'lucide-react'
import { Link } from 'react-router'
import type { Paginated } from '../../api/types'
import type { Prescription } from '../../api/resources'
import { formatNepalTime } from '../../lib/date'

export function WaitingForMedicines({ waiting }: { waiting: Paginated<Prescription> | undefined }) {
  return (
    <Card padding="md">
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Title order={2} fz={16}>
          Waiting for medicines
        </Title>
        <Button component={Link} to="/prescriptions" size="xs" leftSection={<Pill size={14} />}>
          Open counter
        </Button>
      </Group>
      {waiting?.results.length ? (
        <Stack gap="sm">
          {waiting.results.map((p) => (
            <Group key={p.id} justify="space-between" wrap="nowrap" gap="sm">
              <div style={{ minWidth: 0 }}>
                <Text size="sm" fw={500} truncate="end">
                  {p.patient_name}
                </Text>
                <Text size="xs" c="dimmed" truncate="end">
                  Dr. {p.doctor_name} · {p.items.map((i) => i.medicine_name).join(', ')}
                </Text>
              </div>
              <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                {formatNepalTime(p.created_at).split(', ')[1]}
              </Text>
            </Group>
          ))}
        </Stack>
      ) : (
        <Text size="sm" c="dimmed">
          Nobody waiting.
        </Text>
      )}
    </Card>
  )
}

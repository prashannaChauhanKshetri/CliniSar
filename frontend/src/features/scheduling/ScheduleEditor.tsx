/**
 * A doctor's weekly working hours. Each block (e.g. Sunday 09:00-13:00, 20-minute
 * slots) decides which time slots can be booked. Used on "My schedule" (doctors) and
 * from the Doctors page (clinic admin).
 */
import {
  ActionIcon,
  Button,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { schedulesApi, type Schedule } from '../../api/resources'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ErrorState } from '../../components/ErrorState'
import { formatTime, showServerFieldErrors } from '../../lib/forms'
import { notifyError, notifySuccess } from '../../lib/notify'
import { getErrorMessage } from '../../api/errors'

/** Sunday first, as weeks are shown in Nepal. Numbers are the API's (Monday = 0). */
const WEEK = [
  { value: '6', label: 'Sunday' },
  { value: '0', label: 'Monday' },
  { value: '1', label: 'Tuesday' },
  { value: '2', label: 'Wednesday' },
  { value: '3', label: 'Thursday' },
  { value: '4', label: 'Friday' },
  { value: '5', label: 'Saturday' },
]

interface BlockValues {
  weekday: string
  start_time: string
  end_time: string
  slot_minutes: number
}

export function ScheduleEditor({
  doctorId,
  canEdit = true,
}: {
  doctorId: string
  canEdit?: boolean
}) {
  const queryClient = useQueryClient()
  const [removing, setRemoving] = useState<Schedule | null>(null)
  const key = ['schedules', doctorId]
  const query = useQuery({ queryKey: key, queryFn: () => schedulesApi.list(doctorId) })
  const form = useForm<BlockValues>({
    defaultValues: { weekday: '6', start_time: '09:00', end_time: '13:00', slot_minutes: 20 },
  })
  const [formError, setFormError] = useState<string | null>(null)

  const add = useMutation({
    mutationFn: (values: BlockValues) =>
      schedulesApi.create(doctorId, { ...values, weekday: Number(values.weekday) }),
    onSuccess: (block) => {
      notifySuccess(
        `${block.weekday_name} ${formatTime(block.start_time)}–${formatTime(block.end_time)} added.`,
      )
      setFormError(null)
      void queryClient.invalidateQueries({ queryKey: key })
    },
    onError: (error) => {
      if (
        !showServerFieldErrors(error, form.setError, [
          'weekday',
          'start_time',
          'end_time',
          'slot_minutes',
        ])
      ) {
        setFormError(getErrorMessage(error))
      }
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => schedulesApi.remove(doctorId, id),
    onSuccess: () => {
      notifySuccess('Working hours removed.')
      setRemoving(null)
      void queryClient.invalidateQueries({ queryKey: key })
    },
    onError: (error) => notifyError(error),
  })

  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  const blocks = query.data ?? []

  return (
    <Stack gap="lg">
      <Stack gap="sm">
        {WEEK.map((day) => {
          const today = blocks.filter((block) => String(block.weekday) === day.value)
          return (
            <Group key={day.value} gap="md" align="center" wrap="nowrap">
              <Text size="sm" fw={600} w={100}>
                {day.label}
              </Text>
              {today.length === 0 ? (
                <Text size="sm" c="dimmed">
                  Not working
                </Text>
              ) : (
                <Group gap="sm">
                  {today.map((block) => (
                    <Group
                      key={block.id}
                      gap={4}
                      px="sm"
                      py={4}
                      bg="primary.0"
                      style={{ borderRadius: 8 }}
                      wrap="nowrap"
                    >
                      <Text size="sm" className="tabular-numbers">
                        {formatTime(block.start_time)}–{formatTime(block.end_time)} ·{' '}
                        {block.slot_minutes} min slots
                      </Text>
                      {canEdit && (
                        <Tooltip label="Remove">
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            color="danger"
                            aria-label={`Remove ${day.label} ${formatTime(block.start_time)}`}
                            onClick={() => setRemoving(block)}
                          >
                            <Trash2 size={14} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Group>
                  ))}
                </Group>
              )}
            </Group>
          )
        })}
      </Stack>

      {canEdit && (
        <form onSubmit={form.handleSubmit((values) => add.mutate(values))} noValidate>
          <Stack gap="sm">
            <Text fw={600} size="sm">
              Add working hours
            </Text>
            <SimpleGrid cols={{ base: 1, sm: 4 }} spacing="md">
              <Controller
                control={form.control}
                name="weekday"
                render={({ field }) => (
                  <Select label="Day" data={WEEK} allowDeselect={false} {...field} />
                )}
              />
              <TextInput
                label="From"
                type="time"
                error={form.formState.errors.start_time?.message}
                {...form.register('start_time', { required: 'Required.' })}
              />
              <TextInput
                label="To"
                type="time"
                error={form.formState.errors.end_time?.message}
                {...form.register('end_time', { required: 'Required.' })}
              />
              <Controller
                control={form.control}
                name="slot_minutes"
                render={({ field }) => (
                  <NumberInput
                    label="Minutes per slot"
                    min={5}
                    max={240}
                    step={5}
                    error={form.formState.errors.slot_minutes?.message}
                    {...field}
                  />
                )}
              />
            </SimpleGrid>
            {formError && (
              <Text size="sm" c="danger.6" role="alert">
                {formError}
              </Text>
            )}
            <Group>
              <Button
                type="submit"
                variant="light"
                leftSection={<Plus size={16} />}
                loading={add.isPending}
              >
                Add hours
              </Button>
            </Group>
          </Stack>
        </form>
      )}

      <ConfirmDialog
        opened={removing !== null}
        title="Remove these working hours?"
        message="Slots in these hours can no longer be booked. Visits already booked are kept."
        confirmLabel="Remove"
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
        onClose={() => setRemoving(null)}
      />
    </Stack>
  )
}

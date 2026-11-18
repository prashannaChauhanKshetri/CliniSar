/** A doctor writes a prescription for one of their visits: diagnosis plus medicine lines. */
import {
  ActionIcon,
  Button,
  Card,
  Group,
  NumberInput,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { medicinesApi, prescriptionsApi, type Appointment } from '../../api/resources'
import { FormModal } from '../../components/FormModal'
import { RemoteSelect } from '../../components/RemoteSelect'
import { formatBS } from '../../lib/date'
import { showServerFieldErrors } from '../../lib/forms'
import { notifyError, notifySuccess } from '../../lib/notify'

interface Line {
  medicine: string | null
  medicineLabel: string
  dosage: string
  frequency: string
  duration_days: number | string
  quantity: number | string
  instructions: string
}
interface PrescriptionValues {
  diagnosis: string
  notes: string
  items: Line[]
}

const EMPTY_LINE: Line = {
  medicine: null,
  medicineLabel: '',
  dosage: '',
  frequency: '',
  duration_days: 5,
  quantity: '',
  instructions: '',
}

export function WritePrescriptionModal({
  appointment,
  onClose,
}: {
  appointment: Appointment
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const form = useForm<PrescriptionValues>({
    defaultValues: { diagnosis: '', notes: '', items: [EMPTY_LINE] },
  })
  const lines = useFieldArray({ control: form.control, name: 'items' })
  const errors = form.formState.errors

  const save = useMutation({
    mutationFn: (values: PrescriptionValues) =>
      prescriptionsApi.create({
        appointment: appointment.id,
        diagnosis: values.diagnosis.trim(),
        notes: values.notes.trim(),
        items: values.items.map((line) => ({
          medicine: line.medicine!,
          dosage: line.dosage,
          frequency: line.frequency,
          duration_days: Number(line.duration_days),
          quantity: Number(line.quantity),
          instructions: line.instructions,
        })),
      }),
    onSuccess: (prescription) => {
      notifySuccess(
        `Prescription for ${prescription.patient_name} saved. The pharmacy can now dispense it.`,
      )
      void queryClient.invalidateQueries({ queryKey: ['prescriptions'] })
      onClose()
      navigate(`/prescriptions/${prescription.id}`)
    },
    onError: (error) =>
      showServerFieldErrors(error, form.setError, ['diagnosis', 'notes']) || notifyError(error),
  })

  return (
    <FormModal
      opened
      onClose={onClose}
      size="xl"
      title={`Prescription for ${appointment.patient_name}`}
      submitLabel="Save prescription"
      submitting={save.isPending}
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
    >
      <Text size="sm" c="dimmed">
        Visit on {formatBS(appointment.date)}
        {appointment.reason ? ` · ${appointment.reason}` : ''}
      </Text>
      <TextInput
        label="Diagnosis"
        required
        data-autofocus
        error={errors.diagnosis?.message}
        {...form.register('diagnosis', { required: 'Write the diagnosis.' })}
      />

      <Stack gap="sm">
        <Text size="sm" fw={600}>
          Medicines
        </Text>
        {lines.fields.map((line, index) => (
          <Card key={line.id} padding="md" bg="var(--clinisar-page)">
            <Stack gap="sm">
              <Group align="flex-start" gap="sm" wrap="nowrap">
                <Controller
                  control={form.control}
                  name={`items.${index}.medicine`}
                  rules={{
                    required: 'Choose a medicine.',
                    validate: (value) =>
                      form.getValues('items').filter((item) => item.medicine === value).length ===
                        1 || 'This medicine is already on the list.',
                  }}
                  render={({ field }) => (
                    <RemoteSelect
                      label="Medicine"
                      required
                      placeholder="Type a medicine name"
                      queryKey="medicines"
                      fetchOptions={async (search) =>
                        (await medicinesApi.list({ search, page_size: 20 })).results.map((m) => ({
                          value: m.id,
                          label: `${m.name} ${m.strength}${m.form ? ` · ${m.form}` : ''} · ${m.available_stock} in stock`,
                        }))
                      }
                      value={field.value}
                      onChange={(value) => field.onChange(value)}
                      error={errors.items?.[index]?.medicine?.message}
                      flex={1}
                    />
                  )}
                />
                <Tooltip label="Remove this medicine">
                  <ActionIcon
                    mt={26}
                    variant="subtle"
                    color="danger"
                    aria-label={`Remove medicine ${index + 1}`}
                    disabled={lines.fields.length === 1}
                    onClick={() => lines.remove(index)}
                  >
                    <Trash2 size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
              <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
                <TextInput
                  label="Dosage"
                  placeholder="500mg"
                  required
                  error={errors.items?.[index]?.dosage?.message}
                  {...form.register(`items.${index}.dosage`, { required: 'Required.' })}
                />
                <TextInput
                  label="How often"
                  placeholder="1-0-1"
                  required
                  error={errors.items?.[index]?.frequency?.message}
                  {...form.register(`items.${index}.frequency`, { required: 'Required.' })}
                />
                <Controller
                  control={form.control}
                  name={`items.${index}.duration_days`}
                  rules={{ required: 'Required.', min: { value: 1, message: 'At least 1.' } }}
                  render={({ field }) => (
                    <NumberInput
                      label="Days"
                      min={1}
                      required
                      error={errors.items?.[index]?.duration_days?.message}
                      {...field}
                    />
                  )}
                />
                <Controller
                  control={form.control}
                  name={`items.${index}.quantity`}
                  rules={{ required: 'Required.', min: { value: 1, message: 'At least 1.' } }}
                  render={({ field }) => (
                    <NumberInput
                      label="Quantity to give"
                      min={1}
                      required
                      error={errors.items?.[index]?.quantity?.message}
                      {...field}
                    />
                  )}
                />
              </SimpleGrid>
              <TextInput
                label="Instructions"
                placeholder="e.g. After food"
                {...form.register(`items.${index}.instructions`)}
              />
            </Stack>
          </Card>
        ))}
        <Group>
          <Button
            variant="light"
            leftSection={<Plus size={16} />}
            onClick={() => lines.append(EMPTY_LINE)}
          >
            Add medicine
          </Button>
        </Group>
      </Stack>
      <Textarea label="Notes for the patient" autosize minRows={2} {...form.register('notes')} />
    </FormModal>
  )
}

/** Add or edit a lab test with its report rows (e.g. CBC: Hb, WBC, ... each with unit and range). */
import {
  ActionIcon,
  Button,
  Group,
  NumberInput,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { labTestsApi, type LabParameter, type LabTest } from '../../api/resources'
import { FormModal } from '../../components/FormModal'
import { getErrorMessage } from '../../api/errors'
import { showServerFieldErrors } from '../../lib/forms'
import { notifyError, notifySuccess } from '../../lib/notify'

interface LabTestValues {
  name: string
  price: number | string
  category: string
  method: string
  specimen: string
  interpretation: string
  is_active: boolean
  parameters: LabParameter[]
}

const EMPTY_ROW: LabParameter = { name: '', unit: '', reference_range: '', section: '' }

export function LabTestForm({
  labTest,
  onClose,
}: {
  labTest: LabTest | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const form = useForm<LabTestValues>({
    defaultValues: {
      name: labTest?.name ?? '',
      price: labTest ? Number(labTest.price) : '',
      category: labTest?.category ?? '',
      method: labTest?.method ?? '',
      specimen: labTest?.specimen ?? '',
      interpretation: labTest?.interpretation ?? '',
      is_active: labTest?.is_active ?? true,
      parameters: labTest?.parameters.map(({ id, name, unit, reference_range, section }) => ({
        id,
        name,
        unit,
        reference_range,
        section,
      })) ?? [EMPTY_ROW],
    },
  })
  const rows = useFieldArray({ control: form.control, name: 'parameters', keyName: 'key' })
  const errors = form.formState.errors
  const save = useMutation({
    mutationFn: (values: LabTestValues) => {
      const body = { ...values, price: Number(values.price).toFixed(2) }
      return labTest ? labTestsApi.update(labTest.id, body) : labTestsApi.create(body)
    },
    onSuccess: (saved) => {
      notifySuccess(`${saved.name} saved with ${saved.parameters.length} report rows.`)
      void queryClient.invalidateQueries({ queryKey: ['lab-tests'] })
      onClose()
    },
    onError: (error) => {
      if (!showServerFieldErrors(error, form.setError, ['name', 'price', 'category'])) {
        notifyError(error)
        if (getErrorMessage(error).includes('row'))
          form.setError('parameters', { message: getErrorMessage(error) })
      }
    },
  })

  return (
    <FormModal
      opened
      onClose={onClose}
      size="xl"
      title={labTest ? `Edit ${labTest.name}` : 'Add lab test'}
      submitLabel={labTest ? 'Save' : 'Add test'}
      submitting={save.isPending}
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
    >
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <TextInput
          label="Name (as billed)"
          placeholder="e.g. CBC"
          required
          data-autofocus
          error={errors.name?.message}
          {...form.register('name', { required: 'Enter the name.' })}
        />
        <Controller
          control={form.control}
          name="price"
          rules={{ required: 'Enter the price.' }}
          render={({ field }) => (
            <NumberInput
              label="Price (Rs.)"
              min={0}
              decimalScale={2}
              required
              error={errors.price?.message}
              {...field}
            />
          )}
        />
        <TextInput
          label="Report heading"
          placeholder="e.g. HEMATOLOGY REPORT"
          {...form.register('category')}
        />
        <TextInput
          label="Method"
          placeholder="e.g. Fluorescence Immunoassay"
          {...form.register('method')}
        />
        <TextInput label="Specimen" placeholder="e.g. Serum" {...form.register('specimen')} />
        <Controller
          control={form.control}
          name="is_active"
          render={({ field }) => (
            <Switch
              mt={28}
              label="Offered (can be ordered)"
              checked={field.value}
              onChange={(e) => field.onChange(e.currentTarget.checked)}
            />
          )}
        />
      </SimpleGrid>

      <Stack gap="xs">
        <Text size="sm" fw={600}>
          Report rows
        </Text>
        <Text size="xs" c="dimmed">
          Each row gets a result. Rows with the same section are printed under that sub-heading.
        </Text>
        <Table.ScrollContainer minWidth={720}>
          <Table verticalSpacing={4} highlightOnHover={false}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th w={110}>Unit</Table.Th>
                <Table.Th w={150}>Reference range</Table.Th>
                <Table.Th w={180}>Section (optional)</Table.Th>
                <Table.Th w={104} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.fields.map((row, index) => (
                <Table.Tr key={row.key}>
                  <Table.Td>
                    <TextInput
                      aria-label={`Row ${index + 1} name`}
                      size="xs"
                      error={errors.parameters?.[index]?.name?.message}
                      {...form.register(`parameters.${index}.name`, { required: 'Required.' })}
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      aria-label={`Row ${index + 1} unit`}
                      size="xs"
                      {...form.register(`parameters.${index}.unit`)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      aria-label={`Row ${index + 1} reference range`}
                      size="xs"
                      {...form.register(`parameters.${index}.reference_range`)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      aria-label={`Row ${index + 1} section`}
                      size="xs"
                      {...form.register(`parameters.${index}.section`)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Group gap={2} wrap="nowrap">
                      <Tooltip label="Move up">
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="grey"
                          aria-label={`Move row ${index + 1} up`}
                          disabled={index === 0}
                          onClick={() => rows.move(index, index - 1)}
                        >
                          <ArrowUp size={14} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Move down">
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="grey"
                          aria-label={`Move row ${index + 1} down`}
                          disabled={index === rows.fields.length - 1}
                          onClick={() => rows.move(index, index + 1)}
                        >
                          <ArrowDown size={14} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Remove row">
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="danger"
                          aria-label={`Remove row ${index + 1}`}
                          disabled={rows.fields.length === 1}
                          onClick={() => rows.remove(index)}
                        >
                          <Trash2 size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {errors.parameters?.message && (
          <Text size="sm" c="danger.6">
            {errors.parameters.message}
          </Text>
        )}
        <Group>
          <Button
            size="xs"
            variant="light"
            leftSection={<Plus size={14} />}
            onClick={() => rows.append(EMPTY_ROW)}
          >
            Add row
          </Button>
        </Group>
      </Stack>
      <Textarea
        label="Interpretation (printed under the results)"
        autosize
        minRows={2}
        {...form.register('interpretation')}
      />
    </FormModal>
  )
}

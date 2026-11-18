/** Add or edit a medicine. Stock is not typed here: it comes from purchases (batches). */
import { NumberInput, SimpleGrid, TextInput } from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { medicinesApi, type Medicine } from '../../api/resources'
import { FormModal } from '../../components/FormModal'
import { showServerFieldErrors } from '../../lib/forms'
import { notifyError, notifySuccess } from '../../lib/notify'

interface MedicineValues {
  name: string
  generic_name: string
  strength: string
  form: string
  unit_price: number | string
  reorder_level: number | string
}

export function MedicineForm({
  medicine,
  onClose,
}: {
  medicine: Medicine | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const form = useForm<MedicineValues>({
    defaultValues: {
      name: medicine?.name ?? '',
      generic_name: medicine?.generic_name ?? '',
      strength: medicine?.strength ?? '',
      form: medicine?.form ?? '',
      unit_price: medicine ? Number(medicine.unit_price) : '',
      reorder_level: medicine?.reorder_level ?? 10,
    },
  })
  const errors = form.formState.errors
  const save = useMutation({
    mutationFn: (values: MedicineValues) => {
      const body = {
        ...values,
        unit_price: Number(values.unit_price).toFixed(2),
        reorder_level: Number(values.reorder_level),
      }
      return medicine ? medicinesApi.update(medicine.id, body) : medicinesApi.create(body)
    },
    onSuccess: (saved) => {
      notifySuccess(
        medicine
          ? `${saved.name} was updated.`
          : `${saved.name} was added. Record a purchase to put it in stock.`,
      )
      void queryClient.invalidateQueries({ queryKey: ['medicines'] })
      onClose()
    },
    onError: (error) =>
      showServerFieldErrors(error, form.setError, [
        'name',
        'generic_name',
        'strength',
        'form',
        'unit_price',
        'reorder_level',
      ]) || notifyError(error),
  })
  return (
    <FormModal
      opened
      onClose={onClose}
      title={medicine ? 'Edit medicine' : 'Add medicine'}
      submitLabel={medicine ? 'Save' : 'Add medicine'}
      submitting={save.isPending}
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
    >
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <TextInput
          label="Name"
          required
          data-autofocus
          error={errors.name?.message}
          {...form.register('name', { required: 'Enter the name.' })}
        />
        <TextInput label="Generic name" {...form.register('generic_name')} />
        <TextInput label="Strength" placeholder="e.g. 500mg" {...form.register('strength')} />
        <TextInput label="Form" placeholder="e.g. Tablet, Syrup" {...form.register('form')} />
        <Controller
          control={form.control}
          name="unit_price"
          rules={{ required: 'Enter the price per unit.' }}
          render={({ field }) => (
            <NumberInput
              label="Price per unit (Rs.)"
              min={0}
              decimalScale={2}
              required
              error={errors.unit_price?.message}
              {...field}
            />
          )}
        />
        <Controller
          control={form.control}
          name="reorder_level"
          render={({ field }) => (
            <NumberInput
              label="Reorder level"
              description="“Low stock” at or below this many units"
              min={0}
              error={errors.reorder_level?.message}
              {...field}
            />
          )}
        />
      </SimpleGrid>
    </FormModal>
  )
}

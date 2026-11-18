/** The two ways stock changes by hand: recording a purchase, and adjusting a batch. */
import { NumberInput, TextInput, Textarea } from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { batchesApi, medicinesApi, type Batch, type Medicine } from '../../api/resources'
import { BsDatePicker } from '../../components/BsDatePicker'
import { FormModal } from '../../components/FormModal'
import { addDays, todayInNepal } from '../../lib/date'
import { showServerFieldErrors } from '../../lib/forms'
import { notifyError, notifySuccess } from '../../lib/notify'

function useRefreshStock() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['medicines'] })
    void queryClient.invalidateQueries({ queryKey: ['batches'] })
  }
}

interface PurchaseValues {
  batch_number: string
  expiry_date: string | null
  quantity: number | string
}

/** A new delivery: a new batch with its own expiry date. */
export function PurchaseDialog({ medicine, onClose }: { medicine: Medicine; onClose: () => void }) {
  const refresh = useRefreshStock()
  const form = useForm<PurchaseValues>({
    defaultValues: { batch_number: '', expiry_date: null, quantity: '' },
  })
  const errors = form.formState.errors
  const save = useMutation({
    mutationFn: (values: PurchaseValues) =>
      medicinesApi.purchase(medicine.id, {
        batch_number: values.batch_number.trim(),
        expiry_date: values.expiry_date!,
        quantity: Number(values.quantity),
      }),
    onSuccess: (batch) => {
      notifySuccess(
        `${batch.quantity} units of ${medicine.name} added (batch ${batch.batch_number}).`,
        'Purchase recorded',
      )
      refresh()
      onClose()
    },
    onError: (error) =>
      showServerFieldErrors(error, form.setError, ['batch_number', 'expiry_date', 'quantity']) ||
      notifyError(error),
  })
  return (
    <FormModal
      opened
      onClose={onClose}
      size="md"
      title={`Record purchase: ${medicine.name} ${medicine.strength}`}
      submitLabel="Add to stock"
      submitting={save.isPending}
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
    >
      <TextInput
        label="Batch number"
        required
        data-autofocus
        error={errors.batch_number?.message}
        {...form.register('batch_number', { required: 'Enter the batch number from the box.' })}
      />
      <Controller
        control={form.control}
        name="expiry_date"
        rules={{ required: 'Pick the expiry date.' }}
        render={({ field }) => (
          <BsDatePicker
            label="Expiry date"
            required
            value={field.value}
            onChange={field.onChange}
            minDate={addDays(todayInNepal(), 1)}
            error={errors.expiry_date?.message}
          />
        )}
      />
      <Controller
        control={form.control}
        name="quantity"
        rules={{ required: 'Enter how many units.', min: { value: 1, message: 'At least 1.' } }}
        render={({ field }) => (
          <NumberInput
            label="Quantity (units)"
            min={1}
            required
            error={errors.quantity?.message}
            {...field}
          />
        )}
      />
    </FormModal>
  )
}

interface AdjustValues {
  change: number | string
  note: string
}

/** Correct a batch: damage, a count mismatch, or writing off expired stock. */
export function AdjustDialog({
  batch,
  writeOff = false,
  onClose,
}: {
  batch: Batch
  /** Pre-fill a write-off of everything left in an expired batch. */
  writeOff?: boolean
  onClose: () => void
}) {
  const refresh = useRefreshStock()
  const form = useForm<AdjustValues>({
    defaultValues: writeOff
      ? { change: -batch.quantity, note: 'Expired, written off' }
      : { change: '', note: '' },
  })
  const errors = form.formState.errors
  const save = useMutation({
    mutationFn: (values: AdjustValues) =>
      batchesApi.adjust(batch.id, { change: Number(values.change), note: values.note.trim() }),
    onSuccess: (saved) => {
      notifySuccess(
        `Batch ${saved.batch_number} now has ${saved.quantity} units.`,
        'Stock adjusted',
      )
      refresh()
      onClose()
    },
    onError: (error) =>
      showServerFieldErrors(error, form.setError, ['change', 'note']) || notifyError(error),
  })
  return (
    <FormModal
      opened
      onClose={onClose}
      size="md"
      title={`${writeOff ? 'Write off' : 'Adjust'} batch ${batch.batch_number}`}
      submitLabel={writeOff ? 'Write off' : 'Save adjustment'}
      submitting={save.isPending}
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
    >
      <Controller
        control={form.control}
        name="change"
        rules={{
          required: 'Enter the change.',
          validate: (value) => {
            const n = Number(value)
            if (n === 0) return 'The change cannot be zero.'
            if (batch.quantity + n < 0)
              return `Only ${batch.quantity} units are left in this batch.`
            return true
          },
        }}
        render={({ field }) => (
          <NumberInput
            label="Change in units"
            description={`${batch.quantity} units now. Use a minus sign to remove, e.g. -5.`}
            required
            allowNegative
            error={errors.change?.message}
            {...field}
          />
        )}
      />
      <Textarea
        label="Reason"
        required
        autosize
        minRows={2}
        error={errors.note?.message}
        {...form.register('note', { required: 'Explain why; it is kept in the stock history.' })}
      />
    </FormModal>
  )
}

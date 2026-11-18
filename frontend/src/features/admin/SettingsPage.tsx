/** Clinic settings (admin only): details, printing, VAT and the lab's own bill book. */
import {
  Alert,
  Button,
  Card,
  Group,
  NumberInput,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Info } from 'lucide-react'
import { useEffect } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { clinicApi, type Clinic } from '../../api/resources'
import { ErrorState } from '../../components/ErrorState'
import { PageHeader } from '../../components/PageHeader'
import { showServerFieldErrors } from '../../lib/forms'
import { notifyError, notifySuccess } from '../../lib/notify'

type SettingsValues = Omit<Clinic, 'id' | 'slug' | 'vat_rate' | 'receipt_width_mm'> & {
  vat_rate: number | string
  receipt_width_mm: string
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <Stack gap="md">
        <div>
          <Title order={2} fz={16}>
            {title}
          </Title>
          <Text size="sm" c="dimmed">
            {description}
          </Text>
        </div>
        {children}
      </Stack>
    </Card>
  )
}

export function SettingsPage() {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['clinic'], queryFn: clinicApi.get })
  const form = useForm<SettingsValues>()
  const labSeparate = useWatch({ control: form.control, name: 'lab_bills_separately' })
  const { reset } = form
  useEffect(() => {
    if (query.data)
      reset({
        ...query.data,
        vat_rate: Number(query.data.vat_rate),
        receipt_width_mm: String(query.data.receipt_width_mm),
      })
  }, [query.data, reset])

  const save = useMutation({
    mutationFn: (values: SettingsValues) =>
      clinicApi.update({
        ...values,
        vat_rate: Number(values.vat_rate).toFixed(2),
        receipt_width_mm: Number(values.receipt_width_mm) as 80 | 58,
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['clinic'], saved)
      notifySuccess('Clinic settings saved.')
    },
    onError: (error) =>
      showServerFieldErrors(error, form.setError, [
        'name',
        'phone',
        'address',
        'pan_number',
        'vat_rate',
        'lab_name',
        'lab_pan_number',
      ]) || notifyError(error),
  })

  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  if (!query.data) return <Skeleton h={400} radius="lg" />
  const errors = form.formState.errors

  return (
    <form onSubmit={form.handleSubmit((values) => save.mutate(values))} noValidate>
      <PageHeader
        title="Settings"
        description="Clinic details printed on bills and prescriptions, VAT, and printing."
        actions={
          <Button type="submit" loading={save.isPending}>
            Save settings
          </Button>
        }
      />
      <Stack gap="lg">
        <Section title="Clinic details" description="Printed at the top of every bill and report.">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <TextInput
              label="Clinic name"
              required
              error={errors.name?.message}
              {...form.register('name', { required: 'Enter the clinic name.' })}
            />
            <TextInput
              label="PAN number"
              error={errors.pan_number?.message}
              {...form.register('pan_number')}
            />
            <TextInput label="Phone" {...form.register('phone')} />
            <TextInput label="Address" {...form.register('address')} />
            <TextInput label="Clinic name in Nepali" {...form.register('name_nepali')} />
            <TextInput label="Address in Nepali" {...form.register('address_nepali')} />
          </SimpleGrid>
          <TextInput
            label="Note at the bottom of prescriptions"
            placeholder="यो पर्चाको म्याद १५ दिन मात्र हुनेछ ।"
            {...form.register('prescription_note')}
          />
        </Section>

        <Section title="VAT" description="Switch VAT on for each kind of bill and set the rate.">
          <Alert color="primary" variant="light" icon={<Info size={18} />}>
            Changes apply to new bills only. Bills already created keep the VAT they were made with.
          </Alert>
          <Controller
            control={form.control}
            name="vat_rate"
            render={({ field }) => (
              <NumberInput
                label="VAT rate (%)"
                min={0}
                max={100}
                decimalScale={2}
                w={200}
                error={errors.vat_rate?.message}
                {...field}
              />
            )}
          />
          {(
            [
              ['vat_on_consultation', 'Add VAT to consultation bills'],
              ['vat_on_pharmacy', 'Add VAT to pharmacy bills'],
              ['vat_on_lab', 'Add VAT to lab bills'],
            ] as const
          ).map(([name, label]) => (
            <Controller
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <Switch
                  label={label}
                  checked={!!field.value}
                  onChange={(e) => field.onChange(e.currentTarget.checked)}
                />
              )}
            />
          ))}
        </Section>

        <Section
          title="Lab bill book"
          description="Use this when the lab is a separate business with its own PAN."
        >
          <Controller
            control={form.control}
            name="lab_bills_separately"
            render={({ field }) => (
              <Switch
                label="Lab bills use the lab's own name, PAN and bill numbers"
                checked={!!field.value}
                onChange={(e) => field.onChange(e.currentTarget.checked)}
              />
            )}
          />
          {labSeparate && (
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <TextInput
                label="Lab name"
                required
                error={errors.lab_name?.message}
                {...form.register('lab_name', {
                  required: labSeparate ? 'Enter the lab name.' : false,
                })}
              />
              <TextInput
                label="Lab PAN number"
                error={errors.lab_pan_number?.message}
                {...form.register('lab_pan_number')}
              />
            </SimpleGrid>
          )}
        </Section>

        <Section
          title="Receipt printer"
          description="Paper width of the thermal printer at the counter."
        >
          <Controller
            control={form.control}
            name="receipt_width_mm"
            render={({ field }) => (
              <SegmentedControl
                data={[
                  { value: '80', label: '80 mm' },
                  { value: '58', label: '58 mm' },
                ]}
                w={240}
                {...field}
              />
            )}
          />
        </Section>
        <Group justify="flex-end">
          <Button type="submit" loading={save.isPending}>
            Save settings
          </Button>
        </Group>
      </Stack>
    </form>
  )
}

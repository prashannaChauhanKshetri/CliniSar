/**
 * Add or edit a patient. Like the clinic's paper register, staff can enter an AGE
 * instead of a date of birth, and the phone number is optional.
 */
import {
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { patientsApi, type Gender, type Patient, type PatientInput } from '../../api/resources'
import { BsDatePicker } from '../../components/BsDatePicker'
import { FormModal } from '../../components/FormModal'
import { todayInNepal } from '../../lib/date'
import { showServerFieldErrors } from '../../lib/forms'
import { notifyError, notifySuccess } from '../../lib/notify'
import { BLOOD_GROUPS, GENDER_OPTIONS } from '../../lib/people'

interface PatientValues {
  first_name: string
  last_name: string
  phone: string
  gender: Gender | ''
  age_years: number | string
  date_of_birth: string | null
  blood_group: string | null
  address: string
  emergency_contact: string
}

const FIELDS = [
  'first_name',
  'last_name',
  'phone',
  'gender',
  'age_years',
  'date_of_birth',
  'blood_group',
  'address',
  'emergency_contact',
] as const

export function PatientForm({
  patient,
  onClose,
  onSaved,
}: {
  patient: Patient | null
  onClose: () => void
  onSaved?: (patient: Patient) => void
}) {
  const queryClient = useQueryClient()
  const [birthMode, setBirthMode] = useState<'age' | 'dob'>(
    patient?.date_of_birth && !patient.date_of_birth_is_estimated ? 'dob' : 'age',
  )
  const form = useForm<PatientValues>({
    defaultValues: {
      first_name: patient?.first_name ?? '',
      last_name: patient?.last_name ?? '',
      phone: patient?.phone ?? '',
      gender: patient?.gender ?? '',
      age_years: patient?.age ?? '',
      date_of_birth: patient?.date_of_birth ?? null,
      blood_group: patient?.blood_group || null,
      address: patient?.address ?? '',
      emergency_contact: patient?.emergency_contact ?? '',
    },
  })
  const errors = form.formState.errors

  const save = useMutation({
    mutationFn: ({ age_years, date_of_birth, blood_group, ...values }: PatientValues) => {
      const body: PatientInput = { ...values, blood_group: blood_group ?? '' }
      if (
        birthMode === 'age' &&
        age_years !== '' &&
        (!patient || Number(age_years) !== patient.age)
      ) {
        body.age_years = Number(age_years)
      }
      if (birthMode === 'dob') body.date_of_birth = date_of_birth
      return patient ? patientsApi.update(patient.id, body) : patientsApi.create(body)
    },
    onSuccess: (saved) => {
      notifySuccess(
        patient ? `${saved.full_name}'s details were saved.` : `${saved.full_name} was registered.`,
      )
      void queryClient.invalidateQueries({ queryKey: ['patients'] })
      onSaved?.(saved)
      onClose()
    },
    onError: (error) => showServerFieldErrors(error, form.setError, FIELDS) || notifyError(error),
  })

  return (
    <FormModal
      opened
      onClose={onClose}
      title={patient ? 'Edit patient' : 'Register patient'}
      submitLabel={patient ? 'Save' : 'Register patient'}
      submitting={save.isPending}
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
    >
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <TextInput
          label="First name"
          required
          data-autofocus
          error={errors.first_name?.message}
          {...form.register('first_name', { required: 'Enter the first name.' })}
        />
        <TextInput
          label="Last name"
          required
          error={errors.last_name?.message}
          {...form.register('last_name', { required: 'Enter the last name.' })}
        />
        <Controller
          control={form.control}
          name="gender"
          render={({ field }) => (
            <Select
              label="Sex"
              data={GENDER_OPTIONS}
              clearable
              error={errors.gender?.message}
              value={field.value || null}
              onChange={(v) => field.onChange(v ?? '')}
            />
          )}
        />
        <TextInput
          label="Phone"
          description="Optional"
          error={errors.phone?.message}
          {...form.register('phone')}
        />
      </SimpleGrid>

      <Stack gap={4}>
        <Text size="sm" fw={500}>
          Age
        </Text>
        <SegmentedControl
          w={280}
          size="xs"
          value={birthMode}
          onChange={(value) => setBirthMode(value as 'age' | 'dob')}
          data={[
            { value: 'age', label: 'Enter age' },
            { value: 'dob', label: 'Enter date of birth' },
          ]}
        />
      </Stack>
      {birthMode === 'age' ? (
        <Controller
          control={form.control}
          name="age_years"
          render={({ field }) => (
            <NumberInput
              label="Age in years"
              min={0}
              max={130}
              w={200}
              description="The date of birth is estimated from the age."
              error={errors.age_years?.message}
              {...field}
            />
          )}
        />
      ) : (
        <Controller
          control={form.control}
          name="date_of_birth"
          render={({ field }) => (
            <BsDatePicker
              label="Date of birth"
              value={field.value}
              onChange={field.onChange}
              maxDate={todayInNepal()}
              error={errors.date_of_birth?.message}
            />
          )}
        />
      )}

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <TextInput
          label="Address"
          placeholder="e.g. Rajapur-Bardiya"
          error={errors.address?.message}
          {...form.register('address')}
        />
        <Controller
          control={form.control}
          name="blood_group"
          render={({ field }) => (
            <Select
              label="Blood group"
              data={BLOOD_GROUPS}
              clearable
              error={errors.blood_group?.message}
              {...field}
            />
          )}
        />
        <TextInput
          label="Emergency contact"
          error={errors.emergency_contact?.message}
          {...form.register('emergency_contact')}
        />
      </SimpleGrid>
    </FormModal>
  )
}

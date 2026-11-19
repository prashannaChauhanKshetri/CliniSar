/**
 * Add or edit a patient. Like the clinic's paper register, staff can enter an AGE
 * instead of a date of birth, and the phone number is optional.
 *
 * One person, one record:
 * - before registering, patients with the same name are listed ("Is this one of
 *   them?"), because without a phone the server cannot tell people apart;
 * - the same name AND phone is refused by the server (409), and the form offers the
 *   existing patient instead.
 */
import {
  Alert,
  Anchor,
  Button,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Users } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router'
import { getDuplicatePatient } from '../../api/errors'
import { patientsApi, type Gender, type Patient, type PatientInput } from '../../api/resources'
import { BsDatePicker } from '../../components/BsDatePicker'
import { FormModal } from '../../components/FormModal'
import { todayInNepal } from '../../lib/date'
import { showServerFieldErrors } from '../../lib/forms'
import { notifyError, notifySuccess } from '../../lib/notify'
import { ageSex, BLOOD_GROUPS, GENDER_OPTIONS, sameNameKey, tidyName } from '../../lib/people'

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
  // Same-name patients found for the name in `key`; shown until the name changes.
  const [sameName, setSameName] = useState<{ key: string; patients: Patient[] } | null>(null)
  const [checking, setChecking] = useState(false)
  // The existing patient when the server refused a duplicate (same name and phone).
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null)
  const [firstName, lastName] = useWatch({
    control: form.control,
    name: ['first_name', 'last_name'],
  })
  const nameKey = sameNameKey(firstName, lastName)
  const matches = !patient && sameName?.key === nameKey ? sameName.patients : []

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
    onError: (error) => {
      const existing = getDuplicatePatient(error)
      if (existing) setDuplicate(existing)
      else if (!showServerFieldErrors(error, form.setError, FIELDS)) notifyError(error)
    },
  })

  /** Use a patient who is already registered instead of creating a second record. */
  function chooseExisting(existing: Patient) {
    notifySuccess(`${existing.full_name} is already registered; using that record.`)
    onSaved?.(existing)
    onClose()
  }

  async function submit(values: PatientValues) {
    setDuplicate(null)
    // New patient, name not looked up yet: look first, and ask if anyone has this name.
    if (!patient && sameName?.key !== nameKey) {
      setChecking(true)
      try {
        const found = await patientsApi.list({
          first_name__iexact: tidyName(values.first_name),
          last_name__iexact: tidyName(values.last_name),
          page_size: 5,
        })
        setSameName({ key: nameKey, patients: found.results })
        if (found.results.length > 0) return // the user decides: one of them, or new
      } catch {
        // The look-up only helps; the server still refuses a true duplicate.
      } finally {
        setChecking(false)
      }
    }
    save.mutate(values)
  }

  return (
    <FormModal
      opened
      onClose={onClose}
      title={patient ? 'Edit patient' : 'Register patient'}
      submitLabel={
        patient ? 'Save' : matches.length > 0 ? 'Register as a new patient' : 'Register patient'
      }
      submitting={save.isPending || checking}
      onSubmit={form.handleSubmit(submit)}
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

      {matches.length > 0 && !duplicate && (
        <Alert
          color="yellow"
          icon={<Users size={18} />}
          title={`Already registered? ${matches.length === 1 ? 'A patient' : `${matches.length} patients`} with this name`}
        >
          <Stack gap="sm">
            {matches.map((match) => (
              <Group key={match.id} justify="space-between" wrap="nowrap" gap="md">
                <div>
                  <Text size="sm" fw={500}>
                    {match.full_name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {[ageSex(match.age, match.gender), match.phone || 'No phone', match.address]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </div>
                {onSaved && (
                  <Button size="xs" variant="white" onClick={() => chooseExisting(match)}>
                    This is the patient
                  </Button>
                )}
              </Group>
            ))}
            <Text size="xs">If this is a different person, press “Register as a new patient”.</Text>
          </Stack>
        </Alert>
      )}

      {duplicate && (
        <Alert color="red" icon={<AlertTriangle size={18} />} title="Already registered">
          <Stack gap="sm" align="flex-start">
            <Text size="sm">
              {duplicate.name} with this phone number already has a record. A patient is registered
              only once.
            </Text>
            {onSaved ? (
              <Button
                size="xs"
                variant="white"
                color="red"
                onClick={() => void patientsApi.get(duplicate.id).then(chooseExisting, notifyError)}
              >
                Use {duplicate.name}
              </Button>
            ) : (
              <Anchor component={Link} to={`/patients/${duplicate.id}`} size="sm" onClick={onClose}>
                Open {duplicate.name}’s record
              </Anchor>
            )}
          </Stack>
        </Alert>
      )}
    </FormModal>
  )
}

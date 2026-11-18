/**
 * Doctors: the clinic admin adds and edits them (login + letterhead details + fee) and
 * sets their working hours; front-desk staff can look them up.
 */
import {
  ActionIcon,
  Button,
  Card,
  Divider,
  Group,
  Modal,
  NumberInput,
  PasswordInput,
  Select,
  SimpleGrid,
  Switch,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Pencil, Plus, UserX } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { departmentsApi, doctorsApi, type Doctor } from '../../api/resources'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DataTable } from '../../components/DataTable'
import { FormModal } from '../../components/FormModal'
import { Money } from '../../components/Money'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'
import { fullName, showServerFieldErrors } from '../../lib/forms'
import { notifyError, notifySuccess } from '../../lib/notify'
import { useListState } from '../../lib/useListState'
import { useAuth } from '../auth/useAuth'
import { ScheduleEditor } from '../scheduling/ScheduleEditor'

export function DoctorsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'CLINIC_ADMIN'
  const list = useListState()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Doctor | 'new' | null>(null)
  const [scheduling, setScheduling] = useState<Doctor | null>(null)
  const [deactivating, setDeactivating] = useState<Doctor | null>(null)
  const filters = {
    page: list.page,
    search: list.get('search'),
    department: list.get('department'),
  }
  const query = useQuery({
    queryKey: ['doctors', filters],
    queryFn: () => doctorsApi.list(filters),
  })
  const departments = useQuery({
    queryKey: ['departments', 'all'],
    queryFn: () => departmentsApi.list({ page_size: 100 }),
  })
  const departmentOptions = (departments.data?.results ?? []).map((d) => ({
    value: d.id,
    label: d.name,
  }))
  const deactivate = useMutation({
    mutationFn: (id: string) => doctorsApi.remove(id),
    onSuccess: () => {
      notifySuccess(
        `Dr. ${deactivating && fullName(deactivating)} can no longer sign in or be booked.`,
      )
      setDeactivating(null)
      void queryClient.invalidateQueries({ queryKey: ['doctors'] })
    },
    onError: (error) => notifyError(error),
  })

  return (
    <>
      <PageHeader
        title="Doctors"
        description="Doctors, their departments, consultation fees and working hours."
        actions={
          isAdmin && (
            <Button leftSection={<Plus size={16} />} onClick={() => setEditing('new')}>
              Add doctor
            </Button>
          )
        }
      />
      <Card>
        <Group mb="md" gap="md">
          <TextInput
            placeholder="Search by name or specialization"
            defaultValue={filters.search}
            onChange={(event) => list.setFilter('search', event.currentTarget.value)}
            aria-label="Search doctors"
            w={300}
          />
          <Select
            placeholder="All departments"
            data={departmentOptions}
            value={filters.department || null}
            onChange={(value) => list.setFilter('department', value)}
            clearable
            aria-label="Filter by department"
            w={220}
          />
        </Group>
        <DataTable
          caption="Doctors"
          rows={query.data?.results}
          rowKey={(row) => row.id}
          loading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          empty={{
            title: 'No doctors found',
            description: isAdmin ? 'Add the first doctor.' : 'Change the filters.',
          }}
          pagination={{ page: list.page, total: query.data?.count ?? 0, onChange: list.setPage }}
          columns={[
            {
              key: 'name',
              header: 'Doctor',
              render: (row) => (
                <div>
                  <Text size="sm" fw={500}>
                    Dr. {fullName(row)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {row.specialization || row.designation || '—'}
                  </Text>
                </div>
              ),
            },
            {
              key: 'department',
              header: 'Department',
              render: (row) => row.department_name ?? '—',
            },
            {
              key: 'fee',
              header: 'Consultation fee',
              align: 'right',
              render: (row) => <Money amount={row.consultation_fee} />,
            },
            {
              key: 'status',
              header: 'Status',
              render: (row) => <StatusBadge status={row.is_active ? 'ACTIVE' : 'INACTIVE'} />,
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              width: 132,
              render: (row) => (
                <Group gap="xs" justify="flex-end" wrap="nowrap">
                  <Tooltip label="Working hours">
                    <ActionIcon
                      variant="subtle"
                      color="grey"
                      aria-label={`Working hours of Dr. ${fullName(row)}`}
                      onClick={() => setScheduling(row)}
                    >
                      <CalendarClock size={16} />
                    </ActionIcon>
                  </Tooltip>
                  {isAdmin && (
                    <Tooltip label="Edit">
                      <ActionIcon
                        variant="subtle"
                        color="grey"
                        aria-label={`Edit Dr. ${fullName(row)}`}
                        onClick={() => setEditing(row)}
                      >
                        <Pencil size={16} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                  {isAdmin && row.is_active && (
                    <Tooltip label="Deactivate">
                      <ActionIcon
                        variant="subtle"
                        color="danger"
                        aria-label={`Deactivate Dr. ${fullName(row)}`}
                        onClick={() => setDeactivating(row)}
                      >
                        <UserX size={16} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              ),
            },
          ]}
        />
      </Card>

      {editing && (
        <DoctorForm
          doctor={editing === 'new' ? null : editing}
          departments={departmentOptions}
          onClose={() => setEditing(null)}
        />
      )}
      <Modal
        opened={scheduling !== null}
        onClose={() => setScheduling(null)}
        title={<Text fw={600}>Working hours: Dr. {scheduling && fullName(scheduling)}</Text>}
        size="xl"
      >
        {scheduling && <ScheduleEditor doctorId={scheduling.id} canEdit={isAdmin} />}
      </Modal>
      <ConfirmDialog
        opened={deactivating !== null}
        title="Deactivate this doctor?"
        message="They will not be able to sign in, and new visits cannot be booked with them. Their history stays."
        confirmLabel="Deactivate"
        loading={deactivate.isPending}
        onConfirm={() => deactivating && deactivate.mutate(deactivating.id)}
        onClose={() => setDeactivating(null)}
      />
    </>
  )
}

interface DoctorValues {
  first_name: string
  last_name: string
  email: string
  phone: string
  password: string
  is_active: boolean
  department: string | null
  specialization: string
  designation: string
  qualifications: string
  license_number: string
  name_nepali: string
  consultation_fee: number | string
  bio: string
}

const DOCTOR_FIELDS = [
  'first_name',
  'last_name',
  'email',
  'phone',
  'password',
  'department',
  'specialization',
  'designation',
  'qualifications',
  'license_number',
  'name_nepali',
  'consultation_fee',
  'bio',
] as const

function DoctorForm({
  doctor,
  departments,
  onClose,
}: {
  doctor: Doctor | null
  departments: { value: string; label: string }[]
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const form = useForm<DoctorValues>({
    defaultValues: {
      first_name: doctor?.first_name ?? '',
      last_name: doctor?.last_name ?? '',
      email: doctor?.email ?? '',
      phone: doctor?.phone ?? '',
      password: '',
      is_active: doctor?.is_active ?? true,
      department: doctor?.department ?? null,
      specialization: doctor?.specialization ?? '',
      designation: doctor?.designation ?? '',
      qualifications: doctor?.qualifications ?? '',
      license_number: doctor?.license_number ?? '',
      name_nepali: doctor?.name_nepali ?? '',
      consultation_fee: doctor ? Number(doctor.consultation_fee) : 500,
      bio: doctor?.bio ?? '',
    },
  })
  const errors = form.formState.errors
  const save = useMutation({
    mutationFn: ({ password, consultation_fee, ...values }: DoctorValues) => {
      const body = {
        ...values,
        consultation_fee: Number(consultation_fee).toFixed(2),
        ...(password ? { password } : {}),
      }
      return doctor ? doctorsApi.update(doctor.id, body) : doctorsApi.create(body)
    },
    onSuccess: (saved) => {
      notifySuccess(
        doctor
          ? `Dr. ${fullName(saved)} was updated.`
          : `Dr. ${fullName(saved)} was added. Set their working hours next.`,
      )
      void queryClient.invalidateQueries({ queryKey: ['doctors'] })
      onClose()
    },
    onError: (error) =>
      showServerFieldErrors(error, form.setError, DOCTOR_FIELDS) || notifyError(error),
  })

  return (
    <FormModal
      opened
      onClose={onClose}
      size="xl"
      title={doctor ? 'Edit doctor' : 'Add doctor'}
      submitLabel={doctor ? 'Save' : 'Add doctor'}
      submitting={save.isPending}
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
    >
      <Text size="sm" fw={600}>
        Login
      </Text>
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
        <TextInput
          label="Email (used to sign in)"
          type="email"
          required
          error={errors.email?.message}
          {...form.register('email', { required: 'Enter an email address.' })}
        />
        <TextInput label="Phone" error={errors.phone?.message} {...form.register('phone')} />
        <PasswordInput
          label={doctor ? 'New password (leave empty to keep)' : 'First password'}
          required={!doctor}
          autoComplete="new-password"
          error={errors.password?.message}
          {...form.register('password', { required: doctor ? false : 'Set a first password.' })}
        />
        {doctor && (
          <Controller
            control={form.control}
            name="is_active"
            render={({ field }) => (
              <Switch
                mt={28}
                label="Can sign in and be booked"
                checked={field.value}
                onChange={(e) => field.onChange(e.currentTarget.checked)}
              />
            )}
          />
        )}
      </SimpleGrid>
      <Divider />
      <Text size="sm" fw={600}>
        Work and fee
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <Controller
          control={form.control}
          name="department"
          render={({ field }) => (
            <Select
              label="Department"
              data={departments}
              clearable
              error={errors.department?.message}
              {...field}
            />
          )}
        />
        <Controller
          control={form.control}
          name="consultation_fee"
          render={({ field }) => (
            <NumberInput
              label="Consultation fee (Rs.)"
              min={0}
              decimalScale={2}
              thousandSeparator=","
              required
              error={errors.consultation_fee?.message}
              {...field}
            />
          )}
        />
        <TextInput
          label="Specialization"
          placeholder="e.g. General Physician"
          {...form.register('specialization')}
        />
      </SimpleGrid>
      <Divider />
      <Text size="sm" fw={600}>
        Prescription letterhead
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <TextInput label="Name in Nepali" placeholder="डा. ..." {...form.register('name_nepali')} />
        <TextInput
          label="Designation"
          placeholder="e.g. Consultant ENT Surgeon"
          {...form.register('designation')}
        />
        <TextInput
          label="Qualifications"
          placeholder="e.g. M.B.B.S., M.S."
          {...form.register('qualifications')}
        />
        <TextInput
          label="NMC number"
          error={errors.license_number?.message}
          {...form.register('license_number')}
        />
      </SimpleGrid>
      <Textarea label="About" autosize minRows={2} {...form.register('bio')} />
    </FormModal>
  )
}

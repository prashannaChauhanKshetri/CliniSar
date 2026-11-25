/** Staff logins (front desk & pharmacy, lab technician), managed by the clinic admin. */
import {
  ActionIcon,
  Button,
  Card,
  Group,
  PasswordInput,
  Select,
  SimpleGrid,
  Switch,
  TextInput,
  Tooltip,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, UserX } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { ROLE_LABELS } from '../../api/types'
import { staffApi, type StaffMember, type StaffRole } from '../../api/resources'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DataTable } from '../../components/DataTable'
import { FormModal } from '../../components/FormModal'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'
import { fullName, showServerFieldErrors } from '../../lib/forms'
import { notifyError, notifySuccess } from '../../lib/notify'
import { useListState } from '../../lib/useListState'

const ROLE_OPTIONS = (['STAFF', 'LAB_TECHNICIAN'] as StaffRole[]).map((role) => ({
  value: role,
  label: ROLE_LABELS[role],
}))

export function StaffPage() {
  const list = useListState()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<StaffMember | 'new' | null>(null)
  const [deactivating, setDeactivating] = useState<StaffMember | null>(null)
  const filters = { page: list.page, search: list.get('search'), role: list.get('role') }
  const query = useQuery({ queryKey: ['staff', filters], queryFn: () => staffApi.list(filters) })
  const deactivate = useMutation({
    mutationFn: (id: string) => staffApi.remove(id),
    onSuccess: () => {
      notifySuccess(`${deactivating && fullName(deactivating)} can no longer sign in.`)
      setDeactivating(null)
      void queryClient.invalidateQueries({ queryKey: ['staff'] })
    },
    onError: (error) => notifyError(error),
  })

  return (
    <>
      <PageHeader
        title="Staff"
        description="Front desk, pharmacy and lab logins. Doctors are added on the Doctors page."
        actions={
          <Button leftSection={<Plus size={16} />} onClick={() => setEditing('new')}>
            Add staff member
          </Button>
        }
      />
      <Card>
        <Group mb="md" gap="md">
          <TextInput
            placeholder="Search by name or email"
            defaultValue={filters.search}
            onChange={(event) => list.setFilter('search', event.currentTarget.value)}
            aria-label="Search staff"
            w={280}
          />
          <Select
            placeholder="All roles"
            data={ROLE_OPTIONS}
            value={filters.role || null}
            onChange={(value) => list.setFilter('role', value)}
            clearable
            aria-label="Filter by role"
            w={200}
          />
        </Group>
        <DataTable
          caption="Staff"
          rows={query.data?.results}
          rowKey={(row) => row.id}
          loading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          empty={{
            title: 'No staff found',
            description: 'Add a staff member, or change the filters.',
          }}
          pagination={{ page: list.page, total: query.data?.count ?? 0, onChange: list.setPage }}
          columns={[
            { key: 'name', header: 'Name', render: (row) => fullName(row) },
            { key: 'email', header: 'Email', render: (row) => row.email },
            { key: 'role', header: 'Role', render: (row) => ROLE_LABELS[row.role] },
            { key: 'phone', header: 'Phone', render: (row) => row.phone || '—' },
            {
              key: 'status',
              header: 'Status',
              render: (row) => <StatusBadge status={row.is_active ? 'ACTIVE' : 'INACTIVE'} />,
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              width: 96,
              render: (row) => (
                <Group gap="xs" justify="flex-end" wrap="nowrap">
                  <Tooltip label="Edit">
                    <ActionIcon
                      variant="subtle"
                      color="grey"
                      aria-label={`Edit ${fullName(row)}`}
                      onClick={() => setEditing(row)}
                    >
                      <Pencil size={16} />
                    </ActionIcon>
                  </Tooltip>
                  {row.is_active && (
                    <Tooltip label="Deactivate">
                      <ActionIcon
                        variant="subtle"
                        color="danger"
                        aria-label={`Deactivate ${fullName(row)}`}
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
        <StaffForm member={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
      <ConfirmDialog
        opened={deactivating !== null}
        title="Deactivate this login?"
        message={`${deactivating && fullName(deactivating)} will not be able to sign in. Their history stays, and you can turn the login on again with Edit.`}
        confirmLabel="Deactivate"
        loading={deactivate.isPending}
        onConfirm={() => deactivating && deactivate.mutate(deactivating.id)}
        onClose={() => setDeactivating(null)}
      />
    </>
  )
}

interface StaffValues {
  first_name: string
  last_name: string
  email: string
  phone: string
  role: StaffRole
  password: string
  is_active: boolean
}

function StaffForm({ member, onClose }: { member: StaffMember | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const form = useForm<StaffValues>({
    defaultValues: {
      first_name: member?.first_name ?? '',
      last_name: member?.last_name ?? '',
      email: member?.email ?? '',
      phone: member?.phone ?? '',
      role: member?.role ?? 'STAFF',
      password: '',
      is_active: member?.is_active ?? true,
    },
  })
  const errors = form.formState.errors
  const save = useMutation({
    mutationFn: ({ password, ...values }: StaffValues) => {
      const body = password ? { ...values, password } : values
      return member ? staffApi.update(member.id, body) : staffApi.create(body)
    },
    onSuccess: (saved) => {
      notifySuccess(
        member
          ? `${fullName(saved)} was updated.`
          : `${fullName(saved)} can now sign in with ${saved.email}.`,
      )
      void queryClient.invalidateQueries({ queryKey: ['staff'] })
      onClose()
    },
    onError: (error) =>
      showServerFieldErrors(error, form.setError, [
        'first_name',
        'last_name',
        'email',
        'phone',
        'role',
        'password',
      ]) || notifyError(error),
  })

  return (
    <FormModal
      opened
      onClose={onClose}
      title={member ? 'Edit staff member' : 'Add staff member'}
      submitLabel={member ? 'Save' : 'Add staff member'}
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
        <TextInput
          label="Email (used to sign in)"
          type="email"
          required
          error={errors.email?.message}
          {...form.register('email', { required: 'Enter an email address.' })}
        />
        <TextInput label="Phone" error={errors.phone?.message} {...form.register('phone')} />
        <Controller
          control={form.control}
          name="role"
          render={({ field }) => (
            <Select
              label="Role"
              required
              data={ROLE_OPTIONS}
              allowDeselect={false}
              error={errors.role?.message}
              {...field}
            />
          )}
        />
        <PasswordInput
          label={member ? 'New password (leave empty to keep)' : 'First password'}
          description="At least 8 characters. Give it to the person; they can change it later."
          required={!member}
          autoComplete="new-password"
          error={errors.password?.message}
          {...form.register('password', { required: member ? false : 'Set a first password.' })}
        />
      </SimpleGrid>
      {member && (
        <Controller
          control={form.control}
          name="is_active"
          render={({ field }) => (
            <Switch
              label="Can sign in"
              checked={field.value}
              onChange={(event) => field.onChange(event.currentTarget.checked)}
            />
          )}
        />
      )}
    </FormModal>
  )
}

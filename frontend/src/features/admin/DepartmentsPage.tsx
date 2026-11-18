/** Departments: the clinic admin adds, renames and removes them. */
import { ActionIcon, Button, Card, Group, TextInput, Tooltip } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { departmentsApi, type Department } from '../../api/resources'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DataTable } from '../../components/DataTable'
import { FormModal } from '../../components/FormModal'
import { PageHeader } from '../../components/PageHeader'
import { showServerFieldErrors } from '../../lib/forms'
import { notifyError, notifySuccess } from '../../lib/notify'
import { useListState } from '../../lib/useListState'

export function DepartmentsPage() {
  const list = useListState()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Department | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Department | null>(null)
  const query = useQuery({
    queryKey: ['departments', list.page],
    queryFn: () => departmentsApi.list({ page: list.page }),
  })
  const remove = useMutation({
    mutationFn: (id: string) => departmentsApi.remove(id),
    onSuccess: () => {
      notifySuccess(`${deleting?.name} was removed.`)
      setDeleting(null)
      void queryClient.invalidateQueries({ queryKey: ['departments'] })
    },
    onError: (error) => notifyError(error),
  })

  return (
    <>
      <PageHeader
        title="Departments"
        description="The clinic’s medical departments. Doctors belong to one."
        actions={
          <Button leftSection={<Plus size={16} />} onClick={() => setEditing('new')}>
            Add department
          </Button>
        }
      />
      <Card>
        <DataTable
          caption="Departments"
          rows={query.data?.results}
          rowKey={(row) => row.id}
          loading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          empty={{
            title: 'No departments yet',
            description: 'Add the first one, e.g. General Medicine.',
          }}
          pagination={{ page: list.page, total: query.data?.count ?? 0, onChange: list.setPage }}
          columns={[
            { key: 'name', header: 'Name', render: (row) => row.name },
            {
              key: 'actions',
              header: '',
              align: 'right',
              width: 96,
              render: (row) => (
                <Group gap="xs" justify="flex-end" wrap="nowrap">
                  <Tooltip label="Rename">
                    <ActionIcon
                      variant="subtle"
                      color="grey"
                      aria-label={`Rename ${row.name}`}
                      onClick={() => setEditing(row)}
                    >
                      <Pencil size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Remove">
                    <ActionIcon
                      variant="subtle"
                      color="danger"
                      aria-label={`Remove ${row.name}`}
                      onClick={() => setDeleting(row)}
                    >
                      <Trash2 size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              ),
            },
          ]}
        />
      </Card>
      {editing && (
        <DepartmentForm
          department={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        opened={deleting !== null}
        title="Remove department?"
        message={`${deleting?.name} will be removed. Its doctors stay, without a department.`}
        confirmLabel="Remove"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </>
  )
}

function DepartmentForm({
  department,
  onClose,
}: {
  department: Department | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const form = useForm({ defaultValues: { name: department?.name ?? '' } })
  const save = useMutation({
    mutationFn: (name: string) =>
      department ? departmentsApi.update(department.id, { name }) : departmentsApi.create({ name }),
    onSuccess: (saved) => {
      notifySuccess(department ? `Renamed to ${saved.name}.` : `${saved.name} was added.`)
      void queryClient.invalidateQueries({ queryKey: ['departments'] })
      onClose()
    },
    onError: (error) => showServerFieldErrors(error, form.setError, ['name']) || notifyError(error),
  })
  return (
    <FormModal
      opened
      onClose={onClose}
      size="md"
      title={department ? 'Rename department' : 'Add department'}
      submitLabel={department ? 'Save' : 'Add department'}
      submitting={save.isPending}
      onSubmit={form.handleSubmit(({ name }) => save.mutate(name.trim()))}
    >
      <TextInput
        label="Name"
        required
        data-autofocus
        error={form.formState.errors.name?.message}
        {...form.register('name', { required: 'Enter a name.' })}
      />
    </FormModal>
  )
}

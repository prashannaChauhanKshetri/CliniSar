/** Files kept for patients (old reports, scans). Admin and staff upload and remove them. */
import { ActionIcon, Anchor, Button, Card, Group, Tooltip } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, Upload } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { documentsApi, patientsApi, type PatientDocument } from '../../api/resources'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DataTable } from '../../components/DataTable'
import { DateText } from '../../components/DateText'
import { PageHeader } from '../../components/PageHeader'
import { RemoteSelect } from '../../components/RemoteSelect'
import { nepalDateOf } from '../../lib/date'
import { notifyError, notifySuccess } from '../../lib/notify'
import { useListState } from '../../lib/useListState'
import { useAuth } from '../auth/useAuth'
import { UploadDocumentModal } from './UploadDocumentModal'

export function DocumentsPage() {
  const { user } = useAuth()
  const canManage = user?.role === 'CLINIC_ADMIN' || user?.role === 'STAFF'
  const list = useListState()
  const queryClient = useQueryClient()
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState<PatientDocument | null>(null)
  const filters = { page: list.page, patient: list.get('patient') }
  const query = useQuery({
    queryKey: ['documents', filters],
    queryFn: () => documentsApi.list(filters),
  })
  const remove = useMutation({
    mutationFn: (id: string) => documentsApi.remove(id),
    onSuccess: () => {
      notifySuccess(`"${removing?.title}" was removed.`)
      setRemoving(null)
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
    onError: (error) => notifyError(error),
  })

  return (
    <>
      <PageHeader
        title="Documents"
        description="PDF, JPG and PNG files kept for patients."
        actions={
          canManage && (
            <Button leftSection={<Upload size={16} />} onClick={() => setUploading(true)}>
              Upload document
            </Button>
          )
        }
      />
      <Card>
        <Group mb="md">
          <RemoteSelect
            aria-label="Filter by patient"
            placeholder="All patients (type to choose one)"
            queryKey="patients"
            fetchOptions={async (search) =>
              (await patientsApi.list({ search, page_size: 20 })).results.map((p) => ({
                value: p.id,
                label: p.full_name,
              }))
            }
            value={filters.patient || null}
            onChange={(value) => list.setFilter('patient', value)}
            w={320}
          />
        </Group>
        <DataTable
          caption="Documents"
          rows={query.data?.results}
          rowKey={(row) => row.id}
          loading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          empty={{
            title: 'No documents',
            description: canManage ? 'Upload a scan or an old report.' : undefined,
          }}
          pagination={{ page: list.page, total: query.data?.count ?? 0, onChange: list.setPage }}
          columns={[
            {
              key: 'title',
              header: 'Title',
              render: (row) => (
                <Anchor href={row.file} target="_blank" rel="noreferrer" size="sm">
                  {row.title}
                </Anchor>
              ),
            },
            {
              key: 'patient',
              header: 'Patient',
              render: (row) => (
                <Anchor component={Link} to={`/patients/${row.patient}`} size="sm">
                  {row.patient_name}
                </Anchor>
              ),
            },
            {
              key: 'date',
              header: 'Uploaded',
              render: (row) => <DateText iso={nepalDateOf(row.created_at)} />,
            },
            { key: 'by', header: 'By', render: (row) => row.uploaded_by_name },
            {
              key: 'actions',
              header: '',
              align: 'right',
              width: 64,
              render: (row) =>
                canManage && (
                  <Tooltip label="Remove">
                    <ActionIcon
                      variant="subtle"
                      color="danger"
                      aria-label={`Remove ${row.title}`}
                      onClick={() => setRemoving(row)}
                    >
                      <Trash2 size={16} />
                    </ActionIcon>
                  </Tooltip>
                ),
            },
          ]}
        />
      </Card>
      {uploading && <UploadDocumentModal patient={null} onClose={() => setUploading(false)} />}
      <ConfirmDialog
        opened={removing !== null}
        title="Remove this document?"
        message={`"${removing?.title}" will be deleted. This cannot be undone.`}
        confirmLabel="Remove"
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
        onClose={() => setRemoving(null)}
      />
    </>
  )
}

/** One patient's record: details, then tabs for visits, prescriptions, lab, bills and files. */
import { Anchor, Button, Card, Group, Skeleton, Stack, Tabs, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Pencil, Upload } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  appointmentsApi,
  documentsApi,
  invoicesApi,
  labOrdersApi,
  patientsApi,
  prescriptionsApi,
} from '../../api/resources'
import { DataTable } from '../../components/DataTable'
import { DateText } from '../../components/DateText'
import { DetailList } from '../../components/DetailList'
import { ErrorState } from '../../components/ErrorState'
import { Money } from '../../components/Money'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'
import { formatBS, nepalDateOf } from '../../lib/date'
import { formatTime } from '../../lib/forms'
import { ageSex } from '../../lib/people'
import { canOpen } from '../../routes/navigation'
import { useAuth } from '../auth/useAuth'
import { UploadDocumentModal } from '../documents/UploadDocumentModal'
import { PatientForm } from './PatientForm'

export function PatientDetailPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const [editing, setEditing] = useState(false)
  const query = useQuery({ queryKey: ['patients', id], queryFn: () => patientsApi.get(id) })
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  if (!query.data || !user) return <Skeleton h={320} radius="lg" />
  const patient = query.data
  const canEdit = user.role === 'CLINIC_ADMIN' || user.role === 'STAFF'
  const can = (path: string) => canOpen(user.role, path)

  return (
    <>
      <PageHeader
        title={patient.full_name}
        description={`${ageSex(patient.age, patient.gender)}${patient.address ? ` · ${patient.address}` : ''}`}
        back={{ to: '/patients', label: 'All patients' }}
        actions={
          canEdit && (
            <Button
              variant="default"
              leftSection={<Pencil size={16} />}
              onClick={() => setEditing(true)}
            >
              Edit details
            </Button>
          )
        }
      />
      <Stack gap="lg">
        <Card>
          <DetailList
            cols={4}
            items={[
              ['Phone', patient.phone],
              [
                'Date of birth',
                patient.date_of_birth
                  ? `${formatBS(patient.date_of_birth)}${patient.date_of_birth_is_estimated ? ' (from age)' : ''}`
                  : '',
              ],
              ['Blood group', patient.blood_group],
              ['Emergency contact', patient.emergency_contact],
              ['Registered', formatBS(nepalDateOf(patient.created_at))],
            ]}
          />
        </Card>
        <Card p={0}>
          <Tabs defaultValue="visits" keepMounted={false}>
            <Tabs.List px="lg" pt="sm">
              <Tabs.Tab value="visits">Visits</Tabs.Tab>
              {can('/prescriptions') && <Tabs.Tab value="prescriptions">Prescriptions</Tabs.Tab>}
              {can('/lab-orders') && <Tabs.Tab value="lab">Lab</Tabs.Tab>}
              {can('/invoices') && <Tabs.Tab value="bills">Bills</Tabs.Tab>}
              {can('/documents') && <Tabs.Tab value="documents">Documents</Tabs.Tab>}
            </Tabs.List>
            <Stack p="lg">
              <Tabs.Panel value="visits">
                <VisitsTab patientId={id} />
              </Tabs.Panel>
              <Tabs.Panel value="prescriptions">
                <PrescriptionsTab patientId={id} />
              </Tabs.Panel>
              <Tabs.Panel value="lab">
                <LabTab patientId={id} />
              </Tabs.Panel>
              <Tabs.Panel value="bills">
                <BillsTab patientId={id} />
              </Tabs.Panel>
              <Tabs.Panel value="documents">
                <DocumentsTab patient={{ id, name: patient.full_name }} canUpload={canEdit} />
              </Tabs.Panel>
            </Stack>
          </Tabs>
        </Card>
      </Stack>
      {editing && <PatientForm patient={patient} onClose={() => setEditing(false)} />}
    </>
  )
}

function VisitsTab({ patientId }: { patientId: string }) {
  const query = useQuery({
    queryKey: ['appointments', { patient: patientId }],
    queryFn: () => appointmentsApi.list({ patient: patientId, page_size: 50 }),
  })
  return (
    <DataTable
      caption="Visits"
      rows={query.data?.results}
      rowKey={(row) => row.id}
      loading={query.isPending}
      error={query.error}
      empty={{ title: 'No visits yet' }}
      columns={[
        { key: 'date', header: 'Date', render: (row) => <DateText iso={row.date} /> },
        {
          key: 'time',
          header: 'Time / queue',
          render: (row) =>
            row.visit_type === 'WALK_IN'
              ? `Walk-in #${row.queue_number}`
              : formatTime(row.start_time),
        },
        { key: 'doctor', header: 'Doctor', render: (row) => `Dr. ${row.doctor_name}` },
        { key: 'reason', header: 'Reason', render: (row) => row.reason || '—' },
        { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
      ]}
    />
  )
}

function PrescriptionsTab({ patientId }: { patientId: string }) {
  const navigate = useNavigate()
  const query = useQuery({
    queryKey: ['prescriptions', { patient: patientId }],
    queryFn: () => prescriptionsApi.list({ appointment__patient: patientId, page_size: 50 }),
  })
  return (
    <DataTable
      caption="Prescriptions"
      rows={query.data?.results}
      rowKey={(row) => row.id}
      loading={query.isPending}
      error={query.error}
      onRowClick={(row) => navigate(`/prescriptions/${row.id}`)}
      empty={{ title: 'No prescriptions yet' }}
      columns={[
        { key: 'date', header: 'Visit', render: (row) => <DateText iso={row.visit_date} /> },
        { key: 'diagnosis', header: 'Diagnosis', render: (row) => row.diagnosis },
        { key: 'doctor', header: 'Doctor', render: (row) => `Dr. ${row.doctor_name}` },
        { key: 'items', header: 'Medicines', render: (row) => row.items.length },
        { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
      ]}
    />
  )
}

function LabTab({ patientId }: { patientId: string }) {
  const navigate = useNavigate()
  const query = useQuery({
    queryKey: ['lab-orders', { patient: patientId }],
    queryFn: () => labOrdersApi.list({ patient: patientId, page_size: 50 }),
  })
  return (
    <DataTable
      caption="Lab orders"
      rows={query.data?.results}
      rowKey={(row) => row.id}
      loading={query.isPending}
      error={query.error}
      onRowClick={(row) => navigate(`/lab-orders/${row.id}`)}
      empty={{ title: 'No lab tests yet' }}
      columns={[
        { key: 'number', header: 'Lab No.', render: (row) => row.lab_number },
        {
          key: 'date',
          header: 'Ordered',
          render: (row) => <DateText iso={nepalDateOf(row.created_at)} />,
        },
        {
          key: 'tests',
          header: 'Tests',
          render: (row) => row.items.map((item) => item.lab_test_name).join(', '),
        },
        { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
      ]}
    />
  )
}

function BillsTab({ patientId }: { patientId: string }) {
  const navigate = useNavigate()
  const query = useQuery({
    queryKey: ['invoices', { patient: patientId }],
    queryFn: () => invoicesApi.list({ patient: patientId, page_size: 50 }),
  })
  return (
    <DataTable
      caption="Bills"
      rows={query.data?.results}
      rowKey={(row) => row.id}
      loading={query.isPending}
      error={query.error}
      onRowClick={(row) => navigate(`/invoices/${row.id}`)}
      empty={{ title: 'No bills yet' }}
      columns={[
        {
          key: 'number',
          header: 'Bill No.',
          render: (row) => `${row.series === 'LAB' ? 'L-' : ''}${row.number}`,
        },
        {
          key: 'date',
          header: 'Date',
          render: (row) => <DateText iso={nepalDateOf(row.created_at)} />,
        },
        {
          key: 'source',
          header: 'For',
          render: (row) => (
            <StatusBadge
              status={row.source}
              label={row.source.charAt(0) + row.source.slice(1).toLowerCase()}
            />
          ),
        },
        {
          key: 'total',
          header: 'Total',
          align: 'right',
          render: (row) => <Money amount={row.total} />,
        },
        { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
      ]}
    />
  )
}

function DocumentsTab({
  patient,
  canUpload,
}: {
  patient: { id: string; name: string }
  canUpload: boolean
}) {
  const [uploading, setUploading] = useState(false)
  const query = useQuery({
    queryKey: ['documents', { patient: patient.id }],
    queryFn: () => documentsApi.list({ patient: patient.id, page_size: 50 }),
  })
  return (
    <Stack gap="md">
      {canUpload && (
        <Group justify="flex-end">
          <Button
            variant="light"
            leftSection={<Upload size={16} />}
            onClick={() => setUploading(true)}
          >
            Upload document
          </Button>
        </Group>
      )}
      <DataTable
        caption="Documents"
        rows={query.data?.results}
        rowKey={(row) => row.id}
        loading={query.isPending}
        error={query.error}
        empty={{ title: 'No documents yet', description: 'Old reports and scans appear here.' }}
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
            key: 'date',
            header: 'Uploaded',
            render: (row) => <DateText iso={nepalDateOf(row.created_at)} />,
          },
          {
            key: 'by',
            header: 'By',
            render: (row) => <Text size="sm">{row.uploaded_by_name}</Text>,
          },
        ]}
      />
      {uploading && <UploadDocumentModal patient={patient} onClose={() => setUploading(false)} />}
      <Text size="xs" c="dimmed">
        Files open in a new tab. <Link to="/documents">All documents</Link>
      </Text>
    </Stack>
  )
}

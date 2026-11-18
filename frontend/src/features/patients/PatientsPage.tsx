/** The patient register: search, register new patients, open a patient's record. */
import { Button, Card, Group, Text, TextInput } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { patientsApi } from '../../api/resources'
import { DataTable } from '../../components/DataTable'
import { DateText } from '../../components/DateText'
import { PageHeader } from '../../components/PageHeader'
import { nepalDateOf } from '../../lib/date'
import { ageSex } from '../../lib/people'
import { useListState } from '../../lib/useListState'
import { useAuth } from '../auth/useAuth'
import { PatientForm } from './PatientForm'

export function PatientsPage() {
  const { user } = useAuth()
  const canRegister = user?.role === 'CLINIC_ADMIN' || user?.role === 'STAFF'
  const list = useListState()
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const filters = { page: list.page, search: list.get('search') }
  const query = useQuery({
    queryKey: ['patients', filters],
    queryFn: () => patientsApi.list(filters),
  })

  return (
    <>
      <PageHeader
        title="Patients"
        description={
          user?.role === 'DOCTOR'
            ? 'Patients who have visited you.'
            : 'Everyone registered at the clinic.'
        }
        actions={
          canRegister && (
            <Button leftSection={<Plus size={16} />} onClick={() => setAdding(true)}>
              Register patient
            </Button>
          )
        }
      />
      <Card>
        <Group mb="md">
          <TextInput
            key={filters.search /* refill when the top-bar search changes the URL */}
            placeholder="Search by name or phone"
            leftSection={<Search size={16} />}
            defaultValue={filters.search}
            onChange={(event) => list.setFilter('search', event.currentTarget.value)}
            aria-label="Search patients"
            w={320}
          />
        </Group>
        <DataTable
          caption="Patients"
          rows={query.data?.results}
          rowKey={(row) => row.id}
          loading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          onRowClick={(row) => navigate(`/patients/${row.id}`)}
          empty={{
            title: filters.search ? 'No patient matches' : 'No patients yet',
            description: filters.search
              ? 'Check the spelling or search by phone number.'
              : canRegister
                ? 'Register the first patient.'
                : undefined,
          }}
          pagination={{ page: list.page, total: query.data?.count ?? 0, onChange: list.setPage }}
          columns={[
            {
              key: 'name',
              header: 'Name',
              render: (row) => (
                <div>
                  <Text size="sm" fw={500}>
                    {row.full_name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {ageSex(row.age, row.gender)}
                  </Text>
                </div>
              ),
            },
            { key: 'phone', header: 'Phone', render: (row) => row.phone || '—' },
            { key: 'address', header: 'Address', render: (row) => row.address || '—' },
            {
              key: 'registered',
              header: 'Registered',
              render: (row) => <DateText iso={nepalDateOf(row.created_at)} />,
            },
          ]}
        />
      </Card>
      {adding && (
        <PatientForm
          patient={null}
          onClose={() => setAdding(false)}
          onSaved={(p) => navigate(`/patients/${p.id}`)}
        />
      )}
    </>
  )
}

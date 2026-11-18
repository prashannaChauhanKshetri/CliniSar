/**
 * Order lab tests. A doctor orders from their visit; the lab technician can also order
 * for a patient who came on their own (the report then says "Consultant: Self").
 * One order gets one Lab No. and one bill with a line per test.
 */
import { MultiSelect, Text } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { getErrorMessage } from '../../api/errors'
import { labOrdersApi, labTestsApi, patientsApi, type Appointment } from '../../api/resources'
import { FormModal } from '../../components/FormModal'
import { RemoteSelect } from '../../components/RemoteSelect'
import { formatBS } from '../../lib/date'
import { formatRs } from '../../lib/money'
import { notifySuccess } from '../../lib/notify'

export function OrderLabTestsModal({
  appointment,
  onClose,
}: {
  appointment: Appointment | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [patient, setPatient] = useState<string | null>(null)
  const [tests, setTests] = useState<string[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const catalogue = useQuery({
    queryKey: ['lab-tests', 'active'],
    queryFn: () => labTestsApi.list({ is_active: true, page_size: 100 }),
  })

  const order = useMutation({
    mutationFn: () =>
      labOrdersApi.create(
        appointment ? { appointment: appointment.id, tests } : { patient: patient!, tests },
      ),
    onSuccess: (created) => {
      notifySuccess(
        `Lab No. ${created.lab_number} for ${created.patient_name}. Its bill is ready at Invoices.`,
        'Tests ordered',
      )
      void queryClient.invalidateQueries({ queryKey: ['lab-orders'] })
      void queryClient.invalidateQueries({ queryKey: ['invoices'] })
      onClose()
      navigate(`/lab-orders/${created.id}`)
    },
    onError: (error) => setProblem(getErrorMessage(error)),
  })

  return (
    <FormModal
      opened
      onClose={onClose}
      title={
        appointment
          ? `Lab tests for ${appointment.patient_name}`
          : 'New lab order (patient came on their own)'
      }
      submitLabel="Order tests"
      submitting={order.isPending}
      onSubmit={(event) => {
        event.preventDefault()
        if (!appointment && !patient) return setProblem('Choose the patient.')
        if (tests.length === 0) return setProblem('Choose at least one test.')
        setProblem(null)
        order.mutate()
      }}
    >
      {appointment ? (
        <Text size="sm" c="dimmed">
          From the visit on {formatBS(appointment.date)}.
        </Text>
      ) : (
        <RemoteSelect
          label="Patient"
          required
          placeholder="Type a name or phone"
          queryKey="patients"
          fetchOptions={async (search) =>
            (await patientsApi.list({ search, page_size: 20 })).results.map((p) => ({
              value: p.id,
              label: `${p.full_name}${p.phone ? ` · ${p.phone}` : ''}`,
            }))
          }
          value={patient}
          onChange={(value) => setPatient(value)}
        />
      )}
      <MultiSelect
        label="Tests"
        required
        searchable
        placeholder="Choose one or more tests"
        data={(catalogue.data?.results ?? []).map((test) => ({
          value: test.id,
          label: `${test.name} · ${formatRs(test.price)}`,
        }))}
        value={tests}
        onChange={setTests}
        nothingFoundMessage="No test with that name"
      />
      {problem && (
        <Text size="sm" c="danger.6" role="alert">
          {problem}
        </Text>
      )}
    </FormModal>
  )
}

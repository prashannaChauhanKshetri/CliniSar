/**
 * Add a walk-in to today's queue, or book a time slot. The steps follow how the front
 * desk works: who is the patient, which doctor, walk-in or booked time, then confirm.
 */
import {
  Alert,
  Button,
  Card,
  Group,
  SegmentedControl,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Textarea,
  Title,
  UnstyledButton,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Info, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { getErrorMessage } from '../../api/errors'
import { appointmentsApi, doctorsApi, patientsApi, schedulesApi } from '../../api/resources'
import { BsDatePicker } from '../../components/BsDatePicker'
import { PageHeader } from '../../components/PageHeader'
import { RemoteSelect } from '../../components/RemoteSelect'
import { formatBS, todayInNepal } from '../../lib/date'
import { formatTime } from '../../lib/forms'
import { formatRs } from '../../lib/money'
import { notifySuccess } from '../../lib/notify'
import { PatientForm } from '../patients/PatientForm'
import classes from './NewAppointmentPage.module.css'

type VisitType = 'WALK_IN' | 'SCHEDULED'

export function NewAppointmentPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const today = todayInNepal()
  const [patient, setPatient] = useState<{ id: string; name: string } | null>(null)
  const [registering, setRegistering] = useState(false)
  const [doctorId, setDoctorId] = useState<string | null>(null)
  const [visitType, setVisitType] = useState<VisitType>('WALK_IN')
  const [day, setDay] = useState<string | null>(today)
  const [slot, setSlot] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const doctors = useQuery({
    queryKey: ['doctors', 'all'],
    queryFn: () => doctorsApi.list({ page_size: 100 }),
  })
  const activeDoctors = (doctors.data?.results ?? []).filter((d) => d.is_active)
  const doctor = activeDoctors.find((d) => d.id === doctorId)
  const slots = useQuery({
    queryKey: ['slots', doctorId, day],
    queryFn: () => schedulesApi.slots(doctorId!, day!),
    enabled: visitType === 'SCHEDULED' && !!doctorId && !!day,
  })

  const book = useMutation({
    mutationFn: () =>
      appointmentsApi.create({
        visit_type: visitType,
        patient: patient!.id,
        doctor: doctorId!,
        reason,
        ...(visitType === 'SCHEDULED' ? { date: day!, start_time: slot! } : {}),
      }),
    onSuccess: (visit) => {
      const when =
        visit.visit_type === 'WALK_IN'
          ? `queue number ${visit.queue_number} today`
          : `${formatBS(visit.date)} at ${formatTime(visit.start_time)}`
      notifySuccess(
        `${visit.patient_name} with Dr. ${visit.doctor_name}, ${when}. The consultation bill is ready at Invoices.`,
        'Appointment saved',
      )
      void queryClient.invalidateQueries({ queryKey: ['appointments'] })
      void queryClient.invalidateQueries({ queryKey: ['invoices'] })
      navigate(`/appointments?date=${visit.date}`)
    },
    onError: (error) => {
      setProblem(getErrorMessage(error))
      setSlot(null)
      void slots.refetch() // a 409 means someone just took the slot: show the fresh list
    },
  })

  const missing = !patient
    ? 'Choose the patient.'
    : !doctorId
      ? 'Choose the doctor.'
      : visitType === 'SCHEDULED' && !slot
        ? 'Pick a time slot.'
        : null

  return (
    <>
      <PageHeader
        title="New appointment"
        description="Add a walk-in to today’s queue, or book a time."
        back={{ to: '/appointments', label: 'Appointments' }}
      />
      <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="lg">
        <Card style={{ gridColumn: 'span 2' }}>
          <Stack gap="lg">
            <Stack gap="sm">
              <Title order={2} fz={16}>
                1. Patient
              </Title>
              <Group align="flex-end" gap="md">
                <RemoteSelect
                  label="Patient"
                  placeholder="Type a name or phone number"
                  queryKey="patients"
                  fetchOptions={async (search) =>
                    (await patientsApi.list({ search, page_size: 20 })).results.map((p) => ({
                      value: p.id,
                      label: `${p.full_name}${p.phone ? ` · ${p.phone}` : ''}${p.address ? ` · ${p.address}` : ''}`,
                    }))
                  }
                  value={patient?.id ?? null}
                  selectedLabel={patient?.name}
                  onChange={(value, option) =>
                    setPatient(value && option ? { id: value, name: option.label } : null)
                  }
                  w={420}
                  maw="100%"
                />
                <Button
                  variant="light"
                  leftSection={<UserPlus size={16} />}
                  onClick={() => setRegistering(true)}
                >
                  New patient
                </Button>
              </Group>
            </Stack>

            <Stack gap="sm">
              <Title order={2} fz={16}>
                2. Doctor
              </Title>
              {doctors.isPending ? (
                <Skeleton h={36} w={420} />
              ) : (
                <Select
                  label="Doctor"
                  placeholder="Choose a doctor"
                  data={activeDoctors.map((d) => ({
                    value: d.id,
                    label: `Dr. ${d.first_name} ${d.last_name}${d.department_name ? ` · ${d.department_name}` : ''}`,
                  }))}
                  value={doctorId}
                  onChange={(value) => {
                    setDoctorId(value)
                    setSlot(null)
                  }}
                  searchable
                  w={420}
                  maw="100%"
                />
              )}
            </Stack>

            <Stack gap="sm">
              <Title order={2} fz={16}>
                3. When
              </Title>
              <SegmentedControl
                w={360}
                value={visitType}
                onChange={(value) => {
                  setVisitType(value as VisitType)
                  setSlot(null)
                }}
                data={[
                  { value: 'WALK_IN', label: 'Walk-in today' },
                  { value: 'SCHEDULED', label: 'Book a time' },
                ]}
              />
              {visitType === 'WALK_IN' ? (
                <Text size="sm" c="dimmed">
                  The patient joins today’s queue for this doctor and gets the next number.
                </Text>
              ) : (
                <Stack gap="md">
                  <BsDatePicker
                    label="Day"
                    value={day}
                    minDate={today}
                    onChange={(value) => {
                      setDay(value)
                      setSlot(null)
                    }}
                  />
                  <SlotPicker
                    loading={slots.isFetching}
                    doctorChosen={!!doctorId}
                    slots={slots.data}
                    selected={slot}
                    onSelect={setSlot}
                  />
                </Stack>
              )}
            </Stack>
            <Textarea
              label="Reason for the visit"
              placeholder="e.g. Fever for three days"
              autosize
              minRows={2}
              value={reason}
              onChange={(e) => setReason(e.currentTarget.value)}
            />
          </Stack>
        </Card>

        <Card>
          <Stack gap="md">
            <Title order={2} fz={16}>
              Summary
            </Title>
            <Summary label="Patient" value={patient?.name.split(' · ')[0]} />
            <Summary
              label="Doctor"
              value={doctor && `Dr. ${doctor.first_name} ${doctor.last_name}`}
            />
            <Summary
              label="When"
              value={
                visitType === 'WALK_IN'
                  ? `Today (${formatBS(today)}), next in queue`
                  : slot && day
                    ? `${formatBS(day)} at ${formatTime(slot)}`
                    : undefined
              }
            />
            {doctor && (
              <Alert color="primary" variant="light" icon={<Info size={18} />}>
                A consultation bill of {formatRs(doctor.consultation_fee)} (plus VAT if switched on)
                is created with the appointment.
              </Alert>
            )}
            {problem && (
              <Alert
                color="danger"
                variant="light"
                role="alert"
                withCloseButton
                onClose={() => setProblem(null)}
              >
                {problem}
              </Alert>
            )}
            <Button
              size="md"
              disabled={!!missing}
              loading={book.isPending}
              onClick={() => {
                setProblem(null)
                book.mutate()
              }}
            >
              {visitType === 'WALK_IN' ? 'Add to queue' : 'Book appointment'}
            </Button>
            {missing && (
              <Text size="xs" c="dimmed" ta="center">
                {missing}
              </Text>
            )}
          </Stack>
        </Card>
      </SimpleGrid>
      {registering && (
        <PatientForm
          patient={null}
          onClose={() => setRegistering(false)}
          onSaved={(saved) => setPatient({ id: saved.id, name: saved.full_name })}
        />
      )}
    </>
  )
}

function Summary({ label, value }: { label: string; value?: string | null }) {
  return (
    <Group justify="space-between" gap="md" wrap="nowrap">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text size="sm" fw={500} ta="right">
        {value || '—'}
      </Text>
    </Group>
  )
}

function SlotPicker({
  loading,
  doctorChosen,
  slots,
  selected,
  onSelect,
}: {
  loading: boolean
  doctorChosen: boolean
  slots?: { start_time: string; end_time: string }[]
  selected: string | null
  onSelect: (slot: string) => void
}) {
  if (!doctorChosen)
    return (
      <Text size="sm" c="dimmed">
        Choose a doctor to see free times.
      </Text>
    )
  if (loading) return <Skeleton h={80} />
  if (!slots || slots.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No free times on this day. The doctor may not work that day, or every slot is taken.
      </Text>
    )
  }
  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        Free times
      </Text>
      <div className={classes.slots} role="radiogroup" aria-label="Free times">
        {slots.map((s) => (
          <UnstyledButton
            key={s.start_time}
            className={classes.slot}
            role="radio"
            aria-checked={selected === s.start_time}
            data-selected={selected === s.start_time || undefined}
            onClick={() => onSelect(s.start_time)}
          >
            {formatTime(s.start_time)}
          </UnstyledButton>
        ))}
      </div>
    </Stack>
  )
}

/** "My schedule": a doctor sets their own weekly working hours. */
import { Card } from '@mantine/core'
import { PageHeader } from '../../components/PageHeader'
import { useAuth } from '../auth/useAuth'
import { ScheduleEditor } from './ScheduleEditor'

export function SchedulePage() {
  const { user } = useAuth()
  return (
    <>
      <PageHeader
        title="My schedule"
        description="Your weekly working hours. Patients can be booked into these slots; walk-ins can come any time."
      />
      <Card>{user?.doctor_profile_id && <ScheduleEditor doctorId={user.doctor_profile_id} />}</Card>
    </>
  )
}

/**
 * The first screen after signing in. It opens on TODAY's work for each role, instead of
 * generic statistics; the clinic's figures over time sit below for admin and front desk.
 */
import { Text, Title } from '@mantine/core'
import { formatBS, todayInNepal, weekdayOf } from '../../lib/date'
import { useAuth } from '../auth/useAuth'
import { DoctorToday } from './DoctorToday'
import { FrontDeskToday } from './FrontDeskToday'
import { LabToday } from './LabToday'
import { PharmacyToday } from './PharmacyToday'

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function DashboardPage() {
  const { user } = useAuth()
  if (!user) return null
  const today = todayInNepal()
  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <Title order={1} fz={24}>
          Today
        </Title>
        <Text size="sm" c="dimmed">
          {WEEKDAY_NAMES[weekdayOf(today)]}, {formatBS(today)}
        </Text>
      </div>
      {user.role === 'DOCTOR' && <DoctorToday />}
      {user.role === 'PHARMACIST' && <PharmacyToday />}
      {user.role === 'LAB_TECHNICIAN' && <LabToday />}
      {(user.role === 'CLINIC_ADMIN' || user.role === 'STAFF') && (
        <FrontDeskToday isAdmin={user.role === 'CLINIC_ADMIN'} />
      )}
    </>
  )
}

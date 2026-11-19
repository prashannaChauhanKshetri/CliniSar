/**
 * The day as a board: one column per doctor, patients in calling order, the next
 * patient highlighted, and those already seen folded away at the bottom.
 */
import { Badge, Card, Collapse, EmptyState, SimpleGrid, Text, UnstyledButton } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { CalendarCheck } from 'lucide-react'
import type { Appointment } from '../../api/resources'
import { nepalClock, queueByDoctor, type DoctorQueue } from '../../lib/queue'
import classes from './Queue.module.css'
import type { VisitActions } from './useVisitActions'
import { VisitRow } from './VisitRow'

export function QueueBoard({
  visits,
  actions,
  isDoctor,
  isToday,
}: {
  visits: Appointment[]
  actions: VisitActions
  isDoctor: boolean
  /** Only on today's board does "next" make sense. */
  isToday: boolean
}) {
  const columns = queueByDoctor(visits, nepalClock())
  if (columns.length === 0) {
    return <EmptyState icon={<CalendarCheck size={28} />} title="No visits on this day" py="xl" />
  }
  return (
    <SimpleGrid
      cols={{ base: 1, md: Math.min(columns.length, 2), xl: Math.min(columns.length, 3) }}
      spacing="lg"
    >
      {columns.map((column) => (
        <DoctorColumn
          key={column.doctorId}
          column={column}
          actions={actions}
          isDoctor={isDoctor}
          isToday={isToday}
        />
      ))}
    </SimpleGrid>
  )
}

function DoctorColumn({
  column,
  actions,
  isDoctor,
  isToday,
}: {
  column: DoctorQueue
  actions: VisitActions
  isDoctor: boolean
  isToday: boolean
}) {
  const [showDone, { toggle }] = useDisclosure(false)
  return (
    <Card padding="md">
      <div className={classes.columnHeader}>
        <div>
          <Text fw={600} size="sm">
            Dr. {column.doctorName}
          </Text>
          {column.department && (
            <Text size="xs" c="dimmed">
              {column.department}
            </Text>
          )}
        </div>
        <Badge variant="light" color={column.waiting.length ? 'primary' : 'grey'}>
          {column.waiting.length} waiting
        </Badge>
      </div>
      <div className={classes.column}>
        {column.waiting.length === 0 && (
          <Text size="sm" c="dimmed" px="sm" py="xs">
            Nobody waiting.
          </Text>
        )}
        {column.waiting.map((visit, index) => (
          <VisitRow
            key={visit.id}
            visit={visit}
            actions={actions}
            isDoctor={isDoctor}
            next={isToday && index === 0}
          />
        ))}
        {column.done.length > 0 && (
          <>
            <UnstyledButton onClick={toggle} px="sm" py={4}>
              <Text size="xs" c="dimmed">
                {showDone ? 'Hide' : 'Show'} {column.done.length} seen or cancelled
              </Text>
            </UnstyledButton>
            <Collapse expanded={showDone}>
              <div className={classes.column}>
                {column.done.map((visit) => (
                  <VisitRow key={visit.id} visit={visit} actions={actions} isDoctor={isDoctor} />
                ))}
              </div>
            </Collapse>
          </>
        )}
      </div>
    </Card>
  )
}

/** One visit in a queue: time or queue number, patient, reason, and quick actions. */
import {
  ActionIcon,
  Anchor,
  Badge,
  Group,
  Menu,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import { Check, ClipboardPlus, FlaskConical, MoreHorizontal, X } from 'lucide-react'
import { Link } from 'react-router'
import type { Appointment } from '../../api/resources'
import { StatusBadge } from '../../components/StatusBadge'
import { visitLabel } from '../../lib/history'
import { visitSlot } from '../../lib/queue'
import classes from './Queue.module.css'
import type { VisitActions } from './useVisitActions'

export function VisitRow({
  visit,
  actions,
  isDoctor,
  next = false,
}: {
  visit: Appointment
  actions: VisitActions
  isDoctor: boolean
  /** Highlight as the patient to call now. */
  next?: boolean
}) {
  const waiting = visit.status === 'BOOKED'
  // NP: Patient pahila aaisakeko cha bhane "3rd visit" jasto sano badge, doctor lai thaha hos.
  const returning = visitLabel(visit.previous_visits)
  return (
    <div className={classes.row} data-next={next || undefined} data-done={!waiting || undefined}>
      <span
        className={classes.slot}
        title={visit.visit_type === 'WALK_IN' ? 'Walk-in queue number' : 'Booked time'}
      >
        {visitSlot(visit)}
      </span>
      <div className={classes.who}>
        <Anchor
          component={Link}
          to={`/patients/${visit.patient}`}
          size="sm"
          fw={500}
          c="inherit"
          className={classes.name}
        >
          {visit.patient_name}
        </Anchor>
        {(returning || visit.reason) && (
          <Group gap={6} wrap="nowrap" className={classes.meta}>
            {returning && (
              <Badge size="xs" variant="light" style={{ flexShrink: 0 }}>
                {returning}
              </Badge>
            )}
            {visit.reason && (
              <Text size="xs" c="dimmed" truncate="end">
                {visit.reason}
              </Text>
            )}
          </Group>
        )}
      </div>
      {waiting ? (
        <VisitActionButtons visit={visit} actions={actions} isDoctor={isDoctor} />
      ) : (
        <StatusBadge status={visit.status} />
      )}
    </div>
  )
}

/** "Seen" plus the menu of other actions; used on the board and in the list. */
export function VisitActionButtons({
  visit,
  actions,
  isDoctor,
}: {
  visit: Appointment
  actions: VisitActions
  isDoctor: boolean
}) {
  return (
    <Group gap={4} wrap="nowrap">
      <Tooltip label="Seen">
        <ActionIcon
          variant="light"
          color="success"
          aria-label={`Mark ${visit.patient_name} as seen`}
          loading={actions.markingId === visit.id}
          onClick={() => actions.markSeen(visit)}
        >
          <Check size={16} />
        </ActionIcon>
      </Tooltip>
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <UnstyledButton
            className={classes.more}
            aria-label={`More actions for ${visit.patient_name}`}
          >
            <MoreHorizontal size={16} />
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          {isDoctor && (
            <>
              <Menu.Item
                leftSection={<ClipboardPlus size={16} />}
                onClick={() => actions.prescribe(visit)}
              >
                Write prescription
              </Menu.Item>
              <Menu.Item
                leftSection={<FlaskConical size={16} />}
                onClick={() => actions.orderTests(visit)}
              >
                Order lab tests
              </Menu.Item>
            </>
          )}
          <Menu.Item component={Link} to={`/patients/${visit.patient}`}>
            Open patient record
          </Menu.Item>
          <Menu.Item
            color="danger"
            leftSection={<X size={16} />}
            onClick={() => actions.cancel(visit)}
          >
            Cancel visit
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  )
}

import { ActionIcon, Indicator, Menu, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { Link } from 'react-router'
import { fetchSummary } from '../../api/dashboard'
import type { Role } from '../../api/types'
import { alertsFrom } from './alerts'

/** The bell in the top bar: a short list of things that need attention today. */
export function AlertsMenu({ role }: { role: Role }) {
  const { data } = useQuery({
    queryKey: ['dashboard', 'summary', 'week'],
    queryFn: () => fetchSummary('week'),
    refetchInterval: 60_000,
  })
  const alerts = alertsFrom(data, role)

  return (
    <Menu position="bottom-end" width={300} shadow="md">
      <Menu.Target>
        <Indicator
          label={alerts.length}
          size={18}
          color="danger"
          disabled={!alerts.length}
          offset={4}
        >
          <ActionIcon
            variant="subtle"
            color="grey"
            size="lg"
            aria-label={
              alerts.length === 0
                ? 'Alerts'
                : `${alerts.length} ${alerts.length === 1 ? 'alert' : 'alerts'}`
            }
          >
            <Bell size={20} strokeWidth={1.75} />
          </ActionIcon>
        </Indicator>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Needs attention</Menu.Label>
        {alerts.length === 0 && (
          <Text size="sm" c="dimmed" px="sm" py="sm">
            Nothing needs attention right now.
          </Text>
        )}
        {alerts.map((alert) => (
          <Menu.Item key={alert.text} component={Link} to={alert.path}>
            {alert.text}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  )
}

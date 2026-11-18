import { Avatar, Group, Menu, Stack, Text, UnstyledButton } from '@mantine/core'
import { ChevronDown, LogOut, Settings, UserRound } from 'lucide-react'
import { Link } from 'react-router'
import { ROLE_LABELS, type User } from '../../api/types'
import { useAuth } from '../../features/auth/useAuth'
import { canOpen } from '../../routes/navigation'

function initials(user: User): string {
  return `${user.first_name[0] ?? ''}${user.last_name[0] ?? ''}`.toUpperCase() || '?'
}

/** The avatar in the top bar: who is signed in, at which clinic, and sign out. */
export function UserMenu({ user }: { user: User }) {
  const { signOut } = useAuth()
  const name = `${user.first_name} ${user.last_name}`.trim() || user.email

  return (
    <Menu position="bottom-end" width={240} shadow="md">
      <Menu.Target>
        <UnstyledButton aria-label={`Account menu for ${name}`}>
          <Group gap="sm" wrap="nowrap">
            <Avatar color="primary" radius="xl" size={40}>
              {initials(user)}
            </Avatar>
            <Stack gap={0} visibleFrom="sm">
              <Text size="sm" fw={600} lh={1.3}>
                {name}
              </Text>
              <Text size="xs" c="dimmed" lh={1.3}>
                {ROLE_LABELS[user.role]}
              </Text>
            </Stack>
            <ChevronDown size={16} aria-hidden="true" />
          </Group>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{user.clinic?.name}</Menu.Label>
        <Menu.Item component={Link} to="/profile" leftSection={<UserRound size={16} />}>
          My profile
        </Menu.Item>
        {canOpen(user.role, '/settings') && (
          <Menu.Item component={Link} to="/settings" leftSection={<Settings size={16} />}>
            Clinic settings
          </Menu.Item>
        )}
        <Menu.Divider />
        <Menu.Item color="danger" leftSection={<LogOut size={16} />} onClick={() => void signOut()}>
          Sign out
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}

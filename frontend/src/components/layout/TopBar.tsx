import { ActionIcon, Burger, Group, Kbd, TextInput } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { Search } from 'lucide-react'
import { useRef, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../../features/auth/useAuth'
import { canOpen } from '../../routes/navigation'
import { AlertsMenu } from './AlertsMenu'
import { UserMenu } from './UserMenu'

/** White top bar: menu button (small screens), patient search, alerts, account. */
export function TopBar({
  menuOpened,
  onToggleMenu,
}: {
  menuOpened: boolean
  onToggleMenu: () => void
}) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const searchRef = useRef<HTMLInputElement>(null)
  // Shortcut for frequent users: press "/" anywhere to jump to the search box.
  useHotkeys([['/', () => searchRef.current?.focus()]])
  if (!user) return null

  const canSearch = canOpen(user.role, '/patients')

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = searchRef.current?.value.trim()
    if (text) navigate(`/patients?search=${encodeURIComponent(text)}`)
  }

  return (
    <Group h="100%" px={{ base: 'md', sm: 'lg' }} justify="space-between" wrap="nowrap" gap="md">
      <Group gap="md" wrap="nowrap" flex={1}>
        <Burger
          opened={menuOpened}
          onClick={onToggleMenu}
          hiddenFrom="lg"
          size="sm"
          aria-label={menuOpened ? 'Close menu' : 'Open menu'}
        />
        {canSearch && (
          <form onSubmit={search} role="search" style={{ flex: 1, maxWidth: 420 }}>
            <TextInput
              ref={searchRef}
              aria-label="Search patients"
              placeholder="Search patients by name or phone"
              leftSection={<Search size={16} aria-hidden="true" />}
              rightSection={<Kbd size="xs">/</Kbd>}
              visibleFrom="sm"
            />
          </form>
        )}
      </Group>
      <Group gap="md" wrap="nowrap">
        {canSearch && (
          <ActionIcon
            component={Link}
            to="/patients"
            hiddenFrom="sm"
            variant="subtle"
            color="grey"
            size="lg"
            aria-label="Search patients"
          >
            <Search size={20} strokeWidth={1.75} />
          </ActionIcon>
        )}
        <AlertsMenu role={user.role} />
        <UserMenu user={user} />
      </Group>
    </Group>
  )
}

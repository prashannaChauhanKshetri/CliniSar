import { AppShell, CloseButton, ScrollArea, Stack } from '@mantine/core'
import { LogOut, Settings } from 'lucide-react'
import { NavLink } from 'react-router'
import { useAuth } from '../../features/auth/useAuth'
import { canOpen, navFor } from '../../routes/navigation'
import { Logo } from '../Logo'
import classes from './Sidebar.module.css'

/**
 * The menu. Shows only the screens the user's role may open. `onClose` closes the
 * drawer on small screens (after picking a page, or with the X button).
 */
export function Sidebar({ onClose }: { onClose: () => void }) {
  const { user, signOut } = useAuth()
  if (!user) return null

  return (
    <>
      <div className={classes.brand}>
        <Logo onDark />
        <CloseButton
          hiddenFrom="lg"
          ml="auto"
          size="lg"
          variant="transparent"
          c="white"
          aria-label="Close menu"
          onClick={onClose}
        />
      </div>

      <AppShell.Section grow component={ScrollArea} px="md" pb="md">
        <nav aria-label="Main menu">
          {navFor(user.role).map((section) => (
            <div key={section.title ?? 'main'}>
              {section.title && <div className={classes.section}>{section.title}</div>}
              <Stack gap={4} mt={section.title ? 0 : 'md'}>
                {section.items.map(({ path, label, icon: Icon }) => (
                  <NavLink key={path} to={path} className={classes.link} onClick={onClose}>
                    <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                    {label}
                  </NavLink>
                ))}
              </Stack>
            </div>
          ))}
        </nav>
      </AppShell.Section>

      <AppShell.Section className={classes.footer}>
        <Stack gap={4}>
          {canOpen(user.role, '/settings') && (
            <NavLink to="/settings" className={classes.link} onClick={onClose}>
              <Settings size={20} strokeWidth={1.75} aria-hidden="true" />
              Settings
            </NavLink>
          )}
          <button type="button" className={classes.link} onClick={() => void signOut()}>
            <LogOut size={20} strokeWidth={1.75} aria-hidden="true" />
            Sign out
          </button>
        </Stack>
      </AppShell.Section>
    </>
  )
}

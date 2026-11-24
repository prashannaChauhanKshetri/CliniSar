import { AppShell, Box } from '@mantine/core'
import { useDisclosure, useDocumentTitle, useHotkeys } from '@mantine/hooks'
import { Outlet, useLocation } from 'react-router'
import { screenFor } from '../../routes/navigation'
import classes from './Sidebar.module.css'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

/**
 * The frame around every signed-in page: a fixed 260px blue sidebar, a white top bar,
 * and the page on a light grey background. Below 1024px the sidebar becomes a drawer.
 */
export function AppLayout() {
  const [menuOpened, { toggle, close }] = useDisclosure(false)
  useHotkeys([['Escape', close]]) // the drawer always closes with Esc
  // The browser tab names the screen, as in the brand guide: "Dashboard · CliniSar".
  const screen = screenFor(useLocation().pathname)
  useDocumentTitle(screen ? `${screen.label} · CliniSar` : 'CliniSar')

  return (
    <AppShell
      layout="alt"
      header={{ height: 64 }}
      navbar={{ width: 260, breakpoint: 'lg', collapsed: { mobile: !menuOpened } }}
      padding={0}
    >
      <AppShell.Header>
        <TopBar menuOpened={menuOpened} onToggleMenu={toggle} />
      </AppShell.Header>
      <AppShell.Navbar className={classes.navbar}>
        <Sidebar onClose={close} />
      </AppShell.Navbar>
      <AppShell.Main bg="var(--clinisar-page)" mih="100vh">
        <Box component="main" id="main" p={{ base: 'md', sm: 'lg' }} maw={1440} mx="auto">
          <Outlet />
        </Box>
      </AppShell.Main>
    </AppShell>
  )
}

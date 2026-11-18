/** Test helper: render a component with the same providers the real app uses. */
import { MantineProvider, mergeThemeOverrides } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import type { Role, User } from '../api/types'
import { AuthContext, type AuthValue } from '../features/auth/AuthContext'
import { theme } from '../theme'

/**
 * The app theme, plus one test-only change: jsdom does no layout (every element is
 * 0x0), so Mantine would think a popover's anchor is off-screen and hide the dropdown.
 */
const testTheme = mergeThemeOverrides(theme, {
  components: { Popover: { defaultProps: { hideDetached: false } } },
})

export function makeUser(role: Role, overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'sita@clinic.test',
    first_name: 'Sita',
    last_name: 'Sharma',
    phone: '',
    role,
    clinic: { id: 'clinic-1', name: 'Sample Clinic', slug: 'sample' },
    ...overrides,
  }
}

export function fakeAuth(overrides: Partial<AuthValue> = {}): AuthValue {
  return {
    status: 'signed-in',
    user: makeUser('STAFF'),
    notice: null,
    signIn: async () => makeUser('STAFF'),
    signOut: async () => {},
    ...overrides,
  }
}

interface Options {
  auth?: AuthValue
  /** Render inside a router at this address. */
  path?: string
  routes?: RouteObject[]
}

/** Render `ui` (or the given routes) with Mantine, React Query, auth and a router. */
export function renderWithProviders(ui: ReactElement | null, options: Options = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const routes = options.routes ?? [{ path: '*', element: ui }]
  const router = createMemoryRouter(routes, { initialEntries: [options.path ?? '/'] })
  const result = render(
    <MantineProvider theme={testTheme}>
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={options.auth ?? fakeAuth()}>
          <RouterProvider router={router} />
        </AuthContext.Provider>
      </QueryClientProvider>
    </MantineProvider>,
  )
  return { ...result, router, queryClient }
}

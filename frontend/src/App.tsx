/**
 * Puts the app together. Order matters: theme first, then server data (React Query),
 * then the signed-in user (which needs React Query to clear data on sign-out), then
 * the pages.
 */
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { AuthProvider } from './features/auth/AuthProvider'
import { routes } from './routes/router'
import { cssVariablesResolver, theme } from './theme'

/** Retry only problems that may go away (network, 5xx), never "not allowed" or "invalid". */
function shouldRetry(failureCount: number, error: unknown): boolean {
  const status = isAxiosError(error) ? error.response?.status : undefined
  if (status !== undefined && status < 500) return false
  return failureCount < 2
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: shouldRetry },
    mutations: { retry: false },
  },
})

const router = createBrowserRouter(routes)

export function App() {
  return (
    <MantineProvider
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
      defaultColorScheme="light"
    >
      <Notifications position="top-right" />
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </MantineProvider>
  )
}

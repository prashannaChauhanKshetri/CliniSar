import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeAuth, makeUser, renderWithProviders } from '../test/render'
import { RequireAuth } from './RequireAuth'
import { RequireRole } from './RequireRole'

const routes = [
  { path: '/login', element: <p>Login page</p> },
  {
    element: <RequireAuth />,
    children: [
      {
        path: '/medicines',
        element: (
          <RequireRole>
            <p>Medicines page</p>
          </RequireRole>
        ),
      },
    ],
  },
]

describe('route guards', () => {
  it('sends signed-out visitors to the login page', async () => {
    renderWithProviders(null, {
      routes,
      path: '/medicines',
      auth: fakeAuth({ status: 'signed-out', user: null }),
    })
    expect(await screen.findByText('Login page')).toBeInTheDocument()
  })

  it('shows a loader while the session is being checked', () => {
    renderWithProviders(null, {
      routes,
      path: '/medicines',
      auth: fakeAuth({ status: 'checking', user: null }),
    })
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
  })

  it('opens the page for a role that may use it', async () => {
    renderWithProviders(null, {
      routes,
      path: '/medicines',
      auth: fakeAuth({ user: makeUser('PHARMACIST') }),
    })
    expect(await screen.findByText('Medicines page')).toBeInTheDocument()
  })

  it('explains, instead of showing the page, when the role may not use it', async () => {
    renderWithProviders(null, {
      routes,
      path: '/medicines',
      auth: fakeAuth({ user: makeUser('DOCTOR') }),
    })
    expect(await screen.findByText('This page is not for your role')).toBeInTheDocument()
    expect(screen.queryByText('Medicines page')).not.toBeInTheDocument()
  })
})

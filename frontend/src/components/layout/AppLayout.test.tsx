import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { fakeAuth, makeUser, renderWithProviders } from '../../test/render'
import { AppLayout } from './AppLayout'

vi.mock('../../api/dashboard', () => ({
  fetchSummary: async () => ({ stock: null, pending_lab_orders: 1, unpaid_invoices: 0 }),
}))

const routes = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <p>Page body</p> },
      { path: 'lab-orders/:id', element: <p>One order</p> },
    ],
  },
]

describe('AppLayout', () => {
  it('shows the menu for the role, the page, and the account', async () => {
    renderWithProviders(null, { routes, auth: fakeAuth({ user: makeUser('LAB_TECHNICIAN') }) })
    expect(await screen.findByText('Page body')).toBeInTheDocument()
    const menu = screen.getByRole('navigation', { name: 'Main menu' })
    expect(menu).toHaveTextContent('Lab orders')
    expect(menu).not.toHaveTextContent('Patients')
    expect(
      screen.getByRole('button', { name: /account menu for sita sharma/i }),
    ).toBeInTheDocument()
  })

  it('shows the alert count on the bell', async () => {
    renderWithProviders(null, { routes, auth: fakeAuth({ user: makeUser('LAB_TECHNICIAN') }) })
    expect(await screen.findByRole('button', { name: '1 alert' })).toBeInTheDocument()
  })

  it('signs out from the sidebar', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined)
    renderWithProviders(null, { routes, auth: fakeAuth({ signOut }) })
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalledOnce()
  })

  it('names the browser tab after the screen, as in the brand guide', async () => {
    renderWithProviders(null, {
      routes,
      path: '/lab-orders/42',
      auth: fakeAuth({ user: makeUser('LAB_TECHNICIAN') }),
    })
    expect(await screen.findByText('One order')).toBeInTheDocument()
    expect(document.title).toBe('Lab orders · CliniSar')
  })
})

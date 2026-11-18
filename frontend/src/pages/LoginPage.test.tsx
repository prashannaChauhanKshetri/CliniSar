import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders } from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { fakeAuth, makeUser, renderWithProviders } from '../test/render'
import { LoginPage } from './LoginPage'

const routes = [
  { path: '/login', element: <LoginPage /> },
  { path: '/dashboard', element: <p>Dashboard page</p> },
]

function wrongPassword() {
  const config = { headers: new AxiosHeaders() }
  return new AxiosError('401', '401', config, null, {
    data: { detail: 'Incorrect email or password.' },
    status: 401,
    statusText: '',
    headers: {},
    config,
  })
}

describe('LoginPage', () => {
  it('checks the fields before sending anything', async () => {
    const signIn = vi.fn()
    renderWithProviders(null, {
      routes,
      path: '/login',
      auth: fakeAuth({ status: 'signed-out', user: null, signIn }),
    })

    await userEvent.type(screen.getByLabelText(/^email/i, { selector: 'input' }), 'not-an-email')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText(/valid email address/)).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
    expect(signIn).not.toHaveBeenCalled()
  })

  it('shows the server message when the password is wrong', async () => {
    const signIn = vi.fn().mockRejectedValue(wrongPassword())
    renderWithProviders(null, {
      routes,
      path: '/login',
      auth: fakeAuth({ status: 'signed-out', user: null, signIn }),
    })

    await userEvent.type(
      screen.getByLabelText(/^email/i, { selector: 'input' }),
      'sita@clinic.test',
    )
    await userEvent.type(screen.getByLabelText(/^password/i, { selector: 'input' }), 'wrong-pass')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.')
    expect(signIn).toHaveBeenCalledWith('sita@clinic.test', 'wrong-pass')
  })

  it('goes to the dashboard after signing in', async () => {
    const signIn = vi.fn().mockResolvedValue(makeUser('STAFF'))
    renderWithProviders(null, {
      routes,
      path: '/login',
      auth: fakeAuth({ status: 'signed-out', user: null, signIn }),
    })

    await userEvent.type(
      screen.getByLabelText(/^email/i, { selector: 'input' }),
      'sita@clinic.test',
    )
    await userEvent.type(screen.getByLabelText(/^password/i, { selector: 'input' }), 'right-pass')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Dashboard page')).toBeInTheDocument()
  })

  it('shows why the user was signed out', () => {
    renderWithProviders(null, {
      routes,
      path: '/login',
      auth: fakeAuth({
        status: 'signed-out',
        user: null,
        notice: 'Your session has ended. Please sign in again.',
      }),
    })
    expect(screen.getByText('Your session has ended. Please sign in again.')).toBeInTheDocument()
  })
})

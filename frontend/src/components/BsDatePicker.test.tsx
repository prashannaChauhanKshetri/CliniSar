import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../test/render'
import { BsDatePicker } from './BsDatePicker'

function Picker({
  start,
  onPicked,
  minDate,
}: {
  start: string | null
  onPicked: (v: string | null) => void
  minDate?: string
}) {
  const [value, setValue] = useState(start)
  return (
    <BsDatePicker
      label="Expiry date"
      value={value}
      minDate={minDate}
      clearable
      onChange={(next) => {
        setValue(next)
        onPicked(next)
      }}
    />
  )
}

describe('BsDatePicker', () => {
  it('shows the chosen date in BS with the AD date underneath', async () => {
    renderWithProviders(<Picker start="2026-11-18" onPicked={() => {}} />)
    expect(await screen.findByRole('button', { name: /expiry date/i })).toHaveTextContent(
      '2083 Mangsir 2',
    )
    expect(screen.getByText('AD 18 Nov 2026')).toBeInTheDocument()
  })

  it('gives the form the AD date of the BS day that was clicked', async () => {
    const onPicked = vi.fn()
    renderWithProviders(<Picker start="2026-11-18" onPicked={onPicked} />)

    await userEvent.click(await screen.findByRole('button', { name: /expiry date/i }))
    await userEvent.click(
      await screen.findByRole('button', { name: '2083 Mangsir 15 (1 Dec 2026)' }),
    )

    expect(onPicked).toHaveBeenCalledWith('2026-12-01')
  })

  it('moves between BS months', async () => {
    const onPicked = vi.fn()
    renderWithProviders(<Picker start="2026-11-18" onPicked={onPicked} />)
    await userEvent.click(await screen.findByRole('button', { name: /expiry date/i }))
    await userEvent.click(await screen.findByRole('button', { name: 'Next month' }))
    await userEvent.click(await screen.findByRole('button', { name: /^2083 Poush 1 / }))
    expect(onPicked).toHaveBeenCalledWith('2026-12-16')
  })

  it('does not allow days before the minimum date', async () => {
    const onPicked = vi.fn()
    renderWithProviders(<Picker start="2026-11-18" onPicked={onPicked} minDate="2026-11-18" />)
    await userEvent.click(await screen.findByRole('button', { name: /expiry date/i }))
    expect(
      await screen.findByRole('button', { name: '2083 Mangsir 1 (17 Nov 2026)' }),
    ).toBeDisabled()
  })

  it('can be cleared', async () => {
    const onPicked = vi.fn()
    renderWithProviders(<Picker start="2026-11-18" onPicked={onPicked} />)
    await userEvent.click(await screen.findByRole('button', { name: /expiry date/i }))
    await userEvent.click(await screen.findByRole('button', { name: 'Clear' }))
    expect(onPicked).toHaveBeenCalledWith(null)
  })
})

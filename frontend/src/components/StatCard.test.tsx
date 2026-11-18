import { screen } from '@testing-library/react'
import { Users } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '../test/render'
import { StatCard } from './StatCard'

describe('StatCard', () => {
  it('shows a rise with a plus sign', async () => {
    renderWithProviders(
      <StatCard
        label="Appointments"
        value={10}
        changePercent={42.9}
        comparedTo="vs previous week"
        icon={Users}
      />,
    )
    expect(await screen.findByText('10')).toBeInTheDocument()
    expect(screen.getByText('+42.9%')).toBeInTheDocument()
  })

  it('shows a fall with a minus sign', async () => {
    renderWithProviders(
      <StatCard
        label="Earnings"
        value="Rs. 1.00"
        changePercent={-6.9}
        comparedTo="vs previous month"
        icon={Users}
      />,
    )
    expect(await screen.findByText('-6.9%')).toBeInTheDocument()
  })

  it('says so when there is nothing to compare', async () => {
    renderWithProviders(
      <StatCard
        label="VAT"
        value="Rs. 0.00"
        changePercent={null}
        comparedTo="vs previous week"
        icon={Users}
      />,
    )
    expect(await screen.findByText('No earlier figures to compare')).toBeInTheDocument()
  })
})

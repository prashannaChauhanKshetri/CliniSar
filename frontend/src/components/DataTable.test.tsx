import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../test/render'
import { DataTable, type Column } from './DataTable'

interface Row {
  id: string
  name: string
}
const columns: Column<Row>[] = [{ key: 'name', header: 'Name', render: (row) => row.name }]
const empty = { title: 'No patients yet', description: 'Add the first patient.' }

describe('DataTable', () => {
  it('shows rows and the page position', async () => {
    const onChange = vi.fn()
    renderWithProviders(
      <DataTable
        caption="Patients"
        columns={columns}
        rows={[{ id: '1', name: 'Ram Thapa' }]}
        rowKey={(row) => row.id}
        empty={empty}
        pagination={{ page: 2, total: 45, onChange }}
      />,
    )
    expect(await screen.findByText('Ram Thapa')).toBeInTheDocument()
    expect(screen.getByText('Showing 21–40 of 45')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '3' }))
    expect(onChange).toHaveBeenCalledWith(3)
  })

  it('shows a skeleton while loading', async () => {
    renderWithProviders(
      <DataTable
        caption="Patients"
        columns={columns}
        rows={undefined}
        rowKey={(r) => r.id}
        empty={empty}
        loading
      />,
    )
    expect(await screen.findByRole('table')).toHaveAttribute('aria-busy', 'true')
  })

  it('explains an empty list', async () => {
    renderWithProviders(
      <DataTable
        caption="Patients"
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        empty={empty}
      />,
    )
    expect(await screen.findByText('No patients yet')).toBeInTheDocument()
    expect(screen.getByText('Add the first patient.')).toBeInTheDocument()
  })

  it('offers "Try again" when loading failed', async () => {
    const onRetry = vi.fn()
    renderWithProviders(
      <DataTable
        caption="Patients"
        columns={columns}
        rows={undefined}
        rowKey={(r) => r.id}
        empty={empty}
        error={new Error('x')}
        onRetry={onRetry}
      />,
    )
    await userEvent.click(await screen.findByRole('button', { name: /try again/i }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})

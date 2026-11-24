import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Logo } from './Logo'

describe('Logo', () => {
  it('follows the brand guide: four arms, one core, mark 1.1 x the wordmark', () => {
    render(<Logo size={20} />)
    const logo = screen.getByRole('img', { name: 'CliniSar' })
    const mark = logo.querySelector('svg')!
    expect(mark.querySelectorAll('rect')).toHaveLength(4)
    expect(mark.querySelectorAll('circle')).toHaveLength(1)
    expect(mark.getAttribute('width')).toBe('22')
    expect(logo).toHaveTextContent('CliniSar')
  })

  it('uses only the colours the guide allows for each background', () => {
    const { container } = render(
      <>
        <Logo variant="colour" />
        <Logo variant="onBlue" />
        <Logo variant="black" />
      </>,
    )
    const fills = [...container.querySelectorAll('svg')].map((svg) => [
      svg.querySelector('g')!.getAttribute('fill'),
      svg.querySelector('circle')!.getAttribute('fill'),
    ])
    expect(fills).toEqual([
      ['#3454D1', '#13215E'],
      ['#FFFFFF', '#13215E'],
      ['#000000', '#000000'],
    ])
  })
})

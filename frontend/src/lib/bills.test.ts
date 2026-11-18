import { describe, expect, it } from 'vitest'
import { billNumber, rupeesAndPaisa, totalLines, vatLabel } from './bills'

const plain = {
  subtotal: '700.00',
  discount: '0.00',
  vat_rate: '0.00',
  vat_amount: '0.00',
  total: '700.00',
}

describe('totalLines (screen and printouts)', () => {
  it('shows only Subtotal and Total without VAT or discount', () => {
    expect(totalLines(plain).map((l) => l.label)).toEqual(['Subtotal', 'Total'])
  })

  it('adds Discount only when there is one', () => {
    const lines = totalLines({ ...plain, discount: '100.00', total: '600.00' })
    expect(lines.map((l) => [l.label, l.amount])).toEqual([
      ['Subtotal', '700.00'],
      ['Discount', '-100.00'],
      ['Total', '600.00'],
    ])
  })

  it('adds Taxable amount and "VAT x%" only when the bill has VAT, using its own rate', () => {
    const bill = {
      subtotal: '1000.00',
      discount: '100.00',
      vat_rate: '13.00',
      vat_amount: '117.00',
      total: '1017.00',
    }
    expect(totalLines(bill).map((l) => [l.label, l.amount])).toEqual([
      ['Subtotal', '1000.00'],
      ['Discount', '-100.00'],
      ['Taxable amount', '900.00'],
      ['VAT 13%', '117.00'],
      ['Total', '1017.00'],
    ])
    expect(totalLines({ ...bill, vat_rate: '5.00' })[3].label).toBe('VAT 5%')
  })

  it('marks Total as the strong line', () => {
    expect(totalLines(plain).at(-1)).toEqual({ label: 'Total', amount: '700.00', strong: true })
  })
})

describe('bill helpers', () => {
  it('splits rupees and paisa for the paper columns, with lakh grouping', () => {
    expect(rupeesAndPaisa('125000.5')).toEqual({ rupees: '1,25,000', paisa: '50' })
    expect(rupeesAndPaisa('18.08')).toEqual({ rupees: '18', paisa: '08' })
    expect(rupeesAndPaisa('-2.00')).toEqual({ rupees: '-2', paisa: '00' })
  })

  it('numbers lab bills from their own book', () => {
    expect(billNumber({ series: 'CLINIC', number: 12 })).toBe('12')
    expect(billNumber({ series: 'LAB', number: 3 })).toBe('L-3')
    expect(vatLabel('13.00')).toBe('VAT 13%')
  })
})

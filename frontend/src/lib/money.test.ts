import { describe, expect, it } from 'vitest'
import { amountInWords, formatRs } from './money'

describe('formatRs', () => {
  it.each([
    ['125000', 'Rs. 1,25,000.00'],
    ['125000.5', 'Rs. 1,25,000.50'],
    ['1234567.89', 'Rs. 12,34,567.89'],
    ['700.00', 'Rs. 700.00'],
    ['0', 'Rs. 0.00'],
    [99999999.99, 'Rs. 9,99,99,999.99'],
  ])('%s -> %s', (amount, expected) => {
    expect(formatRs(amount)).toBe(expected)
  })

  it('puts the minus sign before Rs.', () => {
    expect(formatRs('-100')).toBe('-Rs. 100.00')
  })

  it('refuses text that is not a number', () => {
    expect(() => formatRs('abc')).toThrow(TypeError)
  })
})

describe('amountInWords', () => {
  it.each([
    ['0', 'Rupees Zero Only'],
    ['700.00', 'Rupees Seven Hundred Only'],
    ['8100', 'Rupees Eight Thousand One Hundred Only'],
    ['94.92', 'Rupees Ninety-Four and Ninety-Two Paisa Only'],
    ['125050.50', 'Rupees One Lakh Twenty-Five Thousand Fifty and Fifty Paisa Only'],
    ['10000000', 'Rupees One Crore Only'],
    [
      '99999999.99',
      'Rupees Nine Crore Ninety-Nine Lakh Ninety-Nine Thousand Nine Hundred Ninety-Nine and Ninety-Nine Paisa Only',
    ],
    ['1.5', 'Rupees One and Fifty Paisa Only'],
  ])('%s', (amount, expected) => {
    expect(amountInWords(amount)).toBe(expected)
  })

  it('refuses negative or malformed amounts', () => {
    expect(() => amountInWords('-5')).toThrow(TypeError)
    expect(() => amountInWords('12.345')).toThrow(TypeError)
  })
})

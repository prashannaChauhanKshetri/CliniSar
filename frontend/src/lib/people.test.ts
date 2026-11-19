import { describe, expect, it } from 'vitest'
import { sameNameKey, tidyName } from './people'

describe('patient names', () => {
  it('tidies spaces like the server does', () => {
    expect(tidyName('  Ram   Bahadur ')).toBe('Ram Bahadur')
  })

  it('treats capitals and extra spaces as the same name', () => {
    expect(sameNameKey(' ram ', 'THAPA')).toBe(sameNameKey('Ram', 'Thapa'))
    expect(sameNameKey('Ram', 'Thapa')).not.toBe(sameNameKey('Hari', 'Thapa'))
  })
})

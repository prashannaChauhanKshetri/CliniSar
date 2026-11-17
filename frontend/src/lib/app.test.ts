import { expect, test } from 'vitest'
import { APP_NAME } from './app'

// Smoke test: proves Vitest runs. Real unit tests start in phase 9.
test('the product name is CliniSar', () => {
  expect(APP_NAME).toBe('CliniSar')
})

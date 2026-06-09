import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('client-locale', () => {
  it('exports useLocale', async () => {
    const { useLocale } = await import('../client-locale.ts')
    assert.equal(typeof useLocale, 'function')
  })
})

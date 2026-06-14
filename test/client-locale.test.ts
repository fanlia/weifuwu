import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('client-locale', () => {
  it('exports useLocale', async () => {
    const mod = await import('../client-locale.ts')
    assert.equal(typeof mod.useLocale, 'function')
  })
})

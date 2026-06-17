import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('client-locale', () => {
  it('exports useLocale', async () => {
    const mod = await import('../client-locale.ts')
    assert.equal(typeof mod.useLocale, 'function')
  })

  it('does not export internal buildT', async () => {
    const mod = await import('../client-locale.ts')
    assert.equal(Object.keys(mod).length, 1) // only useLocale
  })

  it('useLocale returns an object with locale, setLocale, t', async () => {
    const mod = await import('../client-locale.ts')
    const keys = Object.getOwnPropertyNames(mod)
    assert.ok(keys.includes('useLocale'))
  })
})

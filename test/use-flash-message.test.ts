import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('useFlashMessage', () => {
  it('exports useFlashMessage hook', async () => {
    const mod = await import('../use-flash-message.ts')
    assert.equal(typeof mod.useFlashMessage, 'function')
  })

  it('module has only one named export', async () => {
    const mod = await import('../use-flash-message.ts')
    const keys = Object.keys(mod).filter((k) => k !== 'default')
    assert.deepEqual(keys, ['useFlashMessage'])
  })
})

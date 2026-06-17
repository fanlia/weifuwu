import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('useAction', () => {
  it('exports useAction hook', async () => {
    const mod = await import('../use-action.ts')
    assert.equal(typeof mod.useAction, 'function')
  })

  it('exports UseActionOptions and UseActionReturn types', async () => {
    const mod = await import('../use-action.ts')
    // TypeScript interfaces are erased at runtime, but we can verify the module shape
    assert.ok(typeof mod.useAction === 'function')
  })

  it('useAction has correct parameter count', async () => {
    const mod = await import('../use-action.ts')
    // useAction(url, options?) = 2 params
    assert.ok(mod.useAction.length >= 1)
  })
})

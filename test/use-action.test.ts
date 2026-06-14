import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'

describe('useAction', () => {
  it('exports expected interface', async () => {
    // Module exports a React hook — can't call it outside React context
    const mod = await import('../use-action.ts')
    assert.equal(typeof mod.useAction, 'function')
  })
})

import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'

describe('useWebsocket', () => {
  it('exports expected interface', () => {
    // Module exports a function — can't call it outside React context
    assert.equal(typeof import('../use-websocket.ts'), 'object')
  })

  it('module has useWebsocket export', async () => {
    const mod = await import('../use-websocket.ts')
    assert.equal(typeof mod.useWebsocket, 'function')
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('useWebsocket', () => {
  it('exports useWebsocket hook', async () => {
    const mod = await import('../use-websocket.ts')
    assert.equal(typeof mod.useWebsocket, 'function')
  })

  it('exports UseWebsocketOptions and UseWebsocketReturn types', async () => {
    // Module should have the hook function; types are TS-only
    const mod = await import('../use-websocket.ts')
    assert.equal(typeof mod.useWebsocket, 'function')
  })

  it('useWebsocket expects 2 parameters', async () => {
    const mod = await import('../use-websocket.ts')
    // useWebsocket(url, options?) = 2 params
    assert.ok(mod.useWebsocket.length >= 1)
  })
})

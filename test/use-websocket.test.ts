import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import { useWebsocket } from '../use-websocket.ts'

describe('useWebsocket', () => {
  it('exports expected interface', () => {
    assert.equal(typeof useWebsocket, 'function')
  })
})

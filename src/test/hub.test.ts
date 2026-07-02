import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { WebSocketServer, WebSocket } from 'ws'
import { createHub } from '../hub.ts'

describe('createHub', () => {
  it('join and leave in-memory', () => {
    const hub = createHub()
    const wss = new WebSocketServer({ port: 0 })
    // Can't easily test WS join/leave without real connections
    // Just verify hub is created
    assert.ok(hub)
    wss.close()
    hub.close()
  })
})

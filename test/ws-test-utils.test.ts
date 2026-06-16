 
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { testApp, TestApp } from '../test-utils.ts'
import type { WebSocket } from '../vendor.ts'

describe('WebSocket test utilities', () => {
  const apps: TestApp[] = []

  afterEach(async () => {
    for (const a of apps) await a.close()
    apps.length = 0
  })

  it('should connect to a WebSocket endpoint and exchange messages', async () => {
    const app = testApp()
    apps.push(app)
    app.ws('/echo', {
      open(ws: WebSocket) {
        ws.send(JSON.stringify({ type: 'connected' }))
      },
      message(ws: WebSocket, _ctx: any, data: Buffer) {
        ws.send(`echo: ${data.toString()}`)
      },
    })

    const conn = await app.wsReq('/echo').connect()

    // Should receive the open message
    const openMsg = await conn.receiveJson()
    assert.equal(openMsg.type, 'connected')

    // Send and receive
    conn.send('hello')
    const reply = await conn.receive()
    assert.equal(reply, 'echo: hello')

    conn.send('world')
    const reply2 = await conn.receive()
    assert.equal(reply2, 'echo: world')

    conn.close()
    assert.ok(conn.closed)
  })

  it('should handle JSON messages', async () => {
    const app = testApp()
    apps.push(app)
    app.ws('/json-chat', {
      message(ws: WebSocket, _ctx: any, data: Buffer) {
        const msg = JSON.parse(data.toString())
        ws.send(JSON.stringify({ reply: `You said: ${msg.text}` }))
      },
    })

    const conn = await app.wsReq('/json-chat').connect()

    conn.json({ text: 'Hi there' })
    const reply = (await conn.receiveJson()) as any
    assert.equal(reply.reply, 'You said: Hi there')

    conn.close()
  })

  it('should handle multiple connections to the same endpoint', async () => {
    const app = testApp()
    apps.push(app)
    app.ws('/multi', {
      message(ws: WebSocket, _ctx: any, data: Buffer) {
        ws.send(`received: ${data.toString()}`)
      },
    })

    const conn1 = await app.wsReq('/multi').connect()
    const conn2 = await app.wsReq('/multi').connect()

    conn1.send('from 1')
    conn2.send('from 2')

    const reply1 = await conn1.receive()
    const reply2 = await conn2.receive()

    assert.equal(reply1, 'received: from 1')
    assert.equal(reply2, 'received: from 2')

    conn1.close()
    conn2.close()
  })

  it('should reject connection to non-existent endpoint', async () => {
    const app = testApp()
    apps.push(app)
    // No WS routes registered

    try {
      await app.wsReq('/nowhere').connect()
      assert.fail('should have rejected')
    } catch (err: any) {
      assert.ok(
        err.message.includes('WebSocket') || err.message.includes('upgrade'),
        `Error should mention WebSocket: ${err.message}`,
      )
    }
  })

  it('expectSilent should pass when no messages arrive', async () => {
    const app = testApp()
    apps.push(app)
    app.ws('/silent', {
      open(ws: WebSocket) {
        ws.send('initial')
      },
      message(_ws: WebSocket, _ctx: any, _data: Buffer) {
        // Don't respond
      },
    })

    const conn = await app.wsReq('/silent').connect()

    // Consume the initial message
    const initial = await conn.receive()
    assert.equal(initial, 'initial')

    // This should pass because we don't respond
    await conn.expectSilent(300)
    conn.close()
  })

  it('should timeout on receive when no message arrives', async () => {
    const app = testApp()
    apps.push(app)
    app.ws('/timeout', {
      open(_ws: WebSocket) {
        // Don't send anything
      },
    })

    const conn = await app.wsReq('/timeout').timeout(1000).connect()

    try {
      await conn.receive(500)
      assert.fail('should have timed out')
    } catch (err: any) {
      assert.ok(err.message.includes('timed out'), `Error: ${err.message}`)
    }

    conn.close()
  })
})

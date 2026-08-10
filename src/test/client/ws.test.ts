/**
 * weifuwu/client ws — WebSocket 中间件测试
 */

import { describe, it, before, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'

before(setupJsdom)

const { ws } = await import('../../ui-dom/middleware/ws.ts')
import type { WfuiContext } from '../../ui-dom/types.ts'

// ── WebSocket mock ─────────────────────────────────────────

let mockSocket: any
const clients: any[] = []
let openHandlers: Array<() => void> = []
let messageHandlers: Array<(e: any) => void> = []
let closeHandlers: Array<() => void> = []
let errorHandlers: Array<() => void> = []

class MockWebSocket {
  static OPEN = 1
  static CONNECTING = 0
  static CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((e: any) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  sent: any[] = []
  url: string

  constructor(url: string) {
    this.url = url
    mockSocket = this
    openHandlers.push(() => { this.readyState = MockWebSocket.OPEN; this.onopen?.() })
    messageHandlers.push((e) => this.onmessage?.(e))
    closeHandlers.push(() => {
      this.readyState = MockWebSocket.CLOSED
      this.onclose?.()
    })
    errorHandlers.push(() => this.onerror?.())
    queueMicrotask(() => {
      if (openHandlers.length > 0) openHandlers[openHandlers.length - 1]()
    })
  }

  send(data: any) { this.sent.push(data) }
  close() { this.onclose?.() }
}

beforeEach(() => {
  openHandlers = []
  messageHandlers = []
  closeHandlers = []
  errorHandlers = []
  ;(globalThis as any).WebSocket = MockWebSocket
})

afterEach(() => {
  clients.forEach(c => c.close?.())
  clients.length = 0
  delete (globalThis as any).WebSocket
})

function makeWs(opts?: any) {
  const mw = ws({ reconnectInterval: 99999, pingInterval: 0, ...opts })
  const ctx: WfuiContext = {} as any
  const result = mw(ctx) as any
  clients.push(result.ws)
  return result
}

describe('ws middleware', () => {
  it('注入 ctx.ws', async () => {
    const res = makeWs()
    await new Promise(r => setTimeout(r, 5))
    assert.ok(res.ws)
    assert.equal(typeof res.ws.send, 'function')
    assert.equal(typeof res.ws.onMessage, 'function')
    assert.equal(typeof res.ws.close, 'function')
    assert.equal(res.ws.isConnected, true)
  })

  it('send 发送 JSON', async () => {
    const res = makeWs()
    await new Promise(r => setTimeout(r, 5))
    res.ws.send({ text: 'hello' })
    assert.equal(mockSocket.sent.length, 1)
    assert.equal(mockSocket.sent[0], JSON.stringify({ text: 'hello' }))
  })

  it('onMessage 接收消息', async () => {
    const res = makeWs()
    await new Promise(r => setTimeout(r, 5))

    let received: any = null
    res.ws.onMessage((data) => { received = data })

    const handler = messageHandlers[messageHandlers.length - 1]
    handler({ data: JSON.stringify({ type: 'msg', text: 'hi' }) })
    assert.deepEqual(received, { type: 'msg', text: 'hi' })
  })

  it('onMessage 返回取消订阅函数', async () => {
    const res = makeWs()
    await new Promise(r => setTimeout(r, 5))

    let count = 0
    const unsub = res.ws.onMessage(() => { count++ })

    const handler = messageHandlers[messageHandlers.length - 1]
    handler({ data: JSON.stringify({}) })
    assert.equal(count, 1)

    unsub()
    handler({ data: JSON.stringify({}) })
    assert.equal(count, 1)
  })

  it('isConnected 反映连接状态', async () => {
    const res = makeWs()
    await new Promise(r => setTimeout(r, 5))
    assert.equal(res.ws.isConnected, true)

    const handler = closeHandlers[closeHandlers.length - 1]
    handler()
    assert.equal(res.ws.isConnected, false)
  })

  it('close 清理定时器', async () => {
    const res = makeWs()
    await new Promise(r => setTimeout(r, 5))
    assert.equal(res.ws.isConnected, true)

    res.ws.close()
    assert.equal(res.ws.isConnected, false)
  })
})

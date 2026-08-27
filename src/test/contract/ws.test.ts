/**
 * ws 中间件契约（2026-08——A2 断线补拉地基）：
 *  - autoReconnect：断线自动重连（指数退避——onopen 重置）——close() 不重连
 *  - onStatusChange：状态翻转通知（订阅回放当前态）
 *  - 消息订阅/退订/JSON 解析（既有面回归）
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { ws, type WsLike } from '../../client/vdom/middlewares/ws.ts'

class MockWs implements WsLike {
  static instances: MockWs[] = []
  onmessage: ((e: { data: unknown }) => void) | null = null
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  closed = false
  url: string
  constructor(url: string) { this.url = url; MockWs.instances.push(this) }
  send(_data: string): void { /* noop */ }
  close(): void { this.closed = true; this.onclose?.() }
  serverOpen(): void { this.onopen?.() }
  serverMsg(data: unknown): void { this.onmessage?.({ data }) }
}

function freshClient(opts: Record<string, unknown> = {}) {
  MockWs.instances = []
  return ws({ WebSocketCtor: MockWs as unknown as new (u: string) => WsLike, ...opts })
}

const tick = (ms: number) => new Promise(r => setTimeout(r, ms))

describe('ws 中间件', () => {
  it('基础：connect → isConnected / onopen 翻转 / onMessage 接收（JSON 解析）', async () => {
    const c = freshClient()
    let status: boolean | null = null
    c.onStatusChange(v => { status = v })
    c.connect('ws://t')
    const s = MockWs.instances[0]
    s.serverOpen()
    assert.equal(c.isConnected, true)
    assert.equal(status, true)
    let got: unknown = null
    const off = c.onMessage(d => { got = d })
    s.serverMsg('{"a":1}')
    assert.deepEqual(got, { a: 1 })
    s.serverMsg('raw')
    assert.equal(got, 'raw')
    off()
    s.serverMsg('{"b":2}')
    assert.deepEqual(got, 'raw', '退订后不再接收')
  })

  it('autoReconnect：断线自动重连（baseMs 退避——onopen 重置）', async () => {
    const c = freshClient({ autoReconnect: { baseMs: 10, maxMs: 40 } })
    c.connect('ws://t')
    let opened = 0
    c.onStatusChange(v => { if (v) opened++ })
    MockWs.instances[0].serverOpen()
    assert.equal(opened, 1)
    // 断线 → 重连（10ms 退避）
    MockWs.instances[0].close() // server 断（WsLike.close 触发 onclose）
    assert.equal(c.isConnected, false)
    await tick(30)
    assert.equal(MockWs.instances.length, 2, '应自动重连')
    MockWs.instances[1].serverOpen()
    assert.equal(c.isConnected, true)
    // 再次断线 → 第二次重连（20ms 退避）
    MockWs.instances[1].close()
    await tick(40)
    assert.equal(MockWs.instances.length, 3, '第二次重连')
  })

  it('close() 手动关闭不重连（主动语义）', async () => {
    const c = freshClient({ autoReconnect: { baseMs: 10 } })
    c.connect('ws://t')
    MockWs.instances[0].serverOpen()
    c.close()
    await tick(40)
    assert.equal(MockWs.instances.length, 1, '手动关闭后不自动重连')
    assert.equal(c.isConnected, false)
  })

  it('onStatusChange 订阅回放当前态', async () => {
    const c = freshClient()
    c.connect('ws://t')
    MockWs.instances[0].serverOpen() // true
    const seen: boolean[] = []
    const off = c.onStatusChange(v => seen.push(v))
    assert.deepEqual(seen, [true], '订阅回放当前态')
    MockWs.instances[0].close()
    assert.deepEqual(seen, [true, false], '断线翻转')
    off()
    c.connect('ws://t2')
    assert.deepEqual(seen, [true, false], '退订后不再通知')
  })
})

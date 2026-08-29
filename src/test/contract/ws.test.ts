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
  readyState = 0 // CONNECTING（serverOpen 后 1）
  sent: string[] = []
  constructor(url: string) { this.url = url; MockWs.instances.push(this) }
  send(data: string): void { this.sent.push(data) }
  close(): void { this.closed = true; this.onclose?.() }
  serverOpen(): void { this.readyState = 1; this.onopen?.() }
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

  it('CONNECTING 期间 send 排队——onopen flush（保序）', async () => {
    const c = freshClient()
    c.connect('ws://t')
    // CONNECTING（readyState 0）——send 排队不抛错
    c.send({ type: 'subscribe', room: 'r1' })
    c.send('bye')
    assert.equal(MockWs.instances[0].sent.length, 0, 'CONNECTING 期不直接发送')
    MockWs.instances[0].serverOpen()
    assert.deepEqual(MockWs.instances[0].sent, [JSON.stringify({ type: 'subscribe', room: 'r1' }), 'bye'], 'onopen flush 保序')
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

  it('心跳看门狗：无入站超时 → 强制 close → 断线感知 + 自动重连（网络硬断静默挂起——A2 根因）', async () => {
    const c = freshClient({ autoReconnect: { baseMs: 10, maxMs: 40 }, ping: { intervalMs: 15, timeoutMs: 50 } })
    c.connect('ws://t')
    MockWs.instances[0].serverOpen()
    assert.equal(c.isConnected, true)
    // 活性期：pong 入站刷新——不算死
    await tick(25)
    MockWs.instances[0].serverMsg('{"type":"pong"}')
    await tick(35) // 距 pong 35ms < timeout——存活
    assert.equal(c.isConnected, true, '有 pong 活性——连接保持')
    // 静默期：无入站（模拟网络硬断——close/error 都不触发——socket 挂起）
    await tick(70) // 距最后入站 > 50ms——看门狗强制 close
    assert.equal(c.isConnected, false, '静默超时 → 断线感知（onclose 等价翻转——应用层补拉链触发）')
    await tick(50) // 重连调度（10ms 退避）
    assert.ok(MockWs.instances.length >= 2, '应自动重连')
  })

  it('onerror → close 链（error 不处理后 socket 残留——onclose 才调度重连）', async () => {
    const c = freshClient({ autoReconnect: { baseMs: 10 } })
    c.connect('ws://t')
    MockWs.instances[0].serverOpen()
    // error 触发（模拟网络异常——浏览器只发 error 不发 close）
    MockWs.instances[0].onerror?.(new Error('net'))
    assert.equal(c.isConnected, false, 'error → close 链 → 断线感知')
    await tick(30)
    assert.equal(MockWs.instances.length, 2, '重连已调度')
  })

  it('messages$/status$：值源流视图（onMessage/onStatusChange 同源）', async () => {
    const c = freshClient()
    const msgs: unknown[] = []
    const stats: boolean[] = []
    const unsubMsgs = c.messages$.subscribe({ next: (d) => msgs.push(d) })
    const unsubStats = c.status$.subscribe({ next: (s) => stats.push(s) })
    c.connect('ws://t')
    const s = MockWs.instances[0]
    // 状态流视图：订阅即回放当前态（initial false）
    assert.deepEqual(stats, [false], '初始态回放')
    s.serverOpen()
    s.serverMsg('{"a":1}')
    s.serverMsg('raw')
    assert.deepEqual(msgs, [{ a: 1 }, 'raw'], '消息流视图（解析后数据）')
    assert.deepEqual(stats, [false, true], '连接状态事件')
    // 退订后零事件（close→重新 open 的翻转不再收）
    unsubStats.unsubscribe()
    unsubMsgs.unsubscribe()
    c.close()
    c.connect('ws://t')
    const s2 = MockWs.instances[1]
    s2.serverOpen()
    s2.serverMsg('{"x":1}')
    assert.deepEqual(stats, [false, true], '退订后状态零额外事件')
    assert.deepEqual(msgs, [{ a: 1 }, 'raw'], '退订后消息零额外事件')
  })
})

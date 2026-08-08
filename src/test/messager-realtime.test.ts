/**
 * messager — 实时层测试（P2：真实 WS 连接 + Redis 跨进程广播）
 *
 * CS-04：连 docker 真实库（postgres + redis）。
 * 覆盖：connected/subscribe/subscribed 协议、broadcast 收事件、sendTo 用户维度、
 * 断线清理（close 后广播不炸）、Redis 双实例跨进程广播。
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import { postgres } from '../postgres/index.ts'
import { redis } from '../redis/index.ts'
import { messager } from '../messager/index.ts'
import { Router } from '../core/router.ts'

function startServer(app: Router): Promise<Server> {
  return new Promise(resolve => {
    const server = createServer((req, res) => {
      app.handler()(new Request(`http://localhost${req.url}`, { method: req.method }), { params: {}, query: {} })
        .then(r => {
          res.writeHead(r.status, { 'content-type': 'application/json' })
          res.end(JSON.stringify(r.body ?? ''))
        })
        .catch(() => { res.writeHead(500); res.end() })
    })
    server.on('upgrade', (req, socket, head) => app.websocketHandler()(req, socket, head))
    server.listen(0, () => resolve(server)) // 随机端口，避免多实例冲突
  })
}

/** 连接并缓冲所有消息（connected 在 open 时即发——必须预先收集，避免竞态丢失） */
function connect(server: Server, path = '/ws'): Promise<{ ws: WebSocket; waitMsg: (type: string, timeoutMs?: number) => Promise<any> }> {
  const port = (server.address() as any).port
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}${path}`)
    const buffer: any[] = []
    const waiters: Array<{ type: string; timer: any; resolve: (m: any) => void; reject: (e: Error) => void }> = []
    ws.on('message', (data: any) => {
      const msg = JSON.parse(data.toString())
      const idx = waiters.findIndex(w => w.type === msg.type)
      if (idx !== -1) {
        const w = waiters.splice(idx, 1)[0]
        clearTimeout(w.timer)
        w.resolve(msg)
      } else {
        buffer.push(msg)
      }
    })
    const waitMsg = (type: string, timeoutMs = 3000): Promise<any> => {
      const i = buffer.findIndex(m => m.type === type)
      if (i !== -1) return Promise.resolve(buffer.splice(i, 1)[0])
      return new Promise((res, rej) => {
        const timer = setTimeout(() => rej(new Error(`timeout waiting ${type}`)), timeoutMs)
        waiters.push({ type, timer, resolve: res, reject: rej })
      })
    }
    ws.on('open', () => resolve({ ws, waitMsg }))
    ws.on('error', reject)
  })
}

describe('messager realtime (real ws + redis)', () => {
  const db = postgres()
  const rds = redis()
  const system = messager({ sql: db.sql, redis: rds })
  const msg = system.client
  let server: Server

  before(async () => {
    await db.migrate()
    await system.migrate()
    const app = new Router()
    app.use(db)
    app.use(rds)
    app.use(system)
    app.ws('/ws', msg.handler())
    server = await startServer(app)
  })

  after(async () => {
    await msg.close()
    server?.close()
    await db.close()
    await rds.close()
  })

  it('连接后收到 connected，subscribe 收到 subscribed', async () => {
    const { ws, waitMsg } = await connect(server)
    const connected = await waitMsg('connected')
    assert.ok(connected)
    ws.send(JSON.stringify({ type: 'subscribe', room: 'conv:test-1' }))
    const subscribed = await waitMsg('subscribed')
    assert.equal(subscribed.room, 'conv:test-1')
    ws.close()
  })

  it('broadcast 房间事件 → 订阅者收到；未订阅者收不到', async () => {
    const subC = await connect(server)
    const outC = await connect(server)
    const { ws: sub } = subC
    const { ws: outsider, waitMsg: outWait } = outC
    sub.send(JSON.stringify({ type: 'subscribe', room: 'conv:b1' }))
    await subC.waitMsg('subscribed')
    const promise = subC.waitMsg('new_message')
    msg.broadcast('conv:b1', { type: 'new_message', content: 'hello' })
    const got = await promise
    assert.equal(got.content, 'hello')
    // outsider 未订阅——给一点时间确认收不到
    let outsiderGot = false
    outsider.on('message', () => { outsiderGot = true })
    msg.broadcast('conv:b1', { type: 'new_message', content: 'second' })
    await new Promise(r => setTimeout(r, 300))
    assert.equal(outsiderGot, false)
    sub.close(); outsider.close()
  })

  it('单实例环回去重：自己 publish 的消息不重复广播（修复 token 乱序根因）', async () => {
    const { ws, waitMsg } = await connect(server)
    ws.send(JSON.stringify({ type: 'subscribe', room: 'conv:dedup' }))
    await waitMsg('subscribed')
    let count = 0
    let lastText = ''
    ws.on('message', (raw: Buffer) => {
      const ev = JSON.parse(raw.toString())
      if (ev.type === 'wf:token') { count++; lastText = ev.text }
    })
    // 连续 5 个 token 广播——每个应恰好到达一次（直发 1 次，Redis 环回被 _pid 跳过）
    for (let i = 0; i < 5; i++) {
      msg.broadcast('conv:dedup', { type: 'wf:token', text: `t${i}` })
    }
    await new Promise(r => setTimeout(r, 500))
    assert.equal(count, 5, `期望 5 个 token 各一次，实际 ${count}（重复=环回未去重）`)
    assert.equal(lastText, 't4')
    ws.close()
  })

  it('sendTo 用户维度（user:{id} 房间）', async () => {
    const { ws, waitMsg } = await connect(server)
    ws.send(JSON.stringify({ type: 'subscribe', room: 'user:u-42' }))
    await waitMsg('subscribed')
    const promise = waitMsg('mention')
    msg.sendTo('u-42', { type: 'mention', by: 'u-1' })
    const got = await promise
    assert.equal(got.by, 'u-1')
    ws.close()
  })

  it('ping → pong', async () => {
    const { ws, waitMsg } = await connect(server)
    const p = waitMsg('pong')
    ws.send(JSON.stringify({ type: 'ping' }))
    assert.ok(await p)
    ws.close()
  })

  it('断线后清理：close 的连接不残留（后续 broadcast 不抛）', async () => {
    const { ws, waitMsg } = await connect(server)
    ws.send(JSON.stringify({ type: 'subscribe', room: 'conv:gone' }))
    await waitMsg('subscribed')
    ws.close()
    await new Promise(r => setTimeout(r, 200))
    msg.broadcast('conv:gone', { type: 'new_message', content: 'after close' }) // 不应抛
  })

  it('Redis 跨进程广播：第二个 messager 实例收到同一房间事件', async () => {
    // 第二实例共享同一 redis（模拟另一进程）
    const rds2 = redis()
    const system2 = messager({ sql: db.sql, redis: rds2 })
    const msg2 = system2.client
    const app2 = new Router()
    app2.use(db)
    app2.use(rds2)
    app2.use(system2)
    app2.ws('/ws', msg2.handler())
    const server2 = await startServer(app2)

    const { ws: ws2, waitMsg: waitMsg2 } = await connect(server2) // 连 server2（第二个实例）
    ws2.send(JSON.stringify({ type: 'subscribe', room: 'conv:cross' }))
    await waitMsg2('subscribed')

    const promise = waitMsg2('cross_event')
    msg.broadcast('conv:cross', { type: 'cross_event', text: '跨进程' }) // 实例 1 广播
    const got = await promise
    assert.equal(got.text, '跨进程')

    ws2.close()
    server2.close()
    await msg2.close()
    await rds2.close()
  })
})

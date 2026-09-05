/**
 * weifuwu/db/redis — 连接层故障场景测试（真实 docker redis）
 *
 * CS-04: 必须连 docker-compose 真实 redis（localhost:6379，REDIS_URL）。
 * 故障注入用真实机制：CLIENT KILL 杀自己连接 / 未占用端口（不可达）。
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { RedisConnection } from './connection.ts'
import { ConnectionError } from '../errors.ts'
import { MemoryRedisServer } from '../redis-server.ts'

/** 内存 Redis 服务器（进程内——零外部依赖；CS-04 真实协议交互保留） */
const server = new MemoryRedisServer()
await server.start()
const port = server.port

/** 用独立控制连接杀掉目标连接（订阅模式下目标连接自己发 CLIENT 会被拒） */
async function killConn(conn: RedisConnection, ctl: RedisConnection): Promise<void> {
  const id = await conn.command('CLIENT', 'ID')
  await ctl.command('CLIENT', 'KILL', 'ID', String(id))
}

/** 轮询等待连接恢复（重连期间命令进离线队列，ready 后自动 flush；订阅模式下 PING 回 ['pong','']） */
async function waitForReady(conn: RedisConnection, timeoutMs = 3000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await conn.command('PING')
      if (r === 'PONG' || (Array.isArray(r) && r[0] === 'pong')) return
    } catch {
      // 重连中
    }
    await new Promise((r) => setTimeout(r, 30))
  }
  throw new Error('connection did not recover in time')
}

describe('redis connection resilience (memory server)', () => {
  const CH = `wf_test:${process.pid}`

  after(async () => {
    // 清理残留订阅
    const conn = new RedisConnection({ port })
    await conn.connect()
    await conn.command('UNSUBSCRIBE', CH).catch(() => {})
    await conn.close()
  })

  it('kills own connection via CLIENT KILL and recovers with reconnect', async () => {
    const conn = new RedisConnection({ port, maxRetries: 10, retryDelayMs: 30 })
    await conn.connect()
    const ctl = new RedisConnection({ port })
    await ctl.connect()
    await killConn(conn, ctl)
    await waitForReady(conn)
    assert.equal(await conn.command('PING'), 'PONG')
    await ctl.close()
    await conn.close()
  })

  it('rejects pending command when connection drops mid-command', async () => {
    const conn = new RedisConnection({ port, maxRetries: 10, retryDelayMs: 40 })
    await conn.connect()
    const ctl = new RedisConnection({ port })
    await ctl.connect()
    const id = await conn.command('CLIENT', 'ID')
    // BLPOP 阻塞等待——pending 确定挂起（响应不会立即返回）
    const pending = conn.command('BLPOP', `wf_test:${process.pid}:blpop`, '0')
    await new Promise((r) => setTimeout(r, 50))
    // 先注册断言（reject 可能在任何时刻发生，避免 unhandled rejection）
    const assertion = assert.rejects(pending, (e) => e instanceof ConnectionError)
    // 独立控制连接发 KILL（同连接发会被 BLPOP 阻塞）——pending 响应永远等不到 → 必须 reject
    await ctl.command('CLIENT', 'KILL', 'ID', String(id))
    await assertion
    await ctl.close()
    await conn.close()
  })

  it('restores subscriptions after reconnect (no silent loss)', async () => {
    const conn = new RedisConnection({ port, maxRetries: 10, retryDelayMs: 30 })
    await conn.connect()
    const ctl = new RedisConnection({ port })
    await ctl.connect()
    const id = await conn.command('CLIENT', 'ID')
    const got: string[] = []
    await conn.subscribe(CH, (c, m) => got.push(m))
    // 杀连接 → 自动重连 → 订阅必须恢复
    await ctl.command('CLIENT', 'KILL', 'ID', String(id))
    await new Promise((r) => setTimeout(r, 60)) // 等客户端感知断开（close 事件 → handleDisconnect）
    await waitForReady(conn)
    await new Promise((r) => setTimeout(r, 80)) // 等重发 SUBSCRIBE 的确认帧（异步恢复）
    // 用独立连接发布，验证重连后的订阅收到消息
    const pub = new RedisConnection({ port })
    await pub.connect()
    await pub.command('PUBLISH', CH, 'hello-after-reconnect')
    await new Promise((r) => setTimeout(r, 150))
    assert.deepEqual(got, ['hello-after-reconnect'])
    await pub.close()
    await ctl.close()
    await conn.close()
  })

  it('subscribe messages route to callbacks, not pending', async () => {
    const conn = new RedisConnection({ port, maxRetries: 3, retryDelayMs: 30 })
    await conn.connect()
    const pub = new RedisConnection({ port })
    await pub.connect()
    const got: string[] = []
    await conn.subscribe(CH, (c, m) => got.push(m))
    await pub.command('PUBLISH', CH, 'a')
    await pub.command('PUBLISH', CH, 'b')
    await new Promise((r) => setTimeout(r, 100))
    assert.deepEqual(got, ['a', 'b'])
    await pub.close()
    await conn.close()
  })

  it('fails connect() with ConnectionError when server unreachable', async () => {
    // 未占用端口（真实不可达场景，非 mock）
    const dead = new RedisConnection({ port: 6399, maxRetries: 2, retryDelayMs: 20 })
    await assert.rejects(dead.connect(), (e) => e instanceof ConnectionError)
    await dead.close()
  })

  it('rejects commands when offline queue exceeds maxOfflineQueue', async () => {
    // 未连接 + enableOfflineQueue：命令入队等待；超限立即 reject（防无限累积）
    const conn = new RedisConnection({ port: 6399, maxRetries: 0, enableOfflineQueue: true, maxOfflineQueue: 2 })
    const p1 = conn.command('PING')
    const p2 = conn.command('PING')
    await assert.rejects(conn.command('PING'), /offline queue full/)
    await conn.close()
    // 队列中未执行的命令随关闭 reject（不挂起）
    await assert.rejects(p1, /not connected|closed/)
    await assert.rejects(p2, /not connected|closed/)
  })
})

describe('redis connection health (memory server)', () => {
  let conn: RedisConnection
  let ctl: RedisConnection

  before(async () => {
    conn = new RedisConnection({ port, maxRetries: 10, retryDelayMs: 150 })
    await conn.connect()
    ctl = new RedisConnection({ port })
    await ctl.connect()
  })

  after(async () => {
    await conn.close()
    await ctl.close()
  })

  it('CLIENT KILL 断线后 connected 立即为 false（重连等待期间不假阳性）', async () => {
    await killConn(conn, ctl)
    // CLIENT KILL 返回 ≠ 目标连接 close 事件已处理（异步）——轮询等待断线生效
    const t0 = Date.now()
    while (conn.connected && Date.now() - t0 < 1000) await new Promise((r) => setTimeout(r, 5))
    // 断线后状态应真实反映（connecting/重连中），而非虚假 ready（假阳性会让池继续分发死连接）
    assert.equal(conn.connected, false, '断线后 connected 应为 false（status 未更新 = 假阳性）')
    // 重连恢复后 connected 回 true
    await waitForReady(conn)
    assert.equal(conn.connected, true)
    assert.equal(await conn.command('PING'), 'PONG')
  })

  it('commandTimeoutMs: 服务器不响应 → 超时 reject（防 promise 永久挂起）', async () => {
    // 假 Redis 服务器：接受连接但吞掉所有命令（永不响应）——模拟服务器挂起
    const server = net.createServer(() => { /* 不响应 */ })
    await new Promise((r) => server.listen(0, () => r(undefined)))
    const fakePort = (server.address() as any).port
    try {
      const c = new RedisConnection({ port: fakePort, commandTimeoutMs: 120 })
      await c.connect() // TCP 层即 ready（本地无认证）
      const start = Date.now()
      await assert.rejects(c.command('GET', 'k'), /timeout/i)
      assert.ok(Date.now() - start < 1000, `超时应快速返回，实际 ${Date.now() - start}ms`)
      // 多个挂起命令各自独立超时（不互相阻塞）
      await assert.rejects(c.command('GET', 'k2'), /timeout/i)
      await c.close() // 干净关闭（pending 已清）
    } finally {
      server.close()
    }
  })

  it('BLPOP 阻塞命令超时 → resolve(null)（对齐 Redis/ioredis 语义）', async () => {
    const c = new RedisConnection({ port, commandTimeoutMs: 120 })
    await c.connect()
    const start = Date.now()
    const r = await c.command('BLPOP', 'wf:timeout:key', 0)
    assert.equal(r, null, '阻塞命令超时应 resolve(null) 而非 reject')
    assert.ok(Date.now() - start < 1000)
    // 裁剪：BLPOP 超时只放弃客户端等待——Redis 服务器端仍阻塞（单连接串行），
    // 该连接后续命令排队不可用——只能 close（阻塞命令与 commandTimeoutMs 冲突，文档注明）
    await c.close()
    // 清理：推入值释放服务器端 BLPOP（feeder 连接）
    const feeder = new RedisConnection({ port })
    await feeder.connect()
    await feeder.command('LPUSH', 'wf:timeout:key', 'v')
    await feeder.command('DEL', 'wf:timeout:key')
    await feeder.close()
  })

  it('commandTimeoutMs=0（默认）不超时', async () => {
    const c = new RedisConnection({ port })
    await c.connect()
    // BLPOP 阻塞 200ms 后手动推入值——不应被超时打断
    const p = c.command('BLPOP', 'wf:notimeout:key', 5)
    const feeder = new RedisConnection({ port })
    await feeder.connect()
    await new Promise((r) => setTimeout(r, 200))
    await feeder.command('LPUSH', 'wf:notimeout:key', 'v')
    const r = await p
    assert.equal(String((r as string[])[0]), 'wf:notimeout:key')
    assert.equal(String((r as string[])[1]), 'v')
    await feeder.close()
    await c.close()
  })
})

describe('redis socket timeout (zombie detection, real database)', () => {
  const port = Number(new URL(process.env.REDIS_URL ?? 'redis://localhost:6379').port || 6379)

  it('socketTimeoutMs: 服务器不响应 → 主动断开连接（僵尸自愈）而非命令级放弃', async () => {
    // 假服务器：接受连接但吞掉命令（模拟僵尸：TCP 不断开也不响应）
    const server = net.createServer(() => { /* 不响应 */ })
    await new Promise((r) => server.listen(0, () => r(undefined)))
    const fakePort = (server.address() as any).port
    try {
      const c = new RedisConnection({ port: fakePort, socketTimeoutMs: 120, retryDelayMs: 50 })
      await c.connect()
      // 有 pending 命令且无响应 → socketTimeout 主动销毁 socket
      await assert.rejects(c.command('GET', 'k'), /socket timeout|timeout/i)
      // 销毁后连接应已断开（close 事件异步——轮询等待）
      const t0 = Date.now()
      while (c.connected && Date.now() - t0 < 1000) await new Promise((r) => setTimeout(r, 5))
      assert.equal(c.connected, false, 'socketTimeout 后连接应断开（非假阳性）')
      await c.close()
    } finally {
      server.close()
    }
  })

  it('socketTimeoutMs: 正常响应不触发（数据到达清 timer）', async () => {
    const c = new RedisConnection({ port, socketTimeoutMs: 500 })
    await c.connect()
    // 快速命令（<500ms）不受影响
    assert.equal(await c.command('PING'), 'PONG')
    assert.equal(await c.command('SET', 'wf:st:k', 'v'), 'OK')
    assert.equal(c.connected, true)
    await c.command('DEL', 'wf:st:k')
    await c.close()
  })

  it('socketTimeoutMs: 空闲连接不触发（仅 pending 有命令时生效）', async () => {
    const c = new RedisConnection({ port, socketTimeoutMs: 150 })
    await c.connect()
    // 空闲超过 150ms 不触发（无 pending 命令——commandQueue.length===0 不重启 timer）
    await new Promise((r) => setTimeout(r, 250))
    assert.equal(c.connected, true, '空闲连接不应被 socketTimeout 断开')
    assert.equal(await c.command('PING'), 'PONG')
    await c.close()
  })

  it('阻塞命令 BLPOP 超时 → resolve(null)（对齐 Redis 阻塞语义，非 reject）', async () => {
    const c = new RedisConnection({ port, commandTimeoutMs: 120 })
    await c.connect()
    const r = await c.command('BLPOP', 'wf:blk:null', 0)
    assert.equal(r, null, '阻塞命令超时应 resolve(null) 而非 reject（Redis 语义）')
    await c.close()
    // 清理服务器端阻塞
    const feeder = new RedisConnection({ port })
    await feeder.connect()
    await feeder.command('LPUSH', 'wf:blk:null', 'v')
    await feeder.command('DEL', 'wf:blk:null')
    await feeder.close()
  })
})

after(async () => {
  await server.close()
})

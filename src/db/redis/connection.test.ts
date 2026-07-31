/**
 * weifuwu/db/redis — 连接层故障场景测试（真实 docker redis）
 *
 * CS-04: 必须连 docker-compose 真实 redis（localhost:6379，REDIS_URL）。
 * 故障注入用真实机制：CLIENT KILL 杀自己连接 / 未占用端口（不可达）。
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { RedisConnection } from './connection.ts'
import { ConnectionError } from '../errors.ts'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

function portOf(url: string): number {
  const u = new URL(url)
  return Number(u.port || 6379)
}

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

describe('redis connection resilience (real database)', () => {
  const port = portOf(REDIS_URL)
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
    await waitForReady(conn)
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
})

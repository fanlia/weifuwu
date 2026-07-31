import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { RedisConnection } from './connection.ts'
import { ConnectionError } from '../errors.ts'
import { RespError } from './resp.ts'

// CS-04: 必须连 docker-compose 真实 redis（localhost:6379，REDIS_URL）
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

function portOf(url: string): number {
  const u = new URL(url)
  return Number(u.port || 6379)
}

describe('redis connection (real database)', () => {
  const port = portOf(REDIS_URL)
  const KEY = `wf_test:${process.pid}:`

  let conn: RedisConnection

  before(async () => {
    conn = new RedisConnection({ port })
    await conn.connect()
  })

  after(async () => {
    // 清理测试 key
    const keys = await conn.command('KEYS', `${KEY}*`)
    if (Array.isArray(keys)) {
      for (const k of keys) await conn.command('DEL', String(k))
    }
    await conn.close()
  })

  it('connects to real redis and becomes ready', () => {
    assert.equal(conn.connected, true)
  })

  it('PING → PONG over real session', async () => {
    assert.equal(await conn.command('PING'), 'PONG')
  })

  it('SET then GET round-trip', async () => {
    const k = `${KEY}str`
    assert.equal(await conn.command('SET', k, 'hello'), 'OK')
    assert.equal(await conn.command('GET', k), 'hello')
  })

  it('GET missing key → null', async () => {
    assert.equal(await conn.command('GET', `${KEY}nope`), null)
  })

  it('INCR counters on real redis', async () => {
    const k = `${KEY}count`
    await conn.command('DEL', k)
    assert.equal(await conn.command('INCR', k), 1)
    assert.equal(await conn.command('INCR', k), 2)
  })

  it('EXPIRE sets TTL', async () => {
    const k = `${KEY}ttl`
    await conn.command('SET', k, 'v')
    assert.equal(await conn.command('EXPIRE', k, 100), 1)
    const ttl = await conn.command('TTL', k)
    assert.ok(typeof ttl === 'number' && ttl > 0 && ttl <= 100)
  })

  it('unknown command → RespError, connection stays usable', async () => {
    await assert.rejects(() => conn.command('NOTACOMMAND', 'x'), (e: unknown) => e instanceof RespError)
    // 错误响应后连接必须仍可用（协议语义：-ERR 是正常消息）
    assert.equal(await conn.command('PING'), 'PONG')
  })

  it('rejects when not connected', async () => {
    const c2 = new RedisConnection({ port })
    await assert.rejects(() => c2.command('PING'), (e: unknown) => e instanceof ConnectionError)
  })

  it('close() disconnects cleanly', async () => {
    const c2 = new RedisConnection({ port })
    await c2.connect()
    await c2.close()
    assert.equal(c2.connected, false)
  })
})

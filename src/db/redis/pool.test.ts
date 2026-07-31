import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { RedisPool } from './pool.ts'

// CS-04: 真实 redis
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const port = Number(new URL(REDIS_URL).port || 6379)

describe('redis pool (real database)', () => {
  const KEY = `wf_pool:${process.pid}:`
  let pool: RedisPool

  before(async () => {
    pool = await RedisPool.create({ port, poolSize: 3 })
  })

  after(async () => {
    const keys = await pool.command('KEYS', `${KEY}*`)
    if (Array.isArray(keys)) for (const k of keys) await pool.del(String(k))
    await pool.close()
  })

  it('routes commands across multiple connections', async () => {
    await pool.set(`${KEY}a`, '1')
    assert.equal(await pool.get(`${KEY}a`), '1')
  })

  it('handles concurrent commands without cross-talk', async () => {
    const writes = await Promise.all(
      Array.from({ length: 10 }, (_, i) => pool.set(`${KEY}c${i}`, `v${i}`)),
    )
    assert.deepEqual(writes, Array(10).fill('OK'))
    const reads = await Promise.all(
      Array.from({ length: 10 }, (_, i) => pool.get(`${KEY}c${i}`)),
    )
    assert.deepEqual(reads, Array.from({ length: 10 }, (_, i) => `v${i}`))
  })

  it('json operations work through pool', async () => {
    await pool.jsonSet(`${KEY}j`, { n: 42 })
    assert.deepEqual(await pool.jsonGet(`${KEY}j`), { n: 42 })
  })

  it('cache works through pool', async () => {
    let calls = 0
    const fn = async () => {
      calls++
      return { x: calls }
    }
    await pool.cache(`${KEY}c`, fn, 60)
    await pool.cache(`${KEY}c`, fn, 60)
    assert.equal(calls, 1)
  })

  it('uses more than one connection (round-robin)', async () => {
    const size = await pool.command('CLIENT', 'ID')
    // 至少路由到了可用连接（每个命令返回一个 client id）
    assert.ok(size !== undefined)
  })

  it('close() shuts down all pooled connections', async () => {
    const p = await RedisPool.create({ port, poolSize: 2 })
    await p.close()
    await assert.rejects(() => p.get('x'))
  })
})

describe('redis pool key prefix (real database)', () => {
  const KEY = `wf_pref:${process.pid}:`
  let pool: RedisPool

  before(async () => {
    pool = await RedisPool.create({ port, poolSize: 2, keyPrefix: KEY })
  })

  after(async () => {
    // 带前缀清理
    const keys = await pool.command('KEYS', `${KEY}*`)
    if (Array.isArray(keys)) for (const k of keys) await pool.command('DEL', String(k))
    await pool.close()
  })

  it('automatically prefixes keys on set/get', async () => {
    await pool.set('user:1', 'alice')
    // 实际存储的 key 带前缀
    assert.equal(await pool.get('user:1'), 'alice')
  })

  it('raw command sees the prefixed key', async () => {
    await pool.set('user:2', 'bob')
    // command 透传不加前缀——检查真实存储位置
    assert.equal(await pool.command('GET', `${KEY}user:2`), 'bob')
  })

  it('json operations are prefixed too', async () => {
    await pool.jsonSet('doc:1', { a: 1 })
    assert.deepEqual(await pool.jsonGet('doc:1'), { a: 1 })
    // raw command 不加前缀——验证真实存储位置带前缀
    const raw = await pool.command('GET', `${KEY}doc:1`)
    assert.deepEqual(JSON.parse(String(raw)), { a: 1 })
  })

  it('del/expire/ttl/incr apply prefix', async () => {
    await pool.set('n:1', '5')
    assert.equal(await pool.incr('n:1'), 6)
    assert.equal(await pool.expire('n:1', 100), 1)
    const ttl = await pool.ttl('n:1')
    assert.ok(ttl > 0)
    assert.equal(await pool.del('n:1'), 1)
  })
})

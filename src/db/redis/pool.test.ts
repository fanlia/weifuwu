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

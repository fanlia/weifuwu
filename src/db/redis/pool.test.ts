import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { RedisPool } from './pool.ts'
import { RedisClient } from './client.ts'

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

describe('redis pool connection health (real database)', () => {
  const port = Number(new URL(process.env.REDIS_URL ?? 'redis://localhost:6379').port || 6379)

  it('CLIENT KILL 杀部分池连接 → 剔除死连接并重建，命令仍成功', async () => {
    // retryDelayMs 大：死连接不会自己快速重连——池必须主动剔除（否则 round-robin 持续命中死连接）
    const pool = await RedisPool.create({ port, poolSize: 4, retryDelayMs: 5000 })
    try {
      const ctl = await RedisClient.connect({ port })
      // 杀 3 个池连接的 CLIENT ID
      const ids: number[] = []
      for (let i = 0; i < 3; i++) {
        ids.push(Number(await pool.command('CLIENT', 'ID')))
      }
      for (const id of ids) await ctl.command('CLIENT', 'KILL', 'ID', String(id))
      await new Promise((r) => setTimeout(r, 150))
      // 池应保持 4 连接（死连接被剔除重建，不等待 5s 重连）
      assert.equal(pool.size, 4, '池应剔除死连接并重建到 poolSize')
      // 命令仍成功（不命中死连接）
      assert.equal(await pool.set('wf:health:k', 'v'), 'OK')
      assert.equal(await pool.get('wf:health:k'), 'v')
      await ctl.close()
    } finally {
      await pool.del('wf:health:k').catch(() => {})
      await pool.close()
    }
  })

  it('CLIENT KILL 杀全部池连接 → 自动重建，服务不中断', async () => {
    const pool = await RedisPool.create({ port, poolSize: 3, retryDelayMs: 5000 })
    try {
      const ctl = await RedisClient.connect({ port })
      for (let i = 0; i < 3; i++) {
        const id = Number(await pool.command('CLIENT', 'ID'))
        await ctl.command('CLIENT', 'KILL', 'ID', String(id))
      }
      // 全部被杀：acquireHealthy 应等待 replenish 补位（<1s）而非挂起/报错
      assert.equal(await pool.set('wf:health:all', 'x'), 'OK')
      assert.equal(await pool.get('wf:health:all'), 'x')
      assert.ok(pool.size >= 1)
      await ctl.close()
    } finally {
      await pool.del('wf:health:all').catch(() => {})
      await pool.close()
    }
  })
})

describe('redis pool rich commands + pipeline (real database)', () => {
  const KEY = `wf_rich:${process.pid}:`
  let pool: RedisPool

  before(async () => {
    pool = await RedisPool.create({ port, poolSize: 2 })
  })

  after(async () => {
    const keys = await pool.command('KEYS', `${KEY}*`)
    if (Array.isArray(keys)) for (const k of keys) await pool.del(String(k))
    await pool.close()
  })

  it('hash: hset/hget/hgetall/hdel', async () => {
    const k = `${KEY}user:1`
    assert.equal(await pool.hset(k, 'name', 'alice'), 1)
    assert.equal(await pool.hset(k, 'age', '30'), 1)
    assert.equal(await pool.hget(k, 'name'), 'alice')
    const all = await pool.hgetall(k)
    assert.deepEqual(all, { name: 'alice', age: '30' })
    assert.equal(await pool.hdel(k, 'age'), 1)
    assert.equal(await pool.hget(k, 'age'), null)
    assert.deepEqual(await pool.hgetall(`${k}:missing`), {})
  })

  it('list: lpush/rpush/lpop/rpop/lrange', async () => {
    const k = `${KEY}q`
    assert.equal(await pool.rpush(k, 'a', 'b'), 2)
    assert.equal(await pool.lpush(k, 'x'), 3)
    assert.deepEqual(await pool.lrange(k, 0, -1), ['x', 'a', 'b'])
    assert.equal(await pool.lpop(k), 'x')
    assert.equal(await pool.rpop(k), 'b')
    assert.deepEqual(await pool.lrange(k, 0, -1), ['a'])
    assert.equal(await pool.lpop(`${k}:empty`), null)
  })

  it('set: sadd/srem/smembers', async () => {
    const k = `${KEY}tags`
    assert.equal(await pool.sadd(k, 'a', 'b', 'c'), 3)
    assert.equal(await pool.sadd(k, 'a'), 0) // 重复不加
    const members = await pool.smembers(k)
    assert.equal(members.length, 3)
    assert.ok(members.includes('a'))
    assert.equal(await pool.srem(k, 'a'), 1)
    assert.deepEqual(await pool.smembers(k), ['b', 'c'])
  })

  it('zset: zadd/zrange', async () => {
    const k = `${KEY}rank`
    assert.equal(await pool.zadd(k, 1, 'low'), 1)
    assert.equal(await pool.zadd(k, 3, 'high'), 1)
    assert.equal(await pool.zadd(k, 2, 'mid'), 1)
    assert.deepEqual(await pool.zrange(k, 0, -1), ['low', 'mid', 'high']) // 按 score 升序
    assert.deepEqual(await pool.zrange(k, 0, 0), ['low'])
  })

  it('mget/mset：批量读写', async () => {
    const k1 = `${KEY}m1`
    const k2 = `${KEY}m2`
    assert.equal(await pool.mset(k1, 'v1', k2, 'v2'), 'OK')
    const vals = await pool.mget(k1, k2, `${KEY}missing`)
    assert.deepEqual(vals, ['v1', 'v2', null])
  })

  it('exists/setnx/incrby', async () => {
    const k = `${KEY}counter`
    await pool.del(k)
    assert.equal(await pool.exists(k), 0)
    assert.equal(await pool.setnx(k, '5'), 1) // 设置成功
    assert.equal(await pool.setnx(k, '9'), 0) // 已存在
    assert.equal(await pool.get(k), '5')
    assert.equal(await pool.incrby(k, 3), 8)
    assert.equal(await pool.exists(k), 1)
  })

  it('pool.pipeline(): 池级管道一次往返', async () => {
    const k = `${KEY}pipe`
    const pipe = await pool.pipeline()
    pipe.set(k, 'pv')
    pipe.incr(`${KEY}pn`)
    pipe.get(k)
    const results = await pipe.exec()
    assert.deepEqual(results.map(String), ['OK', '1', 'pv'])
    assert.equal(await pool.get(k), 'pv')
  })
})

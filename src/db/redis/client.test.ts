import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { RedisClient } from './client.ts'

// CS-04: 真实 redis（localhost:6379）
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const port = Number(new URL(REDIS_URL).port || 6379)

describe('redis client (real database)', () => {
  const KEY = `wf_client:${process.pid}:`
  let client: RedisClient

  before(async () => {
    client = await RedisClient.connect({ port })
  })

  after(async () => {
    const keys = await client.command('KEYS', `${KEY}*`)
    if (Array.isArray(keys)) for (const k of keys) await client.del(String(k))
    await client.close()
  })

  it('get/set round-trip', async () => {
    await client.set(`${KEY}a`, 'hello')
    assert.equal(await client.get(`${KEY}a`), 'hello')
  })

  it('get missing → null', async () => {
    assert.equal(await client.get(`${KEY}nope`), null)
  })

  it('getBuffer: binary bytes round-trip byte-exact', async () => {
    const k = `${KEY}bin`
    const bytes = Uint8Array.from([0x00, 0xff, 0x80, 0x41, 0x00, 0x10])
    await client.command('SET', k, Buffer.from(bytes))
    const out = await client.getBuffer(k)
    assert.ok(out instanceof Uint8Array)
    assert.deepEqual(Array.from(out as Uint8Array), Array.from(bytes))
  })

  it('getBuffer: missing key → null', async () => {
    assert.equal(await client.getBuffer(`${KEY}bin-nope`), null)
  })

  it('getBuffer and get interleave on one connection (ordered routing)', async () => {
    const k = `${KEY}mix`
    const bytes = Uint8Array.from([0x01, 0x02, 0x00, 0xff])
    await client.command('SET', k, Buffer.from(bytes))
    // 同连接上 get（string 解码）与 getBuffer（字节）交替——响应按序路由不串扰
    const [s1, b1, s2] = await Promise.all([
      client.get(k),
      client.getBuffer(k),
      client.get(k),
    ])
    assert.equal(s1, '\u0001\u0002\u0000\ufffd') // get 是 string 语义：0xff 非合法 utf8 → U+FFFD（有损）
    assert.deepEqual(Array.from(b1 as Uint8Array), Array.from(bytes)) // getBuffer 字节精确（无损）
    assert.equal(s2, '\u0001\u0002\u0000\ufffd')
  })

  it('del removes keys, returns count', async () => {
    const k = `${KEY}d`
    await client.set(k, 'x')
    assert.equal(await client.del(k), 1)
    assert.equal(await client.del(k), 0)
    assert.equal(await client.get(k), null)
  })

  it('incr returns incremented value', async () => {
    const k = `${KEY}n`
    await client.del(k)
    assert.equal(await client.incr(k), 1)
    assert.equal(await client.incr(k), 2)
  })

  it('expire sets TTL, ttl reports remaining', async () => {
    const k = `${KEY}e`
    await client.set(k, 'v')
    assert.equal(await client.expire(k, 100), 1)
    const ttl = await client.ttl(k)
    assert.ok(typeof ttl === 'number' && ttl > 0 && ttl <= 100)
  })

  it('set with ttl is safe (no EX prefix needed)', async () => {
    const k = `${KEY}ttl`
    await client.set(k, 'v', 100)
    const ttl = await client.ttl(k)
    assert.ok(typeof ttl === 'number' && ttl > 0 && ttl <= 100)
    // 值不被误存为 "100"
    assert.equal(await client.get(k), 'v')
  })

  it('jsonSet/jsonGet round-trip objects', async () => {
    const k = `${KEY}json`
    await client.jsonSet(k, { title: 'Deck', slides: [1, 2] })
    assert.deepEqual(await client.jsonGet(k), { title: 'Deck', slides: [1, 2] })
  })

  it('jsonGet missing → null', async () => {
    assert.equal(await client.jsonGet(`${KEY}jnull`), null)
  })

  it('jsonSet with ttl', async () => {
    const k = `${KEY}jttl`
    await client.jsonSet(k, { a: 1 }, 100)
    const ttl = await client.ttl(k)
    assert.ok(typeof ttl === 'number' && ttl > 0 && ttl <= 100)
    assert.deepEqual(await client.jsonGet(k), { a: 1 })
  })

  it('cache: miss calls fn, hit returns cached', async () => {
    const k = `${KEY}cache`
    let calls = 0
    const fn = async () => {
      calls++
      return { data: `result-${calls}` }
    }
    const r1 = await client.cache(k, fn, 60)
    assert.deepEqual(r1, { data: 'result-1' })
    const r2 = await client.cache(k, fn, 60)
    assert.deepEqual(r2, { data: 'result-1' }) // 命中缓存，fn 不再调用
    assert.equal(calls, 1)
  })

  it('cache: null result is not cached', async () => {
    const k = `${KEY}cnul`
    let calls = 0
    const fn = async () => {
      calls++
      return null
    }
    await client.cache(k, fn, 60)
    await client.cache(k, fn, 60)
    assert.equal(calls, 2) // null 不缓存，每次都调 fn
  })

  it('command passes through raw commands', async () => {
    assert.equal(await client.command('PING'), 'PONG')
  })
})

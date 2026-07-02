import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { redis } from '../redis/index.ts'
import type { RedisClient } from '../redis/types.ts'

const REDIS_URL = process.env.TEST_REDIS_URL ?? process.env.REDIS_URL

describe('redis', { skip: !REDIS_URL }, () => {
  let r: RedisClient

  before(async () => {
    r = redis({ url: REDIS_URL })
    await r.redis.flushdb()
  })

  after(async () => {
    await r.close()
  })

  it('set and get a value', async () => {
    await r.redis.set('test:foo', 'bar')
    const val = await r.redis.get('test:foo')
    assert.equal(val, 'bar')
  })

  it('get returns null for missing key', async () => {
    const val = await r.redis.get('test:missing')
    assert.equal(val, null)
  })

  it('del removes a key', async () => {
    await r.redis.set('test:delme', 'value')
    await r.redis.del('test:delme')
    const val = await r.redis.get('test:delme')
    assert.equal(val, null)
  })

  it('ctx.redis is injected by middleware', async () => {
    let capturedRedis: any = null
    const handler = r as unknown as (req: Request, ctx: any, next: any) => any
    await handler(
      new Request('http://localhost/'),
      { params: {}, query: {} } as any,
      (_req: any, ctx: any) => {
        capturedRedis = ctx.redis
        return new Response('ok')
      },
    )
    assert.ok(capturedRedis)
    await capturedRedis.set('test:mw', 'works')
    const val = await capturedRedis.get('test:mw')
    assert.equal(val, 'works')
  })

  it('handles expires', async () => {
    await r.redis.set('test:exp', 'temp', 'EX', 1)
    const val = await r.redis.get('test:exp')
    assert.equal(val, 'temp')
    await new Promise((r) => setTimeout(r, 1100))
    const expired = await r.redis.get('test:exp')
    assert.equal(expired, null)
  })

  it('hset and hgetall', async () => {
    await r.redis.hset('test:hash', { field1: 'a', field2: 'b' })
    const obj = await r.redis.hgetall('test:hash')
    assert.deepEqual(obj, { field1: 'a', field2: 'b' })
  })

  it('accepts string URL form', async () => {
    const { redis } = await import('../redis/index.ts')
    const r = redis(process.env.REDIS_URL!)
    const val = await r.redis.set('test:string', 'ok')
    assert.equal(val, 'OK')
    await r.close()
  })

  it('uses default URL when no opts provided', async () => {
    const { redis } = await import('../redis/index.ts')
    const r = redis()
    const val = await r.redis.set('test:default', 'ok')
    assert.equal(val, 'OK')
    await r.close()
  })
})

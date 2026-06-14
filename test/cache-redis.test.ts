import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../router.ts'
import { cache, RedisCache } from '../cache.ts'
import { redis } from '../redis/index.ts'

const REDIS_URL = process.env.REDIS_URL || process.env.TEST_REDIS_URL
const describeRedis = REDIS_URL ? describe : describe.skip

describeRedis('cache with RedisCache', () => {
  let store: RedisCache
  let redisClient: ReturnType<typeof redis>

  before(async () => {
    redisClient = redis({ url: REDIS_URL })
    await redisClient.redis.ping()
    store = new RedisCache(redisClient.redis, 'test:cache:')
    await store.flush() // clean start
  })

  after(async () => {
    await store.flush()
    await redisClient.close()
  })

  it('sets and reads cache entries', async () => {
    let count = 0
    const c = cache({ store, ttl: 60_000 })
    const r = new Router().use(c).get('/a1', () => {
      count++
      return Response.json({ count })
    })

    await r.handler()(new Request('http://localhost/a1'), { params: {}, query: {} } as any)
    const res = await r.handler()(new Request('http://localhost/a1'), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.headers.get('X-Cache'), 'HIT')
    assert.equal(count, 1)
  })

  it('invalidate(tag) clears tagged entries from Redis', async () => {
    const c = cache({
      store,
      ttl: 60_000,
      tag: (req) => (req.url.includes('b-users') ? 'b-users' : undefined),
    })
    let userCount = 0
    let postCount = 0
    const r = new Router()
      .use(c)
      .get('/b-users', () => {
        userCount++
        return Response.json({})
      })
      .get('/b-posts', () => {
        postCount++
        return Response.json({})
      })

    await r.handler()(new Request('http://localhost/b-users'), { params: {}, query: {} } as any)
    await r.handler()(new Request('http://localhost/b-posts'), { params: {}, query: {} } as any)
    await r.handler()(new Request('http://localhost/b-users'), { params: {}, query: {} } as any)
    await r.handler()(new Request('http://localhost/b-posts'), { params: {}, query: {} } as any)
    assert.equal(userCount, 1)
    assert.equal(postCount, 1)

    await c.invalidate('b-users')

    await r.handler()(new Request('http://localhost/b-users'), { params: {}, query: {} } as any)
    await r.handler()(new Request('http://localhost/b-posts'), { params: {}, query: {} } as any)
    assert.equal(userCount, 2)
    assert.equal(postCount, 1)
  })

  it('flush() clears all Redis cache entries', async () => {
    const c = cache({ store, ttl: 60_000 })
    let count = 0
    const r = new Router().use(c).get('/c-data', () => {
      count++
      return Response.json({ count })
    })

    await r.handler()(new Request('http://localhost/c-data'), { params: {}, query: {} } as any)
    assert.equal(count, 1)
    await c.flush()
    const res = await r.handler()(new Request('http://localhost/c-data'), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.headers.get('X-Cache'), null)
    assert.equal(((await res.json()) as any).count, 2)
  })

  it('TTL expires naturally in Redis', async () => {
    const c = cache({ store, ttl: 100 })
    let count = 0
    const r = new Router().use(c).get('/d-data', () => {
      count++
      return Response.json({ count })
    })

    await r.handler()(new Request('http://localhost/d-data'), { params: {}, query: {} } as any)
    await new Promise((r) => setTimeout(r, 150))
    const res = await r.handler()(new Request('http://localhost/d-data'), {
      params: {},
      query: {},
    } as any)
    assert.equal(((await res.json()) as any).count, 2)
  })

  it('different URLs have separate entries in Redis', async () => {
    let aCount = 0
    let bCount = 0
    const c = cache({ store, ttl: 60_000 })
    const r = new Router()
      .use(c)
      .get('/e-a', () => {
        aCount++
        return Response.json({})
      })
      .get('/e-b', () => {
        bCount++
        return Response.json({})
      })

    await r.handler()(new Request('http://localhost/e-a'), { params: {}, query: {} } as any)
    await r.handler()(new Request('http://localhost/e-b'), { params: {}, query: {} } as any)
    await r.handler()(new Request('http://localhost/e-a'), { params: {}, query: {} } as any)
    await r.handler()(new Request('http://localhost/e-b'), { params: {}, query: {} } as any)
    assert.equal(aCount, 1)
    assert.equal(bCount, 1)
  })
})

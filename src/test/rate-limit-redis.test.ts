import { describe, it, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../core/router.ts'
import { rateLimit } from '../middleware/rate-limit.ts'
import { redis } from '../redis/index.ts'

const REDIS_URL = process.env.REDIS_URL || process.env.TEST_REDIS_URL
const describeRedis = REDIS_URL ? describe : describe.skip

describeRedis('rateLimit with Redis store', () => {
  let redisClient: ReturnType<typeof redis>
  let rl: ReturnType<typeof rateLimit>

  before(async () => {
    redisClient = redis({ url: REDIS_URL })
    await redisClient.redis.ping()
  })

  after(async () => {
    await redisClient.close()
  })

  afterEach(async () => {
    if (rl) rl.stop()
    // Clean up test keys
    const keys = await redisClient.redis.keys('ratelimit:*')
    if (keys.length > 0) await redisClient.redis.del(...keys)
  })

  it('allows requests under the limit', async () => {
    rl = rateLimit({ max: 5, window: 60_000, store: 'redis', redis: redisClient.redis })
    const r = new Router().use(rl).get('/data', () => new Response('ok'))

    for (let i = 0; i < 5; i++) {
      const res = await r.handler()(new Request('http://localhost/data'), {
        params: {},
        query: {},
      } as any)
      assert.equal(res.status, 200)
    }
  })

  it('blocks requests exceeding the limit', async () => {
    rl = rateLimit({ max: 3, window: 60_000, store: 'redis', redis: redisClient.redis })
    const r = new Router().use(rl).get('/data', () => new Response('ok'))

    for (let i = 0; i < 3; i++) {
      const res = await r.handler()(new Request('http://localhost/data'), {
        params: {},
        query: {},
      } as any)
      assert.equal(res.status, 200)
    }

    const res = await r.handler()(new Request('http://localhost/data'), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.status, 429)
  })

  it('returns rate limit headers', async () => {
    rl = rateLimit({ max: 2, window: 60_000, store: 'redis', redis: redisClient.redis })
    const r = new Router().use(rl).get('/data', () => new Response('ok'))

    let res = await r.handler()(new Request('http://localhost/data'), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.headers.get('X-RateLimit-Remaining'), '1')

    res = await r.handler()(new Request('http://localhost/data'), { params: {}, query: {} } as any)
    assert.equal(res.headers.get('X-RateLimit-Remaining'), '0')

    res = await r.handler()(new Request('http://localhost/data'), { params: {}, query: {} } as any)
    assert.equal(res.status, 429)
    assert.equal(res.headers.get('X-RateLimit-Limit'), '2')
    assert.equal(res.headers.get('X-RateLimit-Remaining'), '0')
    assert.ok(res.headers.get('X-RateLimit-Reset'))
    assert.ok(res.headers.get('Retry-After'))
  })

  it('resets after window expires', { timeout: 5000 }, async () => {
    rl = rateLimit({ max: 1, window: 100, store: 'redis', redis: redisClient.redis })
    const r = new Router().use(rl).get('/data', () => new Response('ok'))

    const req = new Request('http://localhost/data')
    const res1 = await r.handler()(req, { params: {}, query: {} } as any)
    assert.equal(res1.status, 200)

    const res2 = await r.handler()(req, { params: {}, query: {} } as any)
    assert.equal(res2.status, 429)

    await new Promise((r) => setTimeout(r, 200))

    const res3 = await r.handler()(req, { params: {}, query: {} } as any)
    assert.equal(res3.status, 200)
  })

  it('different keys are independent in Redis', async () => {
    rl = rateLimit({ max: 1, window: 60_000, store: 'redis', redis: redisClient.redis })
    const r = new Router().use(rl).get('/data', () => new Response('ok'))

    const reqAlice = new Request('http://localhost/data', {
      headers: { 'x-forwarded-for': '1.2.3.4' },
    })
    const res1 = await r.handler()(reqAlice, { params: {}, query: {} } as any)
    assert.equal(res1.status, 200)

    const res2 = await r.handler()(reqAlice, { params: {}, query: {} } as any)
    assert.equal(res2.status, 429)

    // Different IP → allowed
    const reqBob = new Request('http://localhost/data', {
      headers: { 'x-forwarded-for': '5.6.7.8' },
    })
    const res3 = await r.handler()(reqBob, { params: {}, query: {} } as any)
    assert.equal(res3.status, 200)
  })

  it('Redis store shares state across Router instances', async () => {
    // Simulate multi-process: use the same Redis but different Router instances
    const rl1 = rateLimit({ max: 2, window: 60_000, store: 'redis', redis: redisClient.redis })
    const r1 = new Router().use(rl1).get('/data', () => new Response('ok'))

    const rl2 = rateLimit({ max: 2, window: 60_000, store: 'redis', redis: redisClient.redis })
    const r2 = new Router().use(rl2).get('/data', () => new Response('ok'))

    // First two requests via router 1
    const req = new Request('http://localhost/data')
    await r1.handler()(req, { params: {}, query: {} } as any)
    await r1.handler()(req, { params: {}, query: {} } as any)

    // Third via router 2 — should be blocked
    const res = await r2.handler()(req, { params: {}, query: {} } as any)
    assert.equal(res.status, 429)

    rl1.stop()
    rl2.stop()
  })

  it('uses custom key function', async () => {
    rl = rateLimit({
      max: 1,
      window: 60_000,
      store: 'redis',
      redis: redisClient.redis,
      key: (req) => req.headers.get('x-api-key') ?? 'anon',
    })
    const r = new Router().use(rl).get('/data', () => new Response('ok'))

    const req1 = new Request('http://localhost/data', { headers: { 'x-api-key': 'alice' } })
    const res1 = await r.handler()(req1, { params: {}, query: {} } as any)
    assert.equal(res1.status, 200)

    const res2 = await r.handler()(req1, { params: {}, query: {} } as any)
    assert.equal(res2.status, 429)

    const req2 = new Request('http://localhost/data', { headers: { 'x-api-key': 'bob' } })
    const res3 = await r.handler()(req2, { params: {}, query: {} } as any)
    assert.equal(res3.status, 200)
  })

  it('custom message for 429', async () => {
    rl = rateLimit({
      max: 1,
      window: 60_000,
      store: 'redis',
      redis: redisClient.redis,
      message: 'Custom 429',
    })
    const r = new Router().use(rl).get('/data', () => new Response('ok'))

    const req = new Request('http://localhost/data')
    await r.handler()(req, { params: {}, query: {} } as any)
    const res = await r.handler()(req, { params: {}, query: {} } as any)
    assert.equal(res.status, 429)
    assert.equal(await res.text(), 'Custom 429')
  })
})

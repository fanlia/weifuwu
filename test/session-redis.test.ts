import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../router.ts'
import { session, RedisStore } from '../session.ts'
import { redis } from '../redis/index.ts'

const REDIS_URL = process.env.REDIS_URL || process.env.TEST_REDIS_URL
const describeRedis = REDIS_URL ? describe : describe.skip

function parseSetCookie(res: Response): Record<string, string> {
  const cookies: Record<string, string> = {}
  const headers = res.headers.getSetCookie?.() ?? []
  for (const h of headers.length ? headers : [res.headers.get('set-cookie') ?? '']) {
    const idx = h.indexOf('=')
    if (idx === -1) continue
    const name = h.slice(0, idx).trim()
    const rest = h.slice(idx + 1)
    const value = rest.includes(';') ? rest.slice(0, rest.indexOf(';')) : rest
    cookies[name] = value
  }
  return cookies
}

describeRedis('session with RedisStore', () => {
  let store: RedisStore
  let redisClient: ReturnType<typeof redis>

  before(async () => {
    redisClient = redis({ url: REDIS_URL })
    // Ensure redis is connected
    await redisClient.redis.ping()
    store = new RedisStore(redisClient.redis, 'test:session:')
  })

  after(async () => {
    // Clean up test keys
    const keys = await redisClient.redis.keys('test:session:*')
    for (const k of keys) await redisClient.redis.del(k)
    await redisClient.close()
  })

  it('sets and reads session data', async () => {
    const sess = session({ store, ttl: 60_000 })

    const r = new Router()
      .use(sess)
      .get('/set', (req, ctx: any) => {
        ctx.session.userId = 42
        return new Response('ok')
      })
      .get('/get', (req, ctx: any) => {
        return Response.json({ userId: ctx.session.userId })
      })

    const setRes = await r.handler()(new Request('http://localhost/set'), { params: {}, query: {} } as any)
    const sid = parseSetCookie(setRes).__session
    assert.ok(sid)

    const getRes = await r.handler()(
      new Request('http://localhost/get', { headers: { cookie: `__session=${sid}` } }),
      { params: {}, query: {} } as any,
    )
    assert.equal((await getRes.json() as any).userId, 42)
  })

  it('destroy removes session from Redis', async () => {
    const sess = session({ store, ttl: 60_000 })

    const r = new Router()
      .use(sess)
      .get('/set', (req, ctx: any) => {
        ctx.session.userId = 1
        return new Response('ok')
      })
      .get('/destroy', (req, ctx: any) => {
        ctx.session.destroy()
        return new Response('ok')
      })

    const setRes = await r.handler()(new Request('http://localhost/set'), { params: {}, query: {} } as any)
    const sid = parseSetCookie(setRes).__session

    // Verify data is in Redis
    const raw = await redisClient.redis.get(`test:session:${sid}`)
    assert.ok(raw)
    assert.ok(raw.includes('"userId"'))

    // Destroy
    await r.handler()(
      new Request('http://localhost/destroy', { headers: { cookie: `__session=${sid}` } }),
      { params: {}, query: {} } as any,
    )

    // Verify removed from Redis
    const after = await redisClient.redis.get(`test:session:${sid}`)
    assert.equal(after, null)
  })

  it('TTL is set on Redis key', async () => {
    const sess = session({ store, ttl: 5000 }) // 5 seconds

    const r = new Router()
      .use(sess)
      .get('/set', (req, ctx: any) => {
        ctx.session.userId = 1
        return new Response('ok')
      })

    const setRes = await r.handler()(new Request('http://localhost/set'), { params: {}, query: {} } as any)
    const sid = parseSetCookie(setRes).__session

    const ttl = await redisClient.redis.ttl(`test:session:${sid}`)
    assert.ok(ttl > 0)
    assert.ok(ttl <= 5)
  })

  it('handles invalid JSON in Redis gracefully', async () => {
    // Manually corrupt the session data in Redis
    const sess = session({ store, ttl: 60_000 })

    const r = new Router()
      .use(sess)
      .get('/get', (req, ctx: any) => {
        return Response.json({ userId: ctx.session.userId })
      })

    // Corrupt the data for a fake session
    await redisClient.redis.set('test:session:corrupted-sid', 'not-json')

    const res = await r.handler()(
      new Request('http://localhost/get', { headers: { cookie: '__session=corrupted-sid' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    assert.equal((await res.json() as any).userId, undefined)

    // Corrupted key should be deleted
    const exists = await redisClient.redis.exists('test:session:corrupted-sid')
    assert.equal(exists, 0)
  })

  it('supports multiple independent sessions', async () => {
    const sess = session({ store, ttl: 60_000 })

    const r = new Router()
      .use(sess)
      .get('/set', (req, ctx: any) => {
        ctx.session.val = ctx.session.val ?? 0
        ctx.session.val++
        return Response.json({ val: ctx.session.val })
      })

    // Session A
    const resA = await r.handler()(new Request('http://localhost/set'), { params: {}, query: {} } as any)
    const sidA = parseSetCookie(resA).__session
    assert.equal((await resA.json() as any).val, 1)

    // Session B
    const resB = await r.handler()(new Request('http://localhost/set'), { params: {}, query: {} } as any)
    const sidB = parseSetCookie(resB).__session
    assert.equal((await resB.json() as any).val, 1)

    // Session A again
    const resA2 = await r.handler()(
      new Request('http://localhost/set', { headers: { cookie: `__session=${sidA}` } }),
      { params: {}, query: {} } as any,
    )
    assert.equal((await resA2.json() as any).val, 2)
  })

  it('loading non-existent session returns empty object', async () => {
    const sess = session({ store, ttl: 60_000 })

    const r = new Router()
      .use(sess)
      .get('/get', (req, ctx: any) => {
        return Response.json({ val: ctx.session.val ?? null })
      })

    const res = await r.handler()(new Request('http://localhost/get'), { params: {}, query: {} } as any)
    assert.equal((await res.json() as any).val, null)
  })
})

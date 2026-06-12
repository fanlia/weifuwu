import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../router.ts'
import { cache, MemoryCache } from '../cache.ts'

describe('cache', () => {
  it('returns fresh response on first request', async () => {
    const mem = new MemoryCache()
    let count = 0
    const c = cache({ store: mem, ttl: 60_000 })
    const r = new Router()
      .use(c)
      .get('/data', () => { count++; return Response.json({ count }) })

    const res = await r.handler()(new Request('http://localhost/data'), { params: {}, query: {} } as any)
    assert.equal(res.status, 200)
    assert.equal((await res.json() as any).count, 1)
    assert.equal(res.headers.get('X-Cache'), null)
    mem.close()
  })

  it('serves cached response on second request', async () => {
    const mem = new MemoryCache()
    let count = 0
    const c = cache({ store: mem, ttl: 60_000 })
    const r = new Router()
      .use(c)
      .get('/data', () => { count++; return Response.json({ count }) })

    await r.handler()(new Request('http://localhost/data'), { params: {}, query: {} } as any)
    const res = await r.handler()(new Request('http://localhost/data'), { params: {}, query: {} } as any)
    assert.equal(res.status, 200)
    const body = await res.json() as any
    assert.equal(body.count, 1)
    assert.equal(res.headers.get('X-Cache'), 'HIT')
    assert.ok(res.headers.get('Age'))
    mem.close()
  })

  it('respects TTL expiry', async () => {
    const mem = new MemoryCache()
    let count = 0
    const c = cache({ store: mem, ttl: 50 })
    const r = new Router()
      .use(c)
      .get('/data', () => { count++; return Response.json({ count }) })

    await r.handler()(new Request('http://localhost/data'), { params: {}, query: {} } as any)
    await new Promise(r => setTimeout(r, 80))
    const res = await r.handler()(new Request('http://localhost/data'), { params: {}, query: {} } as any)
    assert.equal((await res.json() as any).count, 2)
    mem.close()
  })

  it('does not cache POST requests', async () => {
    const mem = new MemoryCache()
    let count = 0
    const c = cache({ store: mem, ttl: 60_000 })
    const r = new Router()
      .use(c)
      .post('/data', () => { count++; return Response.json({ count }) })

    await r.handler()(new Request('http://localhost/data', { method: 'POST' }), { params: {}, query: {} } as any)
    const res = await r.handler()(new Request('http://localhost/data', { method: 'POST' }), { params: {}, query: {} } as any)
    assert.equal((await res.json() as any).count, 2)
    mem.close()
  })

  it('does not cache requests with Authorization header', async () => {
    const mem = new MemoryCache()
    let count = 0
    const c = cache({ store: mem, ttl: 60_000 })
    const r = new Router()
      .use(c)
      .get('/data', () => { count++; return Response.json({ count }) })

    await r.handler()(
      new Request('http://localhost/data', { headers: { authorization: 'Bearer tok' } }),
      { params: {}, query: {} } as any,
    )
    const res = await r.handler()(
      new Request('http://localhost/data', { headers: { authorization: 'Bearer tok' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal((await res.json() as any).count, 2)
    mem.close()
  })

  it('does not cache requests with Cookie header', async () => {
    const mem = new MemoryCache()
    let count = 0
    const c = cache({ store: mem, ttl: 60_000 })
    const r = new Router()
      .use(c)
      .get('/data', () => { count++; return Response.json({ count }) })

    await r.handler()(
      new Request('http://localhost/data', { headers: { cookie: 'foo=bar' } }),
      { params: {}, query: {} } as any,
    )
    const res = await r.handler()(
      new Request('http://localhost/data', { headers: { cookie: 'foo=bar' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal((await res.json() as any).count, 2)
    mem.close()
  })

  it('does not cache responses with Set-Cookie by default', async () => {
    const mem = new MemoryCache()
    let count = 0
    const c = cache({ store: mem, ttl: 60_000 })
    const r = new Router()
      .use(c)
      .get('/data', () => { count++; return new Response('ok', { headers: { 'set-cookie': 'sess=abc' } }) })

    await r.handler()(new Request('http://localhost/data'), { params: {}, query: {} } as any)
    await r.handler()(new Request('http://localhost/data'), { params: {}, query: {} } as any)
    assert.equal(count, 2)
    mem.close()
  })

  it('caches responses with Set-Cookie when cacheCookies: true', async () => {
    const mem = new MemoryCache()
    let count = 0
    const c = cache({ store: mem, ttl: 60_000, cacheCookies: true })
    const r = new Router()
      .use(c)
      .get('/data', () => { count++; return new Response('ok', { headers: { 'set-cookie': 'sess=abc' } }) })

    await r.handler()(new Request('http://localhost/data'), { params: {}, query: {} } as any)
    const res = await r.handler()(new Request('http://localhost/data'), { params: {}, query: {} } as any)
    assert.equal(res.headers.get('X-Cache'), 'HIT')
    assert.equal(count, 1)
    mem.close()
  })

  it('respects cacheStatus option (caches 404)', async () => {
    const mem = new MemoryCache()
    let count = 0
    const c = cache({ store: mem, ttl: 60_000, cacheStatus: [200, 404] })
    const r = new Router()
      .use(c)
      .get('/nf', () => { count++; return new Response('not found', { status: 404 }) })

    await r.handler()(new Request('http://localhost/nf'), { params: {}, query: {} } as any)
    const cached404 = await r.handler()(new Request('http://localhost/nf'), { params: {}, query: {} } as any)
    assert.equal(cached404.headers.get('X-Cache'), 'HIT')
    assert.equal(count, 1)
    mem.close()
  })

  it('invalidate(tag) clears tagged entries', async () => {
    const mem = new MemoryCache()
    const c = cache({
      store: mem, ttl: 60_000,
      tag: (req) => req.url.includes('users') ? 'users' : undefined,
    })
    let userCount = 0
    let postCount = 0
    const r = new Router()
      .use(c)
      .get('/users', () => { userCount++; return Response.json({ users: [] }) })
      .get('/posts', () => { postCount++; return Response.json({ posts: [] }) })

    await r.handler()(new Request('http://localhost/users'), { params: {}, query: {} } as any)
    await r.handler()(new Request('http://localhost/posts'), { params: {}, query: {} } as any)

    // Both cached
    await r.handler()(new Request('http://localhost/users'), { params: {}, query: {} } as any)
    await r.handler()(new Request('http://localhost/posts'), { params: {}, query: {} } as any)
    assert.equal(userCount, 1)
    assert.equal(postCount, 1)

    // Invalidate only users
    await c.invalidate('users')

    await r.handler()(new Request('http://localhost/users'), { params: {}, query: {} } as any)
    await r.handler()(new Request('http://localhost/posts'), { params: {}, query: {} } as any)
    assert.equal(userCount, 2) // re-fetched
    assert.equal(postCount, 1) // still cached
    mem.close()
  })

  it('flush() clears all entries', async () => {
    const mem = new MemoryCache()
    let count = 0
    const c = cache({ store: mem, ttl: 60_000 })
    const r = new Router()
      .use(c)
      .get('/data', () => { count++; return Response.json({ count }) })

    await r.handler()(new Request('http://localhost/data'), { params: {}, query: {} } as any)
    assert.equal(count, 1)
    await c.flush()
    const res = await r.handler()(new Request('http://localhost/data'), { params: {}, query: {} } as any)
    assert.equal((await res.json() as any).count, 2)
    mem.close()
  })

  it('does not cache binary content types', async () => {
    const mem = new MemoryCache()
    let count = 0
    const c = cache({ store: mem, ttl: 60_000 })
    const r = new Router()
      .use(c)
      .get('/img', () => { count++; return new Response('fakeimg', { headers: { 'content-type': 'image/png' } }) })

    await r.handler()(new Request('http://localhost/img'), { params: {}, query: {} } as any)
    await r.handler()(new Request('http://localhost/img'), { params: {}, query: {} } as any)
    assert.equal(count, 2)
    mem.close()
  })

  it('sets X-Cache header on cached responses', async () => {
    const mem = new MemoryCache()
    const c = cache({ store: mem, ttl: 60_000 })
    const r = new Router()
      .use(c)
      .get('/data', () => new Response('ok'))

    await r.handler()(new Request('http://localhost/data'), { params: {}, query: {} } as any)
    const res = await r.handler()(new Request('http://localhost/data'), { params: {}, query: {} } as any)
    assert.equal(res.headers.get('X-Cache'), 'HIT')
    assert.ok(Number(res.headers.get('Age')) >= 0)
    mem.close()
  })

  it('different URLs have separate cache entries', async () => {
    const mem = new MemoryCache()
    let aCount = 0
    let bCount = 0
    const c = cache({ store: mem, ttl: 60_000 })
    const r = new Router()
      .use(c)
      .get('/a', () => { aCount++; return Response.json({ val: 'a' }) })
      .get('/b', () => { bCount++; return Response.json({ val: 'b' }) })

    await r.handler()(new Request('http://localhost/a'), { params: {}, query: {} } as any)
    await r.handler()(new Request('http://localhost/b'), { params: {}, query: {} } as any)
    await r.handler()(new Request('http://localhost/a'), { params: {}, query: {} } as any)
    await r.handler()(new Request('http://localhost/b'), { params: {}, query: {} } as any)
    assert.equal(aCount, 1)
    assert.equal(bCount, 1)
    mem.close()
  })

  it('query params differentiate cache keys', async () => {
    const mem = new MemoryCache()
    let count = 0
    const c = cache({ store: mem, ttl: 60_000 })
    const r = new Router()
      .use(c)
      .get('/search', (req, ctx) => { count++; return Response.json({ q: ctx.query.q }) })

    await r.handler()(new Request('http://localhost/search?q=foo'), { params: {}, query: { q: 'foo' } } as any)
    await r.handler()(new Request('http://localhost/search?q=bar'), { params: {}, query: { q: 'bar' } } as any)
    assert.equal(count, 2)

    await r.handler()(new Request('http://localhost/search?q=foo'), { params: {}, query: { q: 'foo' } } as any)
    assert.equal(count, 2)
    mem.close()
  })

  it('respects Cache-Control: no-store from response', async () => {
    const mem = new MemoryCache()
    let count = 0
    const c = cache({ store: mem, ttl: 60_000 })
    const r = new Router()
      .use(c)
      .get('/ns', () => { count++; return new Response('no', { headers: { 'cache-control': 'no-store' } }) })

    await r.handler()(new Request('http://localhost/ns'), { params: {}, query: {} } as any)
    await r.handler()(new Request('http://localhost/ns'), { params: {}, query: {} } as any)
    assert.equal(count, 2)
    mem.close()
  })

  it('custom key function', async () => {
    const mem = new MemoryCache()
    let count = 0
    const c = cache({
      store: mem, ttl: 60_000,
      key: (req) => req.headers.get('x-cache-key') ?? 'default',
    })
    const r = new Router()
      .use(c)
      .get('/data', () => { count++; return Response.json({ count }) })

    const req = new Request('http://localhost/data', { headers: { 'x-cache-key': 'mykey' } })
    await r.handler()(req, { params: {}, query: {} } as any)
    const res = await r.handler()(req, { params: {}, query: {} } as any)
    assert.equal(res.headers.get('X-Cache'), 'HIT')
    mem.close()
  })

  it('MemoryCache cleanup removes expired entries', async () => {
    const quick = new MemoryCache(50)
    await quick.set('k1', { status: 200, statusText: 'OK', headers: {}, body: 'x', createdAt: Date.now(), tags: [] }, 30)
    await quick.set('k2', { status: 200, statusText: 'OK', headers: {}, body: 'y', createdAt: Date.now(), tags: [] }, 30)
    assert.equal(quick.size, 2)
    await new Promise(r => setTimeout(r, 100))
    assert.equal(quick.size, 0)
    quick.close()
  })

  it('HEAD requests skip cache (no body to cache)', async () => {
    const mem = new MemoryCache()
    // HEAD with explicit .head() route — cache is checked but response has no body
    let count = 0
    const c = cache({ store: mem, ttl: 60_000 })
    const r = new Router()
      .use(c)
      .head('/data', () => { count++; return new Response(undefined, { headers: { 'x-count': String(count) } }) })

    const res1 = await r.handler()(new Request('http://localhost/data', { method: 'HEAD' }), { params: {}, query: {} } as any)
    assert.equal(res1.headers.get('x-count'), '1')

    const res2 = await r.handler()(new Request('http://localhost/data', { method: 'HEAD' }), { params: {}, query: {} } as any)
    assert.equal(res2.headers.get('x-count'), '1') // cached
    assert.equal(res2.headers.get('X-Cache'), 'HIT')
    assert.equal(count, 1)
    mem.close()
  })
})

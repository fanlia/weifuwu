import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../router.ts'
import { rateLimit } from '../rate-limit.ts'

describe('rateLimit', () => {
  it('allows requests under the limit', async () => {
    const r = new Router()
      .use(rateLimit({ max: 5, window: 60_000 }))
      .get('/data', () => new Response('ok'))

    for (let i = 0; i < 5; i++) {
      const res = await r.handler()(new Request('http://localhost/data'), { params: {}, query: {} } as any)
      assert.equal(res.status, 200)
    }
  })

  it('blocks requests exceeding the limit', async () => {
    const r = new Router()
      .use(rateLimit({ max: 3, window: 60_000 }))
      .get('/data', () => new Response('ok'))

    for (let i = 0; i < 3; i++) {
      const res = await r.handler()(new Request('http://localhost/data'), { params: {}, query: {} } as any)
      assert.equal(res.status, 200)
    }

    const res = await r.handler()(new Request('http://localhost/data'), { params: {}, query: {} } as any)
    assert.equal(res.status, 429)
  })

  it('returns rate limit headers', async () => {
    const r = new Router()
      .use(rateLimit({ max: 2, window: 60_000 }))
      .get('/data', () => new Response('ok'))

    let res = await r.handler()(new Request('http://localhost/data'), { params: {}, query: {} } as any)
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

  it('uses custom key function', async () => {
    const keys: string[] = []
    const r = new Router()
      .use(rateLimit({
        max: 1,
        window: 60_000,
        key: (req) => {
          const key = req.headers.get('x-api-key') ?? 'anonymous'
          keys.push(key)
          return key
        },
      }))
      .get('/data', () => new Response('ok'))

    const req1 = new Request('http://localhost/data', { headers: { 'x-api-key': 'alice' } })
    const res1 = await r.handler()(req1, { params: {}, query: {} } as any)
    assert.equal(res1.status, 200)

    const res2 = await r.handler()(req1, { params: {}, query: {} } as any)
    assert.equal(res2.status, 429)

    const req2 = new Request('http://localhost/data', { headers: { 'x-api-key': 'bob' } })
    const res3 = await r.handler()(req2, { params: {}, query: {} } as any)
    assert.equal(res3.status, 200)
  })

  it('resets after window expires', { timeout: 2000 }, async () => {
    const r = new Router()
      .use(rateLimit({ max: 1, window: 100 }))
      .get('/data', () => new Response('ok'))

    const req = new Request('http://localhost/data')
    const res1 = await r.handler()(req, { params: {}, query: {} } as any)
    assert.equal(res1.status, 200)

    const res2 = await r.handler()(req, { params: {}, query: {} } as any)
    assert.equal(res2.status, 429)

    await new Promise((r) => setTimeout(r, 150))

    const res3 = await r.handler()(req, { params: {}, query: {} } as any)
    assert.equal(res3.status, 200)
  })

  it('.stop() clears interval and hits map', async () => {
    const rl = rateLimit({ max: 1, window: 60_000 })
    const r = new Router()
      .use(rl)
      .get('/data', () => new Response('ok'))

    const req = new Request('http://localhost/data')
    const res1 = await r.handler()(req, { params: {}, query: {} } as any)
    assert.equal(res1.status, 200)

    rl.stop()

    // After stop, new requests should work as if fresh
    const res2 = await r.handler()(req, { params: {}, query: {} } as any)
    assert.equal(res2.status, 200)
  })

  it('uses default key with x-forwarded-for header', async () => {
    const r = new Router()
      .use(rateLimit({ max: 1, window: 60_000 }))
      .get('/data', () => new Response('ok'))

    const reqAlice = new Request('http://localhost/data', { headers: { 'x-forwarded-for': '1.2.3.4' } })
    const res1 = await r.handler()(reqAlice, { params: {}, query: {} } as any)
    assert.equal(res1.status, 200)

    // Same IP → blocked
    const res2 = await r.handler()(reqAlice, { params: {}, query: {} } as any)
    assert.equal(res2.status, 429)

    // Different IP → allowed
    const reqBob = new Request('http://localhost/data', { headers: { 'x-forwarded-for': '5.6.7.8' } })
    const res3 = await r.handler()(reqBob, { params: {}, query: {} } as any)
    assert.equal(res3.status, 200)
  })

  it('uses custom message for 429 response', async () => {
    const r = new Router()
      .use(rateLimit({ max: 1, window: 60_000, message: 'Custom Limit' }))
      .get('/data', () => new Response('ok'))

    const req = new Request('http://localhost/data')
    await r.handler()(req, { params: {}, query: {} } as any)
    const res = await r.handler()(req, { params: {}, query: {} } as any)
    assert.equal(res.status, 429)
    assert.equal(await res.text(), 'Custom Limit')
  })

  it('Retry-After header approximates remaining time', async () => {
    const r = new Router()
      .use(rateLimit({ max: 1, window: 60_000 }))
      .get('/data', () => new Response('ok'))

    const req = new Request('http://localhost/data')
    await r.handler()(req, { params: {}, query: {} } as any)
    const res = await r.handler()(req, { params: {}, query: {} } as any)
    const retryAfter = parseInt(res.headers.get('Retry-After') ?? '0', 10)
    assert.ok(retryAfter > 0)
    assert.ok(retryAfter <= 60)
  })

  it('uses x-real-ip when x-forwarded-for is absent', async () => {
    const r = new Router()
      .use(rateLimit({ max: 1, window: 60_000 }))
      .get('/data', () => new Response('ok'))

    const req = new Request('http://localhost/data', { headers: { 'x-real-ip': '10.0.0.1' } })
    const res1 = await r.handler()(req, { params: {}, query: {} } as any)
    assert.equal(res1.status, 200)
    const res2 = await r.handler()(req, { params: {}, query: {} } as any)
    assert.equal(res2.status, 429)
  })

  it('uses cf-connecting-ip when other headers are absent', async () => {
    const r = new Router()
      .use(rateLimit({ max: 1, window: 60_000 }))
      .get('/data', () => new Response('ok'))

    const req = new Request('http://localhost/data', { headers: { 'cf-connecting-ip': '9.9.9.9' } })
    const res1 = await r.handler()(req, { params: {}, query: {} } as any)
    assert.equal(res1.status, 200)
    const res2 = await r.handler()(req, { params: {}, query: {} } as any)
    assert.equal(res2.status, 429)
  })
})

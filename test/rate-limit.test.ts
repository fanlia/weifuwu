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
})

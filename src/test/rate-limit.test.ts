import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../core/router.ts'
import { rateLimit } from '../middleware/rate-limit.ts'

function mkCtx() { return { params: {}, query: {} } as any }

describe('rateLimit', () => {
  it('allows requests under the limit', async () => {
    const r = new Router()
      .use(rateLimit({ windowMs: 60_000, max: 10 }))
      .get('/', () => new Response('ok'))
    const res = await r.handler()(new Request('http://localhost/'), mkCtx())
    assert.equal(res.status, 200)
  })

  it('returns rate limit headers', async () => {
    const r = new Router()
      .use(rateLimit({ windowMs: 60_000, max: 10 }))
      .get('/', () => new Response('ok'))
    const res = await r.handler()(new Request('http://localhost/'), mkCtx())
    assert.ok(res.headers.has('X-RateLimit-Limit'))
    assert.ok(res.headers.has('X-RateLimit-Remaining'))
  })

  it('blocks requests exceeding the limit', async () => {
    const r = new Router()
      .use(rateLimit({ windowMs: 60_000, max: 2 }))
      .get('/', () => new Response('ok'))

    // First 2 requests pass
    await r.handler()(new Request('http://localhost/'), mkCtx())
    await r.handler()(new Request('http://localhost/'), mkCtx())
    // 3rd should be blocked
    const res = await r.handler()(new Request('http://localhost/'), mkCtx())
    assert.equal(res.status, 429)
  })

  it('different keys are independent', async () => {
    const r = new Router()
      .use(rateLimit({ windowMs: 60_000, max: 1 }))
      .get('/', () => new Response('ok'))

    // Key 1: first request passes
    let res = await r.handler()(
      new Request('http://localhost/', { headers: { 'x-forwarded-for': '1.1.1.1' } }),
      mkCtx())
    assert.equal(res.status, 200)
    // Key 2: first request also passes
    res = await r.handler()(
      new Request('http://localhost/', { headers: { 'x-forwarded-for': '2.2.2.2' } }),
      mkCtx())
    assert.equal(res.status, 200)
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../core/router.ts'
import { cors } from '../middleware/cors.ts'

function mkCtx() { return { params: {}, query: {} } as any }

describe('cors', () => {
  it('adds Access-Control-Allow-Origin: * by default', async () => {
    const r = new Router().use(cors()).get('/', () => new Response('ok'))
    const res = await r.handler()(new Request('http://localhost/'), mkCtx())
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*')
  })

  it('reflects allowed origin', async () => {
    const r = new Router()
      .use(cors({ origin: ['https://example.com'] }))
      .get('/', () => new Response('ok'))
    const res = await r.handler()(
      new Request('http://localhost/', { headers: { origin: 'https://example.com' } }), mkCtx())
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://example.com')
  })

  it('omits CORS for disallowed origin', async () => {
    const r = new Router()
      .use(cors({ origin: ['https://app.com'] }))
      .get('/', () => new Response('ok'))
    const res = await r.handler()(
      new Request('http://localhost/', { headers: { origin: 'https://evil.com' } }), mkCtx())
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), null)
  })

  it('handles OPTIONS preflight', async () => {
    const r = new Router()
      .use(cors({ origin: '*', methods: ['GET', 'POST'] }))
      .get('/data', () => new Response('ok'))
    const res = await r.handler()(
      new Request('http://localhost/data', { method: 'OPTIONS', headers: { origin: 'https://app.com' } }), mkCtx())
    assert.ok(res.headers.get('Access-Control-Allow-Methods'))
  })

  it('sets credentials and maxAge on OPTIONS', async () => {
    const r = new Router()
      .use(cors({ credentials: true, maxAge: 3600 }))
      .get('/', () => new Response('ok'))
    const res = await r.handler()(
      new Request('http://localhost/', { method: 'OPTIONS', headers: { origin: 'https://app.com' } }), mkCtx())
    assert.equal(res.headers.get('Access-Control-Allow-Credentials'), 'true')
    assert.equal(res.headers.get('Access-Control-Max-Age'), '3600')
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../router.ts'
import { cors } from '../middleware.ts'

function handler(text = 'ok') {
  return () => new Response(text)
}

// ── CORS core ───────────────────────────────────────────────────────────────

describe('cors', () => {
  it('adds Access-Control-Allow-Origin: * by default', async () => {
    const r = new Router()
      .use(cors())
      .get('/data', handler())

    const res = await r.handler()(new Request('http://localhost/data'), { params: {}, query: {} } as any)
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*')
  })

  it('reflects request origin when in allowed list', async () => {
    const r = new Router()
      .use(cors({ origin: ['https://example.com', 'https://app.com'] }))
      .get('/data', handler())

    const res = await r.handler()(
      new Request('http://localhost/data', { headers: { origin: 'https://example.com' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://example.com')
  })

  it('omits CORS headers for disallowed origin', async () => {
    const r = new Router()
      .use(cors({ origin: ['https://example.com'] }))
      .get('/data', handler())

    const res = await r.handler()(
      new Request('http://localhost/data', { headers: { origin: 'https://evil.com' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), null)
  })

  it('handles OPTIONS preflight', async () => {
    const r = new Router()
      .use(cors({ origin: 'https://example.com', methods: ['GET', 'POST'], allowedHeaders: ['X-Custom'], maxAge: 3600 }))
      .get('/data', handler())

    const res = await r.handler()(
      new Request('http://localhost/data', { method: 'OPTIONS', headers: { origin: 'https://example.com' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 204)
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://example.com')
    assert.equal(res.headers.get('Access-Control-Allow-Methods'), 'GET, POST')
    assert.equal(res.headers.get('Access-Control-Allow-Headers'), 'X-Custom')
    assert.equal(res.headers.get('Access-Control-Max-Age'), '3600')
  })

  it('sets Access-Control-Allow-Credentials', async () => {
    const r = new Router()
      .use(cors({ origin: 'https://example.com', credentials: true }))
      .get('/data', handler())

    const res = await r.handler()(
      new Request('http://localhost/data', { headers: { origin: 'https://example.com' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.headers.get('Access-Control-Allow-Credentials'), 'true')
  })

  it('sets Access-Control-Expose-Headers', async () => {
    const r = new Router()
      .use(cors({ origin: '*', exposedHeaders: ['X-Total-Count', 'X-Page'] }))
      .get('/data', handler())

    const res = await r.handler()(new Request('http://localhost/data'), { params: {}, query: {} } as any)
    assert.equal(res.headers.get('Access-Control-Expose-Headers'), 'X-Total-Count, X-Page')
  })

  it('sets Vary: Origin', async () => {
    const r = new Router()
      .use(cors({ origin: 'https://example.com' }))
      .get('/data', handler())

    const res = await r.handler()(
      new Request('http://localhost/data', { headers: { origin: 'https://example.com' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.headers.get('Vary'), 'Origin')
  })

  it('uses dynamic origin function', async () => {
    const r = new Router()
      .use(cors({
        origin: (origin) => origin.endsWith('.trusted.com') ? origin : false,
      }))
      .get('/data', handler())

    const res1 = await r.handler()(
      new Request('http://localhost/data', { headers: { origin: 'https://app.trusted.com' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res1.headers.get('Access-Control-Allow-Origin'), 'https://app.trusted.com')

    const res2 = await r.handler()(
      new Request('http://localhost/data', { headers: { origin: 'https://evil.com' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res2.headers.get('Access-Control-Allow-Origin'), null)
  })

  it('returns 204 for OPTIONS without matching route', async () => {
    const r = new Router()
      .use(cors({ origin: '*' }))
      .get('/data', handler())

    const res = await r.handler()(
      new Request('http://localhost/other', { method: 'OPTIONS', headers: { origin: 'https://example.com' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 204)
  })
})

// ── CORS edge cases ──────────────────────────────────────────────────────────

describe('cors edge cases', () => {
  it('reflects origin when credentials:true with origin:*', async () => {
    const r = new Router()
      .use(cors({ credentials: true }))
      .get('/data', () => new Response('ok'))

    const res = await r.handler()(
      new Request('http://localhost/data', { headers: { origin: 'https://example.com' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://example.com')
    assert.equal(res.headers.get('Access-Control-Allow-Credentials'), 'true')
  })

  it('omits Vary when Access-Control-Allow-Origin is *', async () => {
    const r = new Router()
      .use(cors())
      .get('/data', () => new Response('ok'))

    const res = await r.handler()(new Request('http://localhost/data'), { params: {}, query: {} } as any)
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*')
    assert.equal(res.headers.get('Vary'), null)
  })

  it('function origin can return a fixed string', async () => {
    const r = new Router()
      .use(cors({ origin: () => 'https://fixed.com' }))
      .get('/data', () => new Response('ok'))

    const res = await r.handler()(
      new Request('http://localhost/data', { headers: { origin: 'https://whatever.com' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://fixed.com')
  })
})

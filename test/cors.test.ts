import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { testApp } from '../test-utils.ts'
import { cors } from '../cors.ts'

function handler(text = 'ok') {
  return () => new Response(text)
}

// ── CORS core ───────────────────────────────────────────────────────────────

describe('cors', () => {
  it('adds Access-Control-Allow-Origin: * by default', async () => {
    const res = await testApp()
      .use(cors())
      .get('/data', handler())
      .getReq('/data')
      .send()
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*')
  })

  it('reflects request origin when in allowed list', async () => {
    const res = await testApp()
      .use(cors({ origin: ['https://example.com', 'https://app.com'] }))
      .get('/data', handler())
      .getReq('/data')
      .header('origin', 'https://example.com')
      .send()
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://example.com')
  })

  it('omits CORS headers for disallowed origin', async () => {
    const res = await testApp()
      .use(cors({ origin: ['https://example.com'] }))
      .get('/data', handler())
      .getReq('/data')
      .header('origin', 'https://evil.com')
      .send()
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), null)
  })

  it('handles OPTIONS preflight', async () => {
    const res = await testApp()
      .use(cors({ origin: 'https://example.com', methods: ['GET', 'POST'], allowedHeaders: ['X-Custom'], maxAge: 3600 }))
      .get('/data', handler())
      .getReq('/data')
      .header('origin', 'https://example.com')
      .send() // TestApp.getReq defaults to GET; use postReq with OPTIONS method?
    // Actually, TestRequest only sends the method set in constructor.
    // For OPTIONS, we need a separate path.
    // Let's use the handler directly for this case
    const r = testApp()
      .use(cors({ origin: 'https://example.com', methods: ['GET', 'POST'], allowedHeaders: ['X-Custom'], maxAge: 3600 }))
      .get('/data', handler())
    const handler2 = r.handler()
    const res2 = await handler2(
      new Request('http://localhost/data', { method: 'OPTIONS', headers: { origin: 'https://example.com' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res2.status, 204)
    assert.equal(res2.headers.get('Access-Control-Allow-Origin'), 'https://example.com')
    assert.equal(res2.headers.get('Access-Control-Allow-Methods'), 'GET, POST')
    assert.equal(res2.headers.get('Access-Control-Allow-Headers'), 'X-Custom')
    assert.equal(res2.headers.get('Access-Control-Max-Age'), '3600')
  })

  it('sets Access-Control-Allow-Credentials', async () => {
    const res = await testApp()
      .use(cors({ origin: 'https://example.com', credentials: true }))
      .get('/data', handler())
      .getReq('/data')
      .header('origin', 'https://example.com')
      .send()
    assert.equal(res.headers.get('Access-Control-Allow-Credentials'), 'true')
  })

  it('sets Access-Control-Expose-Headers', async () => {
    const res = await testApp()
      .use(cors({ origin: '*', exposedHeaders: ['X-Total-Count', 'X-Page'] }))
      .get('/data', handler())
      .getReq('/data')
      .send()
    assert.equal(res.headers.get('Access-Control-Expose-Headers'), 'X-Total-Count, X-Page')
  })

  it('sets Vary: Origin', async () => {
    const res = await testApp()
      .use(cors({ origin: 'https://example.com' }))
      .get('/data', handler())
      .getReq('/data')
      .header('origin', 'https://example.com')
      .send()
    assert.equal(res.headers.get('Vary'), 'Origin')
  })

  it('uses dynamic origin function', async () => {
    const app = testApp()
      .use(cors({ origin: (origin: string) => origin.endsWith('.trusted.com') ? origin : false }))
      .get('/data', handler())

    const res1 = await app.getReq('/data').header('origin', 'https://app.trusted.com').send()
    assert.equal(res1.headers.get('Access-Control-Allow-Origin'), 'https://app.trusted.com')

    const res2 = await app.getReq('/data').header('origin', 'https://evil.com').send()
    assert.equal(res2.headers.get('Access-Control-Allow-Origin'), null)
  })

  it('returns 204 for OPTIONS without matching route', async () => {
    // OPTIONS requests are handled by cors middleware, not the route handler
    const app = testApp()
      .use(cors({ origin: '*' }))
      .get('/data', handler())
    const h = app.handler()
    const res = await h(
      new Request('http://localhost/other', { method: 'OPTIONS', headers: { origin: 'https://example.com' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 204)
  })
})

// ── CORS edge cases ──────────────────────────────────────────────────────────

describe('cors edge cases', () => {
  it('reflects origin when credentials:true with origin:*', async () => {
    const res = await testApp()
      .use(cors({ credentials: true }))
      .get('/data', () => new Response('ok'))
      .getReq('/data')
      .header('origin', 'https://example.com')
      .send()
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://example.com')
    assert.equal(res.headers.get('Access-Control-Allow-Credentials'), 'true')
  })

  it('omits Vary when Access-Control-Allow-Origin is *', async () => {
    const res = await testApp()
      .use(cors())
      .get('/data', () => new Response('ok'))
      .getReq('/data')
      .send()
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*')
    assert.equal(res.headers.get('Vary'), null)
  })

  it('function origin can return a fixed string', async () => {
    const res = await testApp()
      .use(cors({ origin: () => 'https://fixed.com' }))
      .get('/data', () => new Response('ok'))
      .getReq('/data')
      .header('origin', 'https://whatever.com')
      .send()
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://fixed.com')
  })
})

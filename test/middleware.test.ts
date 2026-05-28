import { describe, it, mock, after } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../router.ts'
import { serve } from '../serve.ts'
import { auth, cors, logger } from '../middleware.ts'

function handler(text = 'ok') {
  return () => new Response(text)
}

// ── Logger ────────────────────────────────────────────────────────────────────

describe('logger', () => {
  it('logs method, path and status', async () => {
    const logs: string[] = []
    mock.method(console, 'log', (msg: string) => { logs.push(msg) })

    const r = new Router()
      .use(logger())
      .get('/hello', handler())

    await r.handler()(new Request('http://localhost/hello'), { params: {}, query: {} } as any)

    assert.equal(logs.length, 1)
    assert.ok(logs[0]!.includes('GET'))
    assert.ok(logs[0]!.includes('/hello'))
    assert.ok(logs[0]!.includes('200'))

    mock.restoreAll()
  })

  it('combined format includes search params', async () => {
    const logs: string[] = []
    mock.method(console, 'log', (msg: string) => { logs.push(msg) })

    const r = new Router()
      .use(logger({ format: 'combined' }))
      .get('/search', handler())

    await r.handler()(new Request('http://localhost/search?q=test'), { params: {}, query: {} } as any)

    assert.ok(logs[0]!.includes('?q=test'))

    mock.restoreAll()
  })
})

// ── CORS ───────────────────────────────────────────────────────────────────────

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

// ── Auth ───────────────────────────────────────────────────────────────────────

function authHandler() {
  return (req: Request, ctx: { user?: unknown }) =>
    Response.json({ user: ctx.user })
}

describe('auth', () => {
  it('rejects missing Authorization header with 401', async () => {
    const r = new Router()
      .use(auth({ token: 'secret' }))
      .get('/data', handler())

    const res = await r.handler()(new Request('http://localhost/data'), { params: {}, query: {} } as any)
    assert.equal(res.status, 401)
  })

  it('sets WWW-Authenticate header on 401', async () => {
    const r = new Router()
      .use(auth({ token: 'secret' }))
      .get('/data', handler())

    const res = await r.handler()(new Request('http://localhost/data'), { params: {}, query: {} } as any)
    assert.equal(res.headers.get('WWW-Authenticate'), 'Bearer')
  })

  it('accepts valid Bearer token', async () => {
    const r = new Router()
      .use(auth({ token: 'secret' }))
      .get('/data', handler())

    const res = await r.handler()(
      new Request('http://localhost/data', { headers: { Authorization: 'Bearer secret' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
  })

  it('rejects invalid Bearer token with 403', async () => {
    const r = new Router()
      .use(auth({ token: 'secret' }))
      .get('/data', handler())

    const res = await r.handler()(
      new Request('http://localhost/data', { headers: { Authorization: 'Bearer wrong' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 403)
  })

  it('supports custom header name (X-API-Key)', async () => {
    const r = new Router()
      .use(auth({ token: 'my-key', header: 'X-API-Key' }))
      .get('/data', handler())

    const res1 = await r.handler()(
      new Request('http://localhost/data', { headers: { 'X-API-Key': 'my-key' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res1.status, 200)

    const res2 = await r.handler()(
      new Request('http://localhost/data', { headers: { 'X-API-Key': 'wrong' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res2.status, 403)
  })

  it('does not set WWW-Authenticate for custom header', async () => {
    const r = new Router()
      .use(auth({ token: 'my-key', header: 'X-API-Key' }))
      .get('/data', handler())

    const res = await r.handler()(new Request('http://localhost/data'), { params: {}, query: {} } as any)
    assert.equal(res.headers.get('WWW-Authenticate'), null)
  })

  it('verify returning boolean true passes', async () => {
    const r = new Router()
      .use(auth({
        verify: () => true,
      }))
      .get('/data', handler())

    const res = await r.handler()(
      new Request('http://localhost/data', { headers: { Authorization: 'Bearer any' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
  })

  it('verify returning boolean false rejects with 403', async () => {
    const r = new Router()
      .use(auth({
        verify: () => false,
      }))
      .get('/data', handler())

    const res = await r.handler()(
      new Request('http://localhost/data', { headers: { Authorization: 'Bearer any' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 403)
  })

  it('verify returning object sets ctx.user', async () => {
    const r = new Router()
      .use(auth({
        verify: () => ({ sub: 'user-1', role: 'admin' }),
      }))
      .get('/admin', authHandler())

    const res = await r.handler()(
      new Request('http://localhost/admin', { headers: { Authorization: 'Bearer token' } }),
      { params: {}, query: {} } as any,
    )
    const data = await res.json() as Record<string, unknown>
    assert.deepEqual(data.user, { sub: 'user-1', role: 'admin' })
  })

  it('verify returning null rejects with 403', async () => {
    const r = new Router()
      .use(auth({
        verify: () => null,
      }))
      .get('/data', handler())

    const res = await r.handler()(
      new Request('http://localhost/data', { headers: { Authorization: 'Bearer any' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 403)
  })

  it('works as route-level middleware', async () => {
    const mw = auth({ verify: () => ({ sub: 'u1' }) })

    const r = new Router()
      .get('/admin', mw, (req, ctx) =>
        Response.json({ user: ctx.user }),
      )

    const res = await r.handler()(
      new Request('http://localhost/admin', { headers: { Authorization: 'Bearer token' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    const data = await res.json() as Record<string, unknown>
    assert.deepEqual(data.user, { sub: 'u1' })
  })

  it('route-level auth rejects without token', async () => {
    const mw = auth({ verify: () => ({ sub: 'u1' }) })

    const r = new Router()
      .get('/admin', mw, (req, ctx) => Response.json({ user: ctx.user }))

    const res = await r.handler()(
      new Request('http://localhost/admin'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 401)
  })

  // ── Proxy mode ──────────────────────────────────────────────────────────

  it('proxy: 2xx response passes auth', async () => {
    const proxy = serve(() => new Response(JSON.stringify({ sub: 'u1' }), {
      headers: { 'content-type': 'application/json' },
    }), { port: 0 })
    await proxy.ready
    const proxyUrl = `http://localhost:${proxy.port}/validate`

    const r = new Router()
      .get('/data', auth({ proxy: proxyUrl }), authHandler())

    const res = await r.handler()(
      new Request('http://localhost/data', { headers: { Authorization: 'Bearer valid' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    const data = await res.json() as Record<string, unknown>
    assert.deepEqual(data.user, { sub: 'u1' })
    proxy.stop()
  })

  it('proxy: 4xx response rejects auth', async () => {
    const proxy = serve(() => new Response('Unauthorized', { status: 401 }), { port: 0 })
    await proxy.ready
    const proxyUrl = `http://localhost:${proxy.port}/validate`

    const r = new Router()
      .get('/data', auth({ proxy: proxyUrl }), handler())

    const res = await r.handler()(
      new Request('http://localhost/data', { headers: { Authorization: 'Bearer bad' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 401)
    proxy.stop()
  })

  it('proxy forwards Authorization header for Bearer tokens', async () => {
    let receivedAuth: string | null = null
    const proxy = serve((req) => {
      receivedAuth = req.headers.get('Authorization')
      return new Response('ok')
    }, { port: 0 })
    await proxy.ready
    const proxyUrl = `http://localhost:${proxy.port}/validate`

    const r = new Router()
      .get('/data', auth({ proxy: proxyUrl }), handler())

    await r.handler()(
      new Request('http://localhost/data', { headers: { Authorization: 'Bearer mytoken' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(receivedAuth, 'Bearer mytoken')
    proxy.stop()
  })

  it('proxy forwards custom header when token from header', async () => {
    let receivedHeader = ''
    const proxy = serve((req) => {
      receivedHeader = req.headers.get('X-API-Key') ?? ''
      return new Response('ok')
    }, { port: 0 })
    await proxy.ready
    const proxyUrl = `http://localhost:${proxy.port}/validate`

    const r = new Router()
      .get('/data', auth({ proxy: proxyUrl, header: 'X-API-Key' }), handler())

    await r.handler()(
      new Request('http://localhost/data', { headers: { 'X-API-Key': 'my-key' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(receivedHeader, 'my-key')
    proxy.stop()
  })

  it('proxy sends access_token query param when token from query', async () => {
    let receivedQuery = ''
    const proxy = serve((req) => {
      receivedQuery = new URL(req.url).search
      return new Response('ok')
    }, { port: 0 })
    await proxy.ready
    const proxyUrl = `http://localhost:${proxy.port}/validate`

    const r = new Router()
      .get('/data', auth({ proxy: proxyUrl }), handler())

    await r.handler()(
      new Request('http://localhost/data?access_token=my-key'),
      { params: {}, query: { access_token: 'my-key' } } as any,
    )
    assert.ok(receivedQuery.includes('access_token=my-key'))
    proxy.stop()
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../router.ts'
import { serve } from '../serve.ts'
import { auth } from '../auth.ts'

function handler(text = 'ok') {
  return () => new Response(text)
}

function authHandler() {
  return (req: Request, ctx: { user?: unknown }) =>
    Response.json({ user: ctx.user })
}

// ── Auth core ────────────────────────────────────────────────────────────────

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
      .use(auth({ verify: () => true }))
      .get('/data', handler())

    const res = await r.handler()(
      new Request('http://localhost/data', { headers: { Authorization: 'Bearer any' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
  })

  it('verify returning boolean false rejects with 403', async () => {
    const r = new Router()
      .use(auth({ verify: () => false }))
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
      .use(auth({ verify: () => null }))
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

// ── Auth edge cases ───────────────────────────────────────────────────────────

describe('auth edge cases', () => {
  it('throws when initialized with no options', () => {
    assert.throws(() => auth({}), /auth\(\) requires/)
  })

  it('accepts access_token query param in non-proxy mode', async () => {
    const r = new Router()
      .use(auth({ token: 'my-key' }))
      .get('/data', () => new Response('ok'))

    const res = await r.handler()(
      new Request('http://localhost/data?access_token=my-key'),
      { params: {}, query: { access_token: 'my-key' } } as any,
    )
    assert.equal(res.status, 200)
  })

  it('accepts Authorization header without Bearer prefix', async () => {
    const r = new Router()
      .use(auth({ token: 'my-key' }))
      .get('/data', () => new Response('ok'))

    const res = await r.handler()(
      new Request('http://localhost/data', { headers: { Authorization: 'my-key' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
  })

  it('returns 500 for invalid proxy URL', async () => {
    const r = new Router()
      .use(auth({ proxy: 'not-a-valid-url' }))
      .get('/data', () => new Response('ok'))

    const res = await r.handler()(
      new Request('http://localhost/data', { headers: { Authorization: 'Bearer token' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 500)
  })
})

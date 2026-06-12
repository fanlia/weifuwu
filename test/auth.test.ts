import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { testApp } from '../test-utils.ts'
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
    const res = await testApp()
      .use(auth({ token: 'secret' }))
      .get('/data', handler())
      .getReq('/data')
      .send()
    assert.equal(res.status, 401)
  })

  it('sets WWW-Authenticate header on 401', async () => {
    const res = await testApp()
      .use(auth({ token: 'secret' }))
      .get('/data', handler())
      .getReq('/data')
      .send()
    assert.equal(res.headers.get('WWW-Authenticate'), 'Bearer')
  })

  it('accepts valid Bearer token', async () => {
    const res = await testApp()
      .use(auth({ token: 'secret' }))
      .get('/data', handler())
      .getReq('/data')
      .header('Authorization', 'Bearer secret')
      .send()
    assert.equal(res.status, 200)
  })

  it('rejects invalid Bearer token with 403', async () => {
    const res = await testApp()
      .use(auth({ token: 'secret' }))
      .get('/data', handler())
      .getReq('/data')
      .header('Authorization', 'Bearer wrong')
      .send()
    assert.equal(res.status, 403)
  })

  it('supports custom header name (X-API-Key)', async () => {
    const app = testApp()
      .use(auth({ token: 'my-key', header: 'X-API-Key' }))
      .get('/data', handler())

    const res1 = await app.getReq('/data').header('X-API-Key', 'my-key').send()
    assert.equal(res1.status, 200)

    const res2 = await app.getReq('/data').header('X-API-Key', 'wrong').send()
    assert.equal(res2.status, 403)
  })

  it('does not set WWW-Authenticate for custom header', async () => {
    const res = await testApp()
      .use(auth({ token: 'my-key', header: 'X-API-Key' }))
      .get('/data', handler())
      .getReq('/data')
      .send()
    assert.equal(res.headers.get('WWW-Authenticate'), null)
  })

  it('verify returning boolean true passes', async () => {
    const res = await testApp()
      .use(auth({ verify: () => true }))
      .get('/data', handler())
      .getReq('/data')
      .header('Authorization', 'Bearer any')
      .send()
    assert.equal(res.status, 200)
  })

  it('verify returning boolean false rejects with 403', async () => {
    const res = await testApp()
      .use(auth({ verify: () => false }))
      .get('/data', handler())
      .getReq('/data')
      .header('Authorization', 'Bearer any')
      .send()
    assert.equal(res.status, 403)
  })

  it('verify returning object sets ctx.user', async () => {
    const res = await testApp()
      .use(auth({ verify: () => ({ sub: 'user-1', role: 'admin' }) }))
      .get('/admin', authHandler())
      .getReq('/admin')
      .header('Authorization', 'Bearer token')
      .send()
    const data = await res.json() as Record<string, unknown>
    assert.deepEqual(data.user, { sub: 'user-1', role: 'admin' })
  })

  it('verify returning null rejects with 403', async () => {
    const res = await testApp()
      .use(auth({ verify: () => null }))
      .get('/data', handler())
      .getReq('/data')
      .header('Authorization', 'Bearer any')
      .send()
    assert.equal(res.status, 403)
  })

  it('works as route-level middleware', async () => {
    const mw = auth({ verify: () => ({ sub: 'u1' }) })
    const res = await testApp()
      .get('/admin', mw, (req, ctx) => Response.json({ user: ctx.user }))
      .getReq('/admin')
      .header('Authorization', 'Bearer token')
      .send()
    assert.equal(res.status, 200)
    const data = await res.json() as Record<string, unknown>
    assert.deepEqual(data.user, { sub: 'u1' })
  })

  it('route-level auth rejects without token', async () => {
    const mw = auth({ verify: () => ({ sub: 'u1' }) })
    const res = await testApp()
      .get('/admin', mw, (req, ctx) => Response.json({ user: ctx.user }))
      .getReq('/admin')
      .send()
    assert.equal(res.status, 401)
  })

  // ── Proxy mode ──────────────────────────────────────────────────────────

  it('proxy: 2xx response passes auth', async () => {
    const proxy = serve(() => new Response(JSON.stringify({ sub: 'u1' }), {
      headers: { 'content-type': 'application/json' },
    }), { port: 0 })
    await proxy.ready
    const proxyUrl = `http://localhost:${proxy.port}/validate`

    const res = await testApp()
      .get('/data', auth({ proxy: proxyUrl }), authHandler())
      .getReq('/data')
      .header('Authorization', 'Bearer valid')
      .send()
    assert.equal(res.status, 200)
    const data = await res.json() as Record<string, unknown>
    assert.deepEqual(data.user, { sub: 'u1' })
    proxy.stop()
  })

  it('proxy: 4xx response rejects auth', async () => {
    const proxy = serve(() => new Response('Unauthorized', { status: 401 }), { port: 0 })
    await proxy.ready
    const proxyUrl = `http://localhost:${proxy.port}/validate`

    const res = await testApp()
      .get('/data', auth({ proxy: proxyUrl }), handler())
      .getReq('/data')
      .header('Authorization', 'Bearer bad')
      .send()
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

    await testApp()
      .get('/data', auth({ proxy: proxyUrl }), handler())
      .getReq('/data')
      .header('Authorization', 'Bearer mytoken')
      .send()
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

    await testApp()
      .get('/data', auth({ proxy: proxyUrl, header: 'X-API-Key' }), handler())
      .getReq('/data')
      .header('X-API-Key', 'my-key')
      .send()
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

    await testApp()
      .get('/data', auth({ proxy: proxyUrl }), handler())
      .getReq('/data?access_token=my-key')
      .send()
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
    const res = await testApp()
      .use(auth({ token: 'my-key' }))
      .get('/data', () => new Response('ok'))
      .getReq('/data?access_token=my-key')
      .send()
    assert.equal(res.status, 200)
  })

  it('accepts Authorization header without Bearer prefix', async () => {
    const res = await testApp()
      .use(auth({ token: 'my-key' }))
      .get('/data', () => new Response('ok'))
      .getReq('/data')
      .header('Authorization', 'my-key')
      .send()
    assert.equal(res.status, 200)
  })

  it('returns 500 for invalid proxy URL', async () => {
    const res = await testApp()
      .use(auth({ proxy: 'not-a-valid-url' }))
      .get('/data', () => new Response('ok'))
      .getReq('/data')
      .header('Authorization', 'Bearer token')
      .send()
    assert.equal(res.status, 500)
  })
})

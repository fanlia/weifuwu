import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { testApp, serve } from '../index.ts'
import { user } from '../user/client.ts'

function handler(text = 'ok') {
  return () => new Response(text)
}

function userHandler() {
  return (req: Request, ctx: { user?: unknown }) =>
    Response.json({ user: ctx.user })
}

// ── Static token auth ────────────────────────────────────────────────────────

describe('user() — static tokens', () => {
  it('rejects missing Authorization header with 401', async () => {
    const res = await testApp()
      .use(user({ tokens: ['secret'] }).middleware())
      .get('/data', handler())
      .getReq('/data')
      .send()
    assert.equal(res.status, 401)
  })

  it('sets WWW-Authenticate header on 401', async () => {
    const res = await testApp()
      .use(user({ tokens: ['secret'] }).middleware())
      .get('/data', handler())
      .getReq('/data')
      .send()
    assert.equal(res.headers.get('WWW-Authenticate'), 'Bearer')
  })

  it('accepts valid Bearer token', async () => {
    const res = await testApp()
      .use(user({ tokens: ['secret'] }).middleware())
      .get('/data', handler())
      .getReq('/data')
      .header('Authorization', 'Bearer secret')
      .send()
    assert.equal(res.status, 200)
  })

  it('rejects invalid token with 401', async () => {
    const res = await testApp()
      .use(user({ tokens: ['secret'] }).middleware())
      .get('/data', handler())
      .getReq('/data')
      .header('Authorization', 'Bearer wrong')
      .send()
    assert.equal(res.status, 401)
  })

  it('supports multiple tokens', async () => {
    const app = testApp()
      .use(user({ tokens: ['key1', 'key2', 'key3'] }).middleware())
      .get('/data', handler())

    const res1 = await app.getReq('/data').header('Authorization', 'Bearer key1').send()
    assert.equal(res1.status, 200)

    const res2 = await app.getReq('/data').header('Authorization', 'Bearer key3').send()
    assert.equal(res2.status, 200)

    const res3 = await app.getReq('/data').header('Authorization', 'Bearer unknown').send()
    assert.equal(res3.status, 401)
  })

  it('supports custom header name (X-API-Key)', async () => {
    const app = testApp()
      .use(user({ tokens: ['my-key'], header: 'X-API-Key' }).middleware())
      .get('/data', handler())

    const res1 = await app.getReq('/data').header('X-API-Key', 'my-key').send()
    assert.equal(res1.status, 200)

    const res2 = await app.getReq('/data').header('X-API-Key', 'wrong').send()
    assert.equal(res2.status, 401)
  })

  it('does not set WWW-Authenticate for custom header', async () => {
    const res = await testApp()
      .use(user({ tokens: ['my-key'], header: 'X-API-Key' }).middleware())
      .get('/data', handler())
      .getReq('/data')
      .send()
    assert.equal(res.headers.get('WWW-Authenticate'), null)
  })

  it('accepts Authorization header without Bearer prefix', async () => {
    const res = await testApp()
      .use(user({ tokens: ['my-key'] }).middleware())
      .get('/data', () => new Response('ok'))
      .getReq('/data')
      .header('Authorization', 'my-key')
      .send()
    assert.equal(res.status, 200)
  })

  it('accepts access_token query param', async () => {
    const res = await testApp()
      .use(user({ tokens: ['my-key'] }).middleware())
      .get('/data', () => new Response('ok'))
      .getReq('/data?access_token=my-key')
      .send()
    assert.equal(res.status, 200)
  })
})

// ── Custom verify ────────────────────────────────────────────────────────────

describe('user() — custom verify', () => {
  it('verify returning truthy passes', async () => {
    const res = await testApp()
      .use(user({ verify: () => true }).middleware())
      .get('/data', handler())
      .getReq('/data')
      .header('Authorization', 'Bearer any')
      .send()
    assert.equal(res.status, 200)
  })

  it('verify returning falsy rejects with 401', async () => {
    const res = await testApp()
      .use(user({ verify: () => false }).middleware())
      .get('/data', handler())
      .getReq('/data')
      .header('Authorization', 'Bearer any')
      .send()
    assert.equal(res.status, 401)
  })

  it('verify returning object sets ctx.user', async () => {
    const res = await testApp()
      .use(user({ verify: () => ({ sub: 'user-1', role: 'admin' }) }).middleware())
      .get('/admin', userHandler())
      .getReq('/admin')
      .header('Authorization', 'Bearer token')
      .send()
    const data = await res.json() as Record<string, unknown>
    assert.deepEqual(data.user, { sub: 'user-1', role: 'admin' })
  })

  it('verify returning null rejects with 401', async () => {
    const res = await testApp()
      .use(user({ verify: () => null }).middleware())
      .get('/data', handler())
      .getReq('/data')
      .header('Authorization', 'Bearer any')
      .send()
    assert.equal(res.status, 401)
  })

  it('works as route-level middleware', async () => {
    const mw = user({ verify: () => ({ sub: 'u1' }) }).middleware()
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
    const mw = user({ verify: () => ({ sub: 'u1' }) }).middleware()
    const res = await testApp()
      .get('/admin', mw, (req, ctx) => Response.json({ user: ctx.user }))
      .getReq('/admin')
      .send()
    assert.equal(res.status, 401)
  })
})

// ── Proxy mode ──────────────────────────────────────────────────────────────

describe('user() — proxy auth', () => {
  it('2xx response passes auth', async () => {
    const proxy = serve(() => new Response(JSON.stringify({ sub: 'u1' }), {
      headers: { 'content-type': 'application/json' },
    }), { port: 0 })
    await proxy.ready
    const proxyUrl = `http://localhost:${proxy.port}/validate`

    const res = await testApp()
      .get('/data', user({ proxy: proxyUrl }).middleware(), userHandler())
      .getReq('/data')
      .header('Authorization', 'Bearer valid')
      .send()
    assert.equal(res.status, 200)
    const data = await res.json() as Record<string, unknown>
    assert.deepEqual(data.user, { sub: 'u1' })
    proxy.stop()
  })

  it('4xx response rejects auth', async () => {
    const proxy = serve(() => new Response('Unauthorized', { status: 401 }), { port: 0 })
    await proxy.ready
    const proxyUrl = `http://localhost:${proxy.port}/validate`

    const res = await testApp()
      .get('/data', user({ proxy: proxyUrl }).middleware(), handler())
      .getReq('/data')
      .header('Authorization', 'Bearer bad')
      .send()
    assert.equal(res.status, 401)
    proxy.stop()
  })

  it('forwards Authorization header', async () => {
    let receivedAuth: string | null = null
    const proxy = serve((req) => {
      receivedAuth = req.headers.get('Authorization')
      return new Response('ok')
    }, { port: 0 })
    await proxy.ready
    const proxyUrl = `http://localhost:${proxy.port}/validate`

    await testApp()
      .get('/data', user({ proxy: proxyUrl }).middleware(), handler())
      .getReq('/data')
      .header('Authorization', 'Bearer mytoken')
      .send()
    assert.equal(receivedAuth, 'Bearer mytoken')
    proxy.stop()
  })
})

// ── Session-based auth ──────────────────────────────────────────────────────

describe('user() — session auth', () => {
  it('authenticates via ctx.session.userId (no DB)', async () => {
    const app = testApp()
      .use((req, ctx: any, next) => {
        ctx.session = { userId: 1 }; return next(req, ctx)
      })
      .use(user({}).middleware())
      .get('/me', (req, ctx: any) => Response.json(ctx.user))

    const res = await app.getReq('/me').send()
    assert.equal(res.status, 200)
    const body = await res.json() as any
    assert.equal(body.id, 1)
  })

  it('authenticates via session with resolveUser', async () => {
    const userDb = new Map<number, unknown>()
    userDb.set(1, { id: 1, email: 'alice@test.com', role: 'admin' })

    const app = testApp()
      .use((req, ctx: any, next) => {
        ctx.session = { userId: 1 }; return next(req, ctx)
      })
      .use(user({
        resolveUser: (userId: any) => userDb.get(userId) ?? null,
      }).middleware())
      .get('/me', (req, ctx: any) => Response.json(ctx.user))

    const res = await app.getReq('/me').send()
    assert.equal(res.status, 200)
    const body = await res.json() as any
    assert.equal(body.id, 1)
    assert.equal(body.email, 'alice@test.com')
  })

  it('rejects when resolveUser returns null and destroys session', async () => {
    let destroyed = false

    const app = testApp()
      .use((req, ctx: any, next) => {
        ctx.session = {
          userId: 999,
          destroy: () => { destroyed = true },
        }
        return next(req, ctx)
      })
      .use(user({
        resolveUser: () => null,
      }).middleware())
      .get('/me', (req, ctx: any) => Response.json(ctx.user))

    const res = await app.getReq('/me').send()
    assert.equal(res.status, 401)
    assert.equal(destroyed, true, 'stale session must be destroyed')
  })

  it('session takes priority over header when both present', async () => {
    const app = testApp()
      .use((req, ctx: any, next) => {
        ctx.session = { userId: 1 }; return next(req, ctx)
      })
      .use(user({ tokens: ['wrong-token'] }).middleware())
      .get('/me', (req, ctx: any) => Response.json(ctx.user))

    const res = await app.getReq('/me')
      .header('Authorization', 'Bearer wrong-token')
      .send()
    assert.equal(res.status, 200, 'session auth takes priority')
    const body = await res.json() as any
    assert.equal(body.id, 1)
  })

  it('returns 401 when no session and no token', async () => {
    const app = testApp()
      .use(user({ tokens: ['secret'] }).middleware())
      .get('/data', () => new Response('ok'))

    const res = await app.getReq('/data').send()
    assert.equal(res.status, 401)
  })
})

// ── middlewareOptional ──────────────────────────────────────────────────────

describe('user() — middlewareOptional', () => {
  it('does not block when no token is present', async () => {
    const res = await testApp()
      .use(user({ tokens: ['secret'] }).middlewareOptional())
      .get('/public', handler())
      .getReq('/public')
      .send()
    assert.equal(res.status, 200)
  })

  it('sets ctx.user when valid token is present', async () => {
    const app = testApp()
      .use(user({ tokens: ['secret'] }).middlewareOptional())
      .get('/me', (req, ctx: any) => Response.json({ user: ctx.user ?? null }))

    const res = await app.getReq('/me')
      .header('Authorization', 'Bearer secret')
      .send()
    assert.equal(res.status, 200)
    const body = await res.json() as any
    assert.ok(body.user, 'ctx.user should be set')
  })

  it('ignores invalid token (non-blocking)', async () => {
    const app = testApp()
      .use(user({ tokens: ['secret'] }).middlewareOptional())
      .get('/me', (req, ctx: any) => Response.json({ user: ctx.user ?? null }))

    const res = await app.getReq('/me')
      .header('Authorization', 'Bearer wrong')
      .send()
    assert.equal(res.status, 200)
    const body = await res.json() as any
    assert.equal(body.user, null)
  })
})

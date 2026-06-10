import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { WebSocket } from 'ws'
import { Router, serve, type Handler, type Context } from '../index.ts'

function mkCtx(ctx?: Partial<Context>): Context {
  return { params: {}, query: {}, ...ctx } as Context
}

function wsEcho(prefix = 'echo:') {
  return { message(ws: WebSocket, _ctx: Context, data: string | Buffer) { ws.send(`${prefix}${data}`) } }
}

function suppressErrorLog() {
  const orig = console.error
  console.error = () => {}
  return () => { console.error = orig }
}

// ── Route Registration ─────────────────────────────────────────────────────

describe('Router registration', () => {
  it('GET route', async () => {
    const r = new Router().get('/hello', () => new Response('world'))
    const res = await r.handler()(new Request('http://localhost/hello'), mkCtx())
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'world')
  })

  it('POST route', async () => {
    const r = new Router().post('/data', async (req) => new Response(await req.text(), { status: 201 }))
    const res = await r.handler()(new Request('http://localhost/data', { method: 'POST', body: 'hello' }), mkCtx())
    assert.equal(res.status, 201)
    assert.equal(await res.text(), 'hello')
  })

  it('PUT route', async () => {
    const r = new Router().put('/item', () => new Response('updated', { status: 200 }))
    const res = await r.handler()(new Request('http://localhost/item', { method: 'PUT', body: 'x' }), mkCtx())
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'updated')
  })

  it('PATCH route', async () => {
    const r = new Router().patch('/item', () => new Response('patched'))
    const res = await r.handler()(new Request('http://localhost/item', { method: 'PATCH' }), mkCtx())
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'patched')
  })

  it('DELETE route', async () => {
    const r = new Router().delete('/item', () => new Response(null, { status: 204 }))
    const res = await r.handler()(new Request('http://localhost/item', { method: 'DELETE' }), mkCtx())
    assert.equal(res.status, 204)
  })

  it('HEAD route', async () => {
    const r = new Router().head('/x', () => new Response('ok', { headers: { 'x-custom': 'v' } }))
    const res = await r.handler()(new Request('http://localhost/x', { method: 'HEAD' }), mkCtx())
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('x-custom'), 'v')
  })

  it('OPTIONS route', async () => {
    const r = new Router().options('/x', () => new Response('ok'))
    const res = await r.handler()(new Request('http://localhost/x', { method: 'OPTIONS' }), mkCtx())
    assert.equal(res.status, 200)
  })

  it('all() matches every HTTP method', async () => {
    const r = new Router().all('/any', () => new Response('ok'))
    const h = r.handler()
    for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']) {
      const res = await h(new Request('http://localhost/any', { method }), mkCtx())
      assert.equal(res.status, 200, `method ${method} should match`)
    }
  })

  it('all() with wildcard matches any method and path', async () => {
    const r = new Router().all('/*', (req, ctx) => Response.json({ method: req.method, wildcard: ctx.params['*'] }))
    const res = await r.handler()(new Request('http://localhost/foo/bar', { method: 'PUT' }), mkCtx())
    const data = await res.json() as any
    assert.equal(data.method, 'PUT')
    assert.equal(data.wildcard, 'foo/bar')
  })

  it('multiple methods on same path', async () => {
    const r = new Router()
      .get('/resource', () => Response.json({ method: 'GET' }))
      .post('/resource', () => Response.json({ method: 'POST' }))
      .put('/resource', () => Response.json({ method: 'PUT' }))
      .delete('/resource', () => Response.json({ method: 'DELETE' }))

    const h = r.handler()
    for (const method of ['GET', 'POST', 'PUT', 'DELETE'] as const) {
      const res = await h(new Request('http://localhost/resource', { method }), mkCtx())
      const data = await res.json() as Record<string, string>
      assert.equal(data.method, method)
    }
  })
})

// ── Path Matching ──────────────────────────────────────────────────────────

describe('Router path matching', () => {
  it('root path / matches', async () => {
    const r = new Router().get('/', () => new Response('root'))
    const res = await r.handler()(new Request('http://localhost/'), mkCtx())
    assert.equal(await res.text(), 'root')
  })

  it('provides ctx.params from :param segments', async () => {
    const r = new Router().get('/users/:id', (req, ctx) => Response.json({ id: ctx.params.id }))
    const res = await r.handler()(new Request('http://localhost/users/42'), mkCtx())
    const data = await res.json() as Record<string, string>
    assert.equal(data.id, '42')
  })

  it('multiple params', async () => {
    const r = new Router().get('/:a/:b', (req, ctx) => Response.json({ a: ctx.params.a, b: ctx.params.b }))
    const res = await r.handler()(new Request('http://localhost/foo/bar'), mkCtx())
    const data = await res.json() as Record<string, string>
    assert.equal(data.a, 'foo')
    assert.equal(data.b, 'bar')
  })

  it('static route wins over param route', async () => {
    const r = new Router()
      .get('/users/me', () => new Response('me'))
      .get('/users/:id', (req, ctx) => new Response(ctx.params.id))
    assert.equal(await (await r.handler()(new Request('http://localhost/users/me'), mkCtx())).text(), 'me')
    assert.equal(await (await r.handler()(new Request('http://localhost/users/42'), mkCtx())).text(), '42')
  })

  it('wildcard * matches remaining path', async () => {
    const r = new Router().all('/api/*', (req, ctx) => Response.json({ wildcard: ctx.params['*'] }))
    const res = await r.handler()(new Request('http://localhost/api/foo/bar'), mkCtx())
    const data = await res.json() as Record<string, string>
    assert.equal(data.wildcard, 'foo/bar')
  })

  it('wildcard at root matches everything', async () => {
    const r = new Router().all('/*', (req, ctx) => Response.json({ path: ctx.params['*'] }))
    const res = await r.handler()(new Request('http://localhost/any/deep/path'), mkCtx())
    const data = await res.json() as Record<string, string>
    assert.equal(data.path, 'any/deep/path')
  })

  it('wildcard at leaf matches empty suffix', async () => {
    const r = new Router().get('/prefix/*', (req, ctx) => Response.json({ rest: ctx.params['*'] }))
    const res = await r.handler()(new Request('http://localhost/prefix'), mkCtx())
    const data = await res.json() as Record<string, string>
    assert.equal(data.rest, '')
  })

  it('wildcard route with route-level middlewares', async () => {
    const seen: string[] = []
    const r = new Router().get('/files/*',
      (_req, _ctx, next) => { seen.push('mw'); return next(_req, _ctx) },
      (req, ctx) => { seen.push(ctx.params['*']); return Response.json(seen) },
    )
    const res = await r.handler()(new Request('http://localhost/files/path/to/file'), mkCtx())
    const data = await res.json() as string[]
    assert.deepEqual(data, ['mw', 'path/to/file'])
  })

  it('wildcard with trailing segments warns but works', async () => {
    const warnings: string[] = []
    const orig = console.warn
    console.warn = (m: string) => { warnings.push(m) }
    const r = new Router().get('/api/*/extra', () => new Response('ok'))
    assert.ok(warnings.some(w => w.includes('ignored')), 'should warn about segments after *')
    const res = await r.handler()(new Request('http://localhost/api/foo'), mkCtx())
    assert.equal(res.status, 200)
    console.warn = orig
  })

  it('trailing slash matches same route as non-trailing slash', async () => {
    const r = new Router()
      .get('/items', () => new Response('items'))
    const noSlash = await r.handler()(new Request('http://localhost/items'), mkCtx())
    const withSlash = await r.handler()(new Request('http://localhost/items/'), mkCtx())
    assert.equal(await noSlash.text(), 'items')
    assert.equal(await withSlash.text(), 'items', 'trailing slash should match the same route')
  })

  it('same param name on same path position works', async () => {
    const r = new Router()
      .get('/:id', () => new Response('a'))
      .get('/:id/profile', () => new Response('b'))
    assert.equal(await (await r.handler()(new Request('http://localhost/foo'), mkCtx())).text(), 'a')
    assert.equal(await (await r.handler()(new Request('http://localhost/foo/profile'), mkCtx())).text(), 'b')
  })

  it('different param names on same path position throw', () => {
    const r = new Router()
    r.get('/:id', () => new Response('ok'))
    assert.throws(() => r.get('/:slug', () => new Response('ng')), /Param name conflict/)
  })

  it('WS param name conflict throws', () => {
    const r = new Router()
    r.ws('/chat/:room', { message() {} })
    assert.throws(() => r.ws('/chat/:channel', { message() {} }), /Param name conflict/)
  })

  it('encoded path segments are matched as-is', async () => {
    const r = new Router().get('/search/:query', (req, ctx) => new Response(ctx.params.query))
    const res = await r.handler()(new Request('http://localhost/search/hello%20world'), mkCtx())
    assert.equal(await res.text(), 'hello%20world')
  })

  it('matches prefixed param paths correctly', async () => {
    const r = new Router()
      .get('/api/v1/users/:id', (req, ctx) => new Response(ctx.params.id))
      .get('/api/v2/users/:id', (req, ctx) => new Response(`v2:${ctx.params.id}`))
    assert.equal(await (await r.handler()(new Request('http://localhost/api/v1/users/1'), mkCtx())).text(), '1')
    assert.equal(await (await r.handler()(new Request('http://localhost/api/v2/users/1'), mkCtx())).text(), 'v2:1')
  })
})

// ── 404 / 405 ─────────────────────────────────────────────────────────────

describe('Router status codes', () => {
  it('returns 404 for unmatched route', async () => {
    const r = new Router().get('/exists', () => new Response('ok'))
    const res = await r.handler()(new Request('http://localhost/nonexistent'), mkCtx())
    assert.equal(res.status, 404)
  })

  it('returns 405 when path matches but method does not', async () => {
    const r = new Router()
      .get('/items', () => new Response('ok'))
      .post('/items', () => new Response('ok'))
    const res = await r.handler()(new Request('http://localhost/items', { method: 'DELETE' }), mkCtx())
    assert.equal(res.status, 405)
  })

  it('405 includes Allow header listing available methods', async () => {
    const r = new Router()
      .get('/items', () => new Response('ok'))
      .post('/items', () => new Response('created'))
    const res = await r.handler()(new Request('http://localhost/items', { method: 'PATCH' }), mkCtx())
    assert.equal(res.status, 405)
    const allow = res.headers.get('Allow') ?? ''
    assert.ok(allow.includes('GET'), 'Allow should include GET')
    assert.ok(allow.includes('POST'), 'Allow should include POST')
  })

  it('405 runs global middlewares before responding', async () => {
    let mwRan = false
    const r = new Router()
      .use((_req, _ctx, next) => { mwRan = true; return next(_req, _ctx) })
      .get('/items', () => new Response('ok'))
    const res = await r.handler()(new Request('http://localhost/items', { method: 'DELETE' }), mkCtx())
    assert.equal(res.status, 405)
    assert.equal(mwRan, true, 'global middleware should run before 405')
  })

  it('global middleware can override 405 response', async () => {
    const r = new Router()
      .use((_req, _ctx, next) => {
        return new Response('handled', { status: 200 })
      })
      .get('/items', () => new Response('ok'))
    const res = await r.handler()(new Request('http://localhost/items', { method: 'DELETE' }), mkCtx())
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'handled')
  })

  it('404 runs global middlewares before fallback', async () => {
    let mwRan = false
    const r = new Router()
      .use((_req, _ctx, next) => { mwRan = true; return next(_req, _ctx) })
      .get('/exists', () => new Response('ok'))
    const res = await r.handler()(new Request('http://localhost/nope'), mkCtx())
    assert.equal(res.status, 404)
    assert.equal(mwRan, true, 'global middleware should run even for 404')
  })

  it('global middleware can override 404 response', async () => {
    const r = new Router()
      .use((_req, _ctx, _next) => new Response('caught', { status: 200 }))
      .get('/only', () => new Response('ok'))
    const res = await r.handler()(new Request('http://localhost/nowhere'), mkCtx())
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'caught')
  })

  it('error handler catches error in 405 globalMws chain', async () => {
    const r = new Router()
      .onError((err) => new Response(`e:${err.message}`, { status: 500 }))
      .use(() => { throw new Error('mw-405') })
      .get('/items', () => new Response('ok'))

    const restore = suppressErrorLog()
    const res = await r.handler()(new Request('http://localhost/items', { method: 'DELETE' }), mkCtx())
    assert.equal(res.status, 500)
    assert.equal(await res.text(), 'e:mw-405')
    restore()
  })
})

// ── Middleware ─────────────────────────────────────────────────────────────

describe('Router middleware', () => {
  it('order: global → path → route', async () => {
    const order: number[] = []
    const r = new Router()
      .use((_req, _ctx, next) => { order.push(1); return next(_req, _ctx) })
      .use('/scoped', (_req, _ctx, next) => { order.push(2); return next(_req, _ctx) })
      .get('/scoped/route',
        (_req, _ctx, next) => { order.push(3); return next(_req, _ctx) },
        () => { order.push(4); return Response.json(order) },
      )
    await r.handler()(new Request('http://localhost/scoped/route'), mkCtx())
    assert.deepEqual(order, [1, 2, 3, 4])
  })

  it('global middleware short-circuits', async () => {
    const r = new Router()
      .use(() => new Response('blocked', { status: 403 }))
      .get('/blocked', () => new Response('should not reach'))
    const res = await r.handler()(new Request('http://localhost/blocked'), mkCtx())
    assert.equal(res.status, 403)
    assert.equal(await res.text(), 'blocked')
  })

  it('middleware modifies response after next', async () => {
    const r = new Router()
      .use(async (_req, _ctx, next) => {
        const res = await next(_req, _ctx)
        const body = await res.json() as Record<string, unknown>
        body.modified = true
        return Response.json(body)
      })
      .get('/modify', () => Response.json({ original: true }))
    const res = await r.handler()(new Request('http://localhost/modify'), mkCtx())
    const data = await res.json() as Record<string, unknown>
    assert.equal(data.original, true)
    assert.equal(data.modified, true)
  })

  it('route-level middleware runs before handler', async () => {
    let mwRan = false
    const r = new Router().get('/x',
      (_req, _ctx, next) => { mwRan = true; return next(_req, _ctx) },
      () => new Response(mwRan ? 'mw-ran' : 'no-mw'),
    )
    const res = await r.handler()(new Request('http://localhost/x'), mkCtx())
    assert.equal(await res.text(), 'mw-ran')
  })

  it('multiple route-level middlewares execute in order', async () => {
    const vals: string[] = []
    const r = new Router().get('/x',
      (_req, _ctx, next) => { vals.push('a'); return next(_req, _ctx) },
      (_req, _ctx, next) => { vals.push('b'); return next(_req, _ctx) },
      () => { vals.push('c'); return Response.json(vals) },
    )
    const res = await r.handler()(new Request('http://localhost/x'), mkCtx())
    const data = await res.json() as string[]
    assert.deepEqual(data, ['a', 'b', 'c'])
  })
})

// ── Error Handling ─────────────────────────────────────────────────────────

describe('Router error handling', () => {
  it('onError catches handler exceptions', async () => {
    const r = new Router()
      .onError((err) => Response.json({ error: err.message }, { status: 500 }))
      .get('/crash', () => { throw new Error('oops') })
    const res = await r.handler()(new Request('http://localhost/crash'), mkCtx())
    assert.equal(res.status, 500)
    const data = await res.json() as Record<string, string>
    assert.equal(data.error, 'oops')
  })

  it('error handler receives non-Error throws as wrapped Error', async () => {
    let caughtMessage = ''
    const r = new Router()
      .onError((err) => {
        caughtMessage = err.message
        return new Response('handled', { status: 500 })
      })
      .get('/crash', () => { throw 'string error' })
    await r.handler()(new Request('http://localhost/crash'), mkCtx())
    assert.equal(caughtMessage, 'string error')
  })

  it('no error handler returns 500 for thrown errors', async () => {
    const restore = suppressErrorLog()
    const r = new Router().get('/crash', () => { throw new Error('boom') })
    const res = await r.handler()(new Request('http://localhost/crash'), mkCtx())
    assert.equal(res.status, 500)
    assert.equal(await res.text(), 'Internal Server Error')
    restore()
  })

  it('error handler catches errors from global middleware', async () => {
    const r = new Router()
      .onError((err) => new Response(`mw-error: ${err.message}`, { status: 500 }))
      .use(() => { throw new Error('mw-boom') })
      .get('/data', () => new Response('ok'))

    const restore = suppressErrorLog()
    const res = await r.handler()(new Request('http://localhost/data'), mkCtx())
    assert.equal(res.status, 500)
    assert.equal(await res.text(), 'mw-error: mw-boom')
    restore()
  })

  it('error handler catches errors from global middleware during 404', async () => {
    const r = new Router()
      .onError((err) => new Response(`e:${err.message}`, { status: 500 }))
      .use(() => { throw new Error('no-route') })

    const restore = suppressErrorLog()
    const res = await r.handler()(new Request('http://localhost/nope'), mkCtx())
    assert.equal(res.status, 500)
    assert.equal(await res.text(), 'e:no-route')
    restore()
  })

  it('error handler catches errors from path-scoped middleware', async () => {
    const r = new Router()
      .onError((err) => new Response(`path-err: ${err.message}`, { status: 500 }))
      .use('/scoped', () => { throw new Error('scoped-fail') })
      .get('/scoped/route', () => new Response('ok'))

    const restore = suppressErrorLog()
    const res = await r.handler()(new Request('http://localhost/scoped/route'), mkCtx())
    assert.equal(res.status, 500)
    assert.equal(await res.text(), 'path-err: scoped-fail')
    restore()
  })
})

// ── Sub-router ─────────────────────────────────────────────────────────────

describe('Router sub-router', () => {
  it('mounts sub-router at path prefix', async () => {
    const sub = new Router().get('/nested', () => new Response('sub'))
    const main = new Router().use('/api', sub)
    const res = await main.handler()(new Request('http://localhost/api/nested'), mkCtx())
    assert.equal(await res.text(), 'sub')
  })

  it('mounts sub-router at root without path', async () => {
    const sub = new Router().get('/rooted', () => new Response('sub-root'))
    const main = new Router().use('/', sub)
    const res = await main.handler()(new Request('http://localhost/rooted'), mkCtx())
    assert.equal(await res.text(), 'sub-root')
  })

  it('preserves params across mount boundary', async () => {
    const sub = new Router().get('/:userId', (req, ctx) => Response.json({ userId: ctx.params.userId }))
    const main = new Router().use('/orgs/:orgId', sub)
    const res = await main.handler()(new Request('http://localhost/orgs/acme/john'), mkCtx())
    const data = await res.json() as Record<string, string>
    assert.equal(data.userId, 'john')
  })

  it('sub-router global middleware is applied to its routes', async () => {
    let called = false
    const sub = new Router()
      .use((_req, _ctx, next) => { called = true; return next(_req, _ctx) })
      .get('/data', () => new Response('ok'))
    const main = new Router().use('/api', sub)
    await main.handler()(new Request('http://localhost/api/data'), mkCtx())
    assert.equal(called, true)
  })

  it('sub-router global middleware does NOT leak to parent routes', async () => {
    let subMwCalled = false
    const sub = new Router()
      .use((_req, _ctx, next) => { subMwCalled = true; return next(_req, _ctx) })
      .get('/dashboard', () => new Response('dash'))

    const main = new Router()
      .use('/admin', sub)
      .get('/login', () => new Response('login'))

    const h = main.handler()

    subMwCalled = false
    const loginRes = await h(new Request('http://localhost/login'), mkCtx())
    assert.equal(loginRes.status, 200)
    assert.equal(await loginRes.text(), 'login')
    assert.equal(subMwCalled, false, 'sub-router middleware must NOT run on parent /login route')

    subMwCalled = false
    const adminRes = await h(new Request('http://localhost/admin/dashboard'), mkCtx())
    assert.equal(adminRes.status, 200)
    assert.equal(await adminRes.text(), 'dash')
    assert.equal(subMwCalled, true, 'sub-router middleware SHOULD run on /admin/dashboard route')
  })

  it('sub-router middleware isolation: auth does not block parent public routes', async () => {
    const admin = new Router()
      .use(() => new Response('unauthorized', { status: 401 }))
      .get('/dashboard', () => new Response('dash'))

    const main = new Router()
      .use('/admin', admin)
      .get('/public', () => new Response('public'))

    const h = main.handler()

    const publicRes = await h(new Request('http://localhost/public'), mkCtx())
    assert.equal(publicRes.status, 200)
    assert.equal(await publicRes.text(), 'public')

    const adminRes = await h(new Request('http://localhost/admin/dashboard'), mkCtx())
    assert.equal(adminRes.status, 401)
  })

  it('sub-router global middleware runs exactly once on matching routes', async () => {
    let count = 0
    const sub = new Router()
      .use((_req, _ctx, next) => { count++; return next(_req, _ctx) })
      .get('/x', () => new Response('ok'))
    const main = new Router().use('/api', sub)
    await main.handler()(new Request('http://localhost/api/x'), mkCtx())
    assert.equal(count, 1, 'sub-router global middleware should run exactly once')
  })

  it('multiple routers at same path prefix', async () => {
    const a = new Router().get('/a', () => new Response('mod-a'))
    const b = new Router().get('/b', () => new Response('mod-b'))
    const main = new Router().use('/mod', a).use('/mod', b)
    assert.equal(await (await main.handler()(new Request('http://localhost/mod/a'), mkCtx())).text(), 'mod-a')
    assert.equal(await (await main.handler()(new Request('http://localhost/mod/b'), mkCtx())).text(), 'mod-b')
  })

  it('route-level path middleware on sub-router parent', async () => {
    let mwCalled = false
    const sub = new Router().get('/data', () => new Response('ok'))
    const main = new Router()
      .use('/api', (req, ctx, next) => {
        mwCalled = true
        return next(req, ctx)
      })
      .use('/api', sub)

    const res = await main.handler()(new Request('http://localhost/api/data'), mkCtx())
    assert.equal(res.status, 200)
    assert.equal(mwCalled, true)
  })

  it('accumulates mountPath across nested sub-routers', async () => {
    let capturedMountPath = ''
    const leaf = new Router().get('/action', (req, ctx) => {
      capturedMountPath = ctx.mountPath ?? ''
      return new Response('ok')
    })
    const middle = new Router().use('/middle', leaf)
    const root = new Router().use('/root', middle)

    await root.handler()(new Request('http://localhost/root/middle/action'), mkCtx())
    assert.equal(capturedMountPath, '/root/middle')
  })

  it('route() with middlewares before sub-router', async () => {
    let mwCalled = false
    const sub = new Router().get('/item', () => new Response('sub-item'))
    const main = new Router().get('/api/item',
      (_req, _ctx, next) => { mwCalled = true; return next(_req, _ctx) },
      sub,
    )
    const res = await main.handler()(new Request('http://localhost/api/item/item'), mkCtx())
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'sub-item')
    assert.equal(mwCalled, true, 'middleware before Router in route() must run')
  })

  it('route() with middlewares before sub-router preserves sub middlewares', async () => {
    let subMwCalled = false
    const sub = new Router()
      .use((_req, _ctx, next) => { subMwCalled = true; return next(_req, _ctx) })
      .get('/item', () => new Response('ok'))
    const main = new Router().get('/api/item', sub)
    const res = await main.handler()(new Request('http://localhost/api/item/item'), mkCtx())
    assert.equal(res.status, 200)
    assert.equal(subMwCalled, true, 'sub-router global middleware must run')
  })

  it('nested sub-routers with middleware isolation', async () => {
    const leafMw: boolean[] = []
    const leaf = new Router()
      .use((_req, _ctx, next) => { leafMw.push(true); return next(_req, _ctx) })
      .get('/end', () => new Response('leaf'))

    const midMw: boolean[] = []
    const mid = new Router()
      .use((_req, _ctx, next) => { midMw.push(true); return next(_req, _ctx) })
      .use('/leaf', leaf)
      .get('/mid-route', () => new Response('mid'))

    const main = new Router()
      .use('/a', mid)
      .get('/public', () => new Response('public'))

    const h = main.handler()

    const pubRes = await h(new Request('http://localhost/public'), mkCtx())
    assert.equal(await pubRes.text(), 'public')
    assert.equal(leafMw.length, 0)
    assert.equal(midMw.length, 0)

    const leafRes = await h(new Request('http://localhost/a/leaf/end'), mkCtx())
    assert.equal(await leafRes.text(), 'leaf')
    assert.equal(midMw.length, 1, 'mid middleware should run once')
    assert.equal(leafMw.length, 1, 'leaf middleware should run once')

    const midRes = await h(new Request('http://localhost/a/mid-route'), mkCtx())
    assert.equal(await midRes.text(), 'mid')
  })
})

// ── WebSocket ──────────────────────────────────────────────────────────────

describe('Router.ws', () => {
  it('echos messages', async () => {
    const router = new Router().ws('/echo', wsEcho('echo:'))
    const server = serve(router.handler(), { port: 0, websocket: router.websocketHandler() })
    await server.ready

    const ws = new WebSocket(`ws://localhost:${server.port}/echo`)
    const msg = await new Promise<string>((resolve, reject) => {
      ws.onopen = () => ws.send('hello')
      ws.on('message', (data) => resolve(data.toString()))
      ws.on('error', reject)
      setTimeout(() => reject(new Error('timeout')), 3000)
    })
    assert.equal(msg, 'echo:hello')
    ws.close()
    server.stop()
  })

  it('passes params from URL', async () => {
    const router = new Router().ws('/chat/:room', { open(ws, ctx) { ws.send(ctx.params.room!) } })
    const server = serve(router.handler(), { port: 0, websocket: router.websocketHandler() })
    await server.ready

    const ws = new WebSocket(`ws://localhost:${server.port}/chat/lobby`)
    const msg = await new Promise<string>((resolve, reject) => {
      ws.on('message', (data) => resolve(data.toString()))
      ws.on('error', reject)
      setTimeout(() => reject(new Error('timeout')), 3000)
    })
    assert.equal(msg, 'lobby')
    ws.close()
    server.stop()
  })

  it('middleware can reject upgrade', async () => {
    const router = new Router().ws('/secure',
      (req, _ctx, next) => {
        if (!req.headers.get('Authorization')) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        return next(req, _ctx)
      },
      { open(ws) { ws.send('authorized') } },
    )
    const server = serve(router.handler(), { port: 0, websocket: router.websocketHandler() })
    await server.ready

    const ws = new WebSocket(`ws://localhost:${server.port}/secure`)
    const error = await new Promise<string | null>((resolve) => {
      ws.on('error', () => resolve('error'))
      ws.on('open', () => resolve(null))
      ws.on('unexpected-response', () => resolve('unexpected-response'))
      setTimeout(() => resolve('timeout'), 3000)
    })
    assert.ok(error === 'unexpected-response' || error === 'error', `Expected rejection, got: ${error}`)
    server.stop()
  })

  it('wildcard matches sub-paths', async () => {
    const router = new Router().ws('/chat/*', { open(ws) { ws.send('wildcard') } })
    const server = serve(router.handler(), { port: 0, websocket: router.websocketHandler() })
    await server.ready

    const ws = new WebSocket(`ws://localhost:${server.port}/chat/room123`)
    const msg = await new Promise<string>((resolve, reject) => {
      ws.on('message', (data) => resolve(data.toString()))
      ws.on('error', reject)
      setTimeout(() => reject(new Error('timeout')), 3000)
    })
    assert.equal(msg, 'wildcard')
    ws.close()
    server.stop()
  })

  it('sub-router ws route works after merge', async () => {
    const sub = new Router().ws('/echo', wsEcho('sub:'))
    const main = new Router().use('/ws', sub)
    const server = serve(main.handler(), { port: 0, websocket: main.websocketHandler() })
    await server.ready
    const ws = new WebSocket(`ws://localhost:${server.port}/ws/echo`)
    const msg = await new Promise<string>((resolve) => {
      ws.onmessage = (e) => resolve(e.data as string)
      ws.onopen = () => ws.send('pong')
    })
    ws.close()
    server.stop()
    assert.equal(msg, 'sub:pong')
  })

  it('global middleware runs before WS upgrade', async () => {
    let mwRan = false
    const router = new Router()
      .use((_req, _ctx, next) => { mwRan = true; return next(_req, _ctx) })
      .ws('/chat', { open(ws) { ws.send(mwRan ? 'mw-ok' : 'no-mw') } })

    const server = serve(router.handler(), { port: 0, websocket: router.websocketHandler() })
    await server.ready

    const ws = new WebSocket(`ws://localhost:${server.port}/chat`)
    const msg = await new Promise<string>((resolve, reject) => {
      ws.on('message', (data) => resolve(data.toString()))
      ws.on('error', reject)
      setTimeout(() => reject(new Error('timeout')), 3000)
    })
    assert.equal(msg, 'mw-ok', 'global middleware should run before WS upgrade')
    ws.close()
    server.stop()
  })

  it('global middleware can reject WS upgrade', async () => {
    const router = new Router()
      .use(() => new Response(null, { status: 403 }))
      .ws('/chat', wsEcho())

    const server = serve(router.handler(), { port: 0, websocket: router.websocketHandler() })
    await server.ready

    const ws = new WebSocket(`ws://localhost:${server.port}/chat`)
    const result = await new Promise<string>((resolve) => {
      ws.on('unexpected-response', () => resolve('rejected'))
      ws.on('open', () => resolve('connected'))
      ws.on('error', () => resolve('error'))
      setTimeout(() => resolve('timeout'), 3000)
    })
    assert.equal(result, 'rejected', 'global middleware should block WS upgrade')
    server.stop()
  })

  it('ws sub-router preserves route-level middlewares', async () => {
    let mwRan = false
    const sub = new Router().ws('/chat',
      (_req, _ctx, next) => { mwRan = true; return next(_req, _ctx) },
      { open(ws) { ws.send(mwRan ? 'mw-ok' : 'no-mw') } },
    )
    const main = new Router().use('/sub', sub)
    const server = serve(main.handler(), { port: 0, websocket: main.websocketHandler() })
    await server.ready

    const ws = new WebSocket(`ws://localhost:${server.port}/sub/chat`)
    const msg = await new Promise<string>((resolve, reject) => {
      ws.on('message', (data) => resolve(data.toString()))
      ws.on('error', reject)
      setTimeout(() => reject(new Error('timeout')), 3000)
    })
    assert.equal(msg, 'mw-ok', 'ws sub-router route-level middleware must run')
    ws.close()
    server.stop()
  })

  it('ws() overwrites middlewares on re-registration', async () => {
    const router = new Router()
      .ws('/chat', () => new Response(null, { status: 403 }), wsEcho('auth:'))
      .ws('/chat', wsEcho('open:'))

    const server = serve(router.handler(), { port: 0, websocket: router.websocketHandler() })
    await server.ready

    const ws = new WebSocket(`ws://localhost:${server.port}/chat`)
    const msg = await new Promise<string>((resolve, reject) => {
      ws.on('open', () => ws.send('hello'))
      ws.on('message', (data) => resolve(data.toString()))
      ws.on('error', reject)
      setTimeout(() => reject(new Error('timeout')), 3000)
    })
    assert.equal(msg, 'open:hello')
    ws.close()
    server.stop()
  })

  it('ws() overwrites handler on re-registration', async () => {
    const router = new Router()
      .ws('/chat', { message(ws, _ctx, data: string) { ws.send(`old:${data}`) } })
      .ws('/chat', { message(ws, _ctx, data: string) { ws.send(`new:${data}`) } })

    const server = serve(router.handler(), { port: 0, websocket: router.websocketHandler() })
    await server.ready

    const ws = new WebSocket(`ws://localhost:${server.port}/chat`)
    const msg = await new Promise<string>((resolve, reject) => {
      ws.onopen = () => ws.send('ping')
      ws.on('message', (data) => resolve(data.toString()))
      ws.on('error', reject)
      setTimeout(() => reject(new Error('timeout')), 3000)
    })
    assert.equal(msg, 'new:ping', 're-registration should use new handler')
    ws.close()
    server.stop()
  })

  it('ws sub-router with global middleware propagates', async () => {
    let gmwRan = false
    const sub = new Router()
      .use((_req, _ctx, next) => { gmwRan = true; return next(_req, _ctx) })
      .ws('/chat', { open(ws) { ws.send(gmwRan ? 'gmw-ok' : 'no-gmw') } })

    const main = new Router().use('/sub', sub)
    const server = serve(main.handler(), { port: 0, websocket: main.websocketHandler() })
    await server.ready

    const ws = new WebSocket(`ws://localhost:${server.port}/sub/chat`)
    const msg = await new Promise<string>((resolve, reject) => {
      ws.on('message', (data) => resolve(data.toString()))
      ws.on('error', reject)
      setTimeout(() => reject(new Error('timeout')), 3000)
    })
    assert.equal(msg, 'gmw-ok', 'sub-router global middleware must run on ws route')
    ws.close()
    server.stop()
  })

  it('ws unmatched path destroys socket', async () => {
    const router = new Router().ws('/chat', { message() {} })
    const server = serve(router.handler(), { port: 0, websocket: router.websocketHandler() })
    await server.ready

    const ws = new WebSocket(`ws://localhost:${server.port}/nonexistent`)
    const result = await new Promise<string>((resolve) => {
      ws.on('unexpected-response', (req, res) => resolve(`rejected-${res.statusCode}`))
      ws.on('error', () => resolve('error'))
      ws.on('open', () => { ws.close(); resolve('opened') })
      setTimeout(() => resolve('timeout'), 3000)
    })
    assert.notEqual(result, 'opened', 'unmatched WS path should not upgrade')
    server.stop()
  })

  it('ws close callback fires on client disconnect', async () => {
    let closeReason = ''
    const router = new Router().ws('/chat', {
      open(ws) { ws.send('open') },
      close(_ws, _ctx) { closeReason = 'client-gone' },
    })
    const server = serve(router.handler(), { port: 0, websocket: router.websocketHandler() })
    await server.ready

    const ws = new WebSocket(`ws://localhost:${server.port}/chat`)
    await new Promise<void>((resolve) => {
      ws.on('message', () => { ws.close(); resolve() })
      ws.on('error', resolve)
      setTimeout(() => resolve(), 2000)
    })
    // Allow close event to propagate
    await new Promise(r => setTimeout(r, 100))
    assert.equal(closeReason, 'client-gone')
    server.stop()
  })

  it('ws handler supports close and error callbacks', async () => {
    // Verify close and error callback fields are accepted by ws()
    let closed = false
    let erred = false
    const r = new Router().ws('/chat', {
      open(ws) { ws.send('hello') },
      message(_ws, _ctx, _data) {},
      close(_ws, _ctx) { closed = true },
      error(_ws, _ctx, _err) { erred = true },
    })
    const server = serve(r.handler(), { port: 0, websocket: r.websocketHandler() })
    await server.ready

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/chat`)
    await new Promise<void>((resolve) => {
      ws.on('message', () => { ws.close() })
      ws.on('close', () => resolve())
      ws.on('error', () => resolve())
      setTimeout(() => resolve(), 2000)
    })
    // After graceful close, close callback should have fired
    await new Promise(r => setTimeout(r, 100))
    assert.equal(closed, true)
    server.stop()
  })
})

// ── Concurrent ─────────────────────────────────────────────────────────────

describe('Router concurrency', () => {
  it('concurrent requests do not interfere', async () => {
    const r = new Router().get('/echo/:val', (req, ctx) => Response.json({ val: ctx.params.val }))
    const h = r.handler()
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        Promise.resolve(h(new Request(`http://localhost/echo/${i}`), mkCtx())).then(r => r.json()) as Promise<Record<string, string>>,
      ),
    )
    results.forEach((data, i) => {
      assert.equal(data.val, String(i))
    })
  })

  it('concurrent requests preserve ctx.params isolation', async () => {
    const r = new Router().get('/:id', (req, ctx) => Response.json({ id: ctx.params.id }))
    const h = r.handler()
    const ids = ['a', 'b', 'c', 'd', 'e']
    const results = await Promise.all(ids.map(id =>
      h(new Request(`http://localhost/${id}`), mkCtx()).then(r => r.json()) as Promise<Record<string, string>>,
    ))
    ids.forEach((id, i) => assert.equal(results[i].id, id))
  })

  it('concurrent requests from same Router instance with global middleware', async () => {
    let totalCalls = 0
    const r = new Router()
      .use((_req, _ctx, next) => { totalCalls++; return next(_req, _ctx) })
      .get('/value/:n', (req, ctx) => Response.json({ n: ctx.params.n }))

    const h = r.handler()
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      h(new Request(`http://localhost/value/${i}`), mkCtx()).then(r => r.json()) as Promise<Record<string, string>>,
    ))
    assert.equal(totalCalls, 20)
    results.forEach((d, i) => assert.equal(d.n, String(i)))
  })
})

// ── Edge Cases ─────────────────────────────────────────────────────────────

describe('Router edge cases', () => {
  it('empty path in handler() matches root', async () => {
    const r = new Router().get('/', () => new Response('root'))
    const res = await r.handler()(new Request('http://localhost'), mkCtx())
    assert.equal(await res.text(), 'root')
  })

  it('wildcard in sub-router path works', async () => {
    const sub = new Router().all('/*', (req, ctx) => Response.json({ rest: ctx.params['*'] }))
    const main = new Router().use('/files', sub)
    const res = await main.handler()(new Request('http://localhost/files/path/to/file.txt'), mkCtx())
    const data = await res.json() as Record<string, string>
    assert.equal(data.rest, 'path/to/file.txt')
  })

  it('mounting at / behaves same as root', async () => {
    const sub = new Router().get('/hello', () => new Response('sub-hello'))
    const main = new Router().use('/', sub)
    const res = await main.handler()(new Request('http://localhost/hello'), mkCtx())
    assert.equal(await res.text(), 'sub-hello')
  })

  it('handler() creates a reusable Handler function', async () => {
    const r = new Router().get('/count', () => new Response('1'))
    const h = r.handler()
    for (let i = 0; i < 5; i++) {
      const res = await h(new Request('http://localhost/count'), mkCtx())
      assert.equal(await res.text(), '1')
    }
  })

  it('route with absolute URL in Request works', async () => {
    const r = new Router().get('/test', () => new Response('ok'))
    const res = await r.handler()(new Request('https://example.com/test'), mkCtx())
    assert.equal(res.status, 200)
  })

  it('both handler() return value and middleware chain work with async handler', async () => {
    const r = new Router().get('/delay', async () => {
      await new Promise(r => setTimeout(r, 5))
      return new Response('delayed')
    })
    const res = await r.handler()(new Request('http://localhost/delay'), mkCtx())
    assert.equal(await res.text(), 'delayed')
  })

  it('query params from URL are accessible via ctx.query', async () => {
    const r = new Router().get('/search', (req, ctx) => Response.json(ctx.query))
    const res = await r.handler()(
      new Request('http://localhost/search?q=test&page=1'),
      mkCtx({ query: { q: 'test', page: '1' } }),
    )
    const data = await res.json() as Record<string, string>
    assert.equal(data.q, 'test')
    assert.equal(data.page, '1')
  })

  it('route() with the Router wildcard * preserves correct prefix', async () => {
    const r = new Router().get('/static/*', (req, ctx) => Response.json({ file: ctx.params['*'] }))
    const res = await r.handler()(new Request('http://localhost/static/js/app.js'), mkCtx())
    const data = await res.json() as Record<string, string>
    assert.equal(data.file, 'js/app.js')
  })

  it('param value contains special characters', async () => {
    const r = new Router().get('/search/:query', (req, ctx) => new Response(ctx.params.query))
    const res = await r.handler()(new Request('http://localhost/search/c++%20dart'), mkCtx())
    assert.equal(await res.text(), 'c++%20dart')
  })
})

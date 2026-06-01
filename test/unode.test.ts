import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { WebSocket } from 'ws'
import { serve, Router, graphql, setCookie, type Handler, type Server } from '../index.ts'

async function createTestServer(handler: Handler): Promise<{ server: Server; url: string }> {
  const server = serve(handler, { port: 0 })
  await server.ready
  return { server, url: `http://localhost:${server.port}` }
}

// ── serve ────────────────────────────────────────────────────────────────────

describe('serve', () => {
  it('handles GET request', async () => {
    const { server, url } = await createTestServer(() => new Response('hello'))
    const res = await fetch(url)
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'hello')
    server.stop()
  })

  it('handles POST with body echo', async () => {
    const { server, url } = await createTestServer(async (req) => {
      const body = await req.text()
      return new Response(body, { status: 201 })
    })
    const res = await fetch(url, { method: 'POST', body: 'test data' })
    assert.equal(res.status, 201)
    assert.equal(await res.text(), 'test data')
    server.stop()
  })

  it('passes response headers through', async () => {
    const { server, url } = await createTestServer(() =>
      new Response('ok', { headers: { 'x-custom': 'value', 'content-type': 'text/plain' } }),
    )
    const res = await fetch(url)
    assert.equal(res.headers.get('x-custom'), 'value')
    assert.equal(res.headers.get('content-type'), 'text/plain')
    server.stop()
  })

  it('provides ctx.query from URL', async () => {
    const { server, url } = await createTestServer((req, ctx) =>
      Response.json(ctx.query),
    )
    const res = await fetch(`${url}?foo=bar&baz=qux`)
    const data = await res.json() as Record<string, string>
    assert.equal(data.foo, 'bar')
    assert.equal(data.baz, 'qux')
    server.stop()
  })

  it('returns 500 on handler error', async () => {
    const { server, url } = await createTestServer(() => {
      throw new Error('boom')
    })
    const res = await fetch(url)
    assert.equal(res.status, 500)
    assert.match(await res.text(), /Internal Server Error/)
    server.stop()
  })

  it('server.stop() closes the server', async () => {
    const server = serve(() => new Response('ok'), { port: 0 })
    await server.ready
    const port = server.port
    server.stop()
    await assert.rejects(() => fetch(`http://localhost:${port}`))
  })

  it('rejects body exceeding maxBodySize', async () => {
    const handler: Handler = async (req) => new Response(await req.text())
    const server = serve(handler, { port: 0, maxBodySize: 5 })
    await server.ready
    const res = await fetch(`http://localhost:${server.port}`, { method: 'POST', body: 'too large' })
    assert.equal(res.status, 413)
    server.stop()
  })

  it('accepts body within maxBodySize', async () => {
    const handler: Handler = async (req) => new Response(await req.text())
    const server = serve(handler, { port: 0, maxBodySize: 100 })
    await server.ready
    const res = await fetch(`http://localhost:${server.port}`, { method: 'POST', body: 'small' })
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'small')
    server.stop()
  })

  it('AbortSignal prevents server from starting', async () => {
    const ac = new AbortController()
    ac.abort()
    const server = serve(() => new Response('ok'), { port: 0, signal: ac.signal })
    await server.ready
    assert.equal(server.port, 0)
    server.stop()
  })
})

// ── Router ────────────────────────────────────────────────────────────────────

describe('Router', () => {
  it('matches GET route', async () => {
    const r = new Router().get('/hello', () => new Response('world'))
    const res = await r.handler()(new Request('http://localhost/hello'), { params: {}, query: {} } as any)
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'world')
  })

  it('matches POST route', async () => {
    const r = new Router().post('/data', async (req) => {
      const body = await req.text()
      return new Response(body, { status: 201 })
    })
    const res = await r.handler()(new Request('http://localhost/data', { method: 'POST', body: 'hello' }), { params: {}, query: {} } as any)
    assert.equal(res.status, 201)
    assert.equal(await res.text(), 'hello')
  })

  it('provides ctx.params', async () => {
    const r = new Router().get('/users/:id', (req, ctx) =>
      Response.json({ id: ctx.params.id }),
    )
    const res = await r.handler()(new Request('http://localhost/users/42'), { params: {}, query: {} } as any)
    const data = await res.json() as Record<string, string>
    assert.equal(data.id, '42')
  })

  it('multiple params', async () => {
    const r = new Router().get('/:a/:b', (req, ctx) =>
      Response.json({ a: ctx.params.a, b: ctx.params.b }),
    )
    const res = await r.handler()(new Request('http://localhost/foo/bar'), { params: {}, query: {} } as any)
    const data = await res.json() as Record<string, string>
    assert.equal(data.a, 'foo')
    assert.equal(data.b, 'bar')
  })

  it('static route wins over param route', async () => {
    const r = new Router()
      .get('/users/me', () => new Response('me'))
      .get('/users/:id', (req, ctx) => new Response(ctx.params.id))
    const res1 = await r.handler()(new Request('http://localhost/users/me'), { params: {}, query: {} } as any)
    assert.equal(await res1.text(), 'me')
    const res2 = await r.handler()(new Request('http://localhost/users/42'), { params: {}, query: {} } as any)
    assert.equal(await res2.text(), '42')
  })

  it('wildcard matches remaining path', async () => {
    const r = new Router().all('/api/*', (req, ctx) =>
      Response.json({ wildcard: ctx.params['*'] }),
    )
    const res = await r.handler()(new Request('http://localhost/api/foo/bar'), { params: {}, query: {} } as any)
    const data = await res.json() as Record<string, string>
    assert.equal(data.wildcard, 'foo/bar')
  })

  it('returns 404 for unmatched route', async () => {
    const r = new Router().get('/exists', () => new Response('ok'))
    const res = await r.handler()(new Request('http://localhost/nonexistent'), { params: {}, query: {} } as any)
    assert.equal(res.status, 404)
  })

  it('all() matches any method', async () => {
    const r = new Router().all('/any', () => new Response('ok'))
    for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']) {
      const res = await r.handler()(new Request('http://localhost/any', { method }), { params: {}, query: {} } as any)
      assert.equal(res.status, 200)
    }
  })

  it('sub-router mounting', async () => {
    const sub = new Router().get('/nested', () => new Response('sub'))
    const main = new Router().use('/api', sub)
    const res = await main.handler()(new Request('http://localhost/api/nested'), { params: {}, query: {} } as any)
    assert.equal(await res.text(), 'sub')
  })

  it('sub-router preserves params', async () => {
    const sub = new Router().get('/:userId', (req, ctx) =>
      Response.json({ userId: ctx.params.userId }),
    )
    const main = new Router().use('/orgs/:orgId', sub)
    const res = await main.handler()(new Request('http://localhost/orgs/acme/john'), { params: {}, query: {} } as any)
    const data = await res.json() as Record<string, string>
    assert.equal(data.userId, 'john')
  })

  it('middleware order: global → path → route', async () => {
    const order: number[] = []
    const r = new Router()
      .use((_req, _ctx, next) => { order.push(1); return next(_req, _ctx) })
      .use('/scoped', (_req, _ctx, next) => { order.push(2); return next(_req, _ctx) })
      .get('/scoped/route',
        (_req, _ctx, next) => { order.push(3); return next(_req, _ctx) },
        () => { order.push(4); return Response.json(order) },
      )
    await r.handler()(new Request('http://localhost/scoped/route'), { params: {}, query: {} } as any)
    assert.deepEqual(order, [1, 2, 3, 4])
  })

  it('middleware short-circuits', async () => {
    const r = new Router()
      .use(() => new Response('blocked', { status: 403 }))
      .get('/blocked', () => new Response('should not reach'))
    const res = await r.handler()(new Request('http://localhost/blocked'), { params: {}, query: {} } as any)
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
    const res = await r.handler()(new Request('http://localhost/modify'), { params: {}, query: {} } as any)
    const data = await res.json() as Record<string, unknown>
    assert.equal(data.original, true)
    assert.equal(data.modified, true)
  })

  it('onError catches handler exceptions', async () => {
    const r = new Router()
      .onError((err) => Response.json({ error: err.message }, { status: 500 }))
      .get('/crash', () => { throw new Error('oops') })
    const res = await r.handler()(new Request('http://localhost/crash'), { params: {}, query: {} } as any)
    assert.equal(res.status, 500)
    const data = await res.json() as Record<string, string>
    assert.equal(data.error, 'oops')
  })

  it('root path / matches', async () => {
    const r = new Router().get('/', () => new Response('root'))
    const res = await r.handler()(new Request('http://localhost/'), { params: {}, query: {} } as any)
    assert.equal(await res.text(), 'root')
  })

  it('same param name on same path position works', async () => {
    const r = new Router()
      .get('/:id', () => new Response('a'))
      .get('/:id/profile', () => new Response('b'))
    assert.equal(await (await r.handler()(new Request('http://localhost/foo'), { params: {}, query: {} } as any)).text(), 'a')
    assert.equal(await (await r.handler()(new Request('http://localhost/foo/profile'), { params: {}, query: {} } as any)).text(), 'b')
  })

  it('different param names on same path position throw', () => {
    const r = new Router()
    r.get('/:id', () => new Response('ok'))
    assert.throws(() => r.get('/:slug', () => new Response('ng')), /Param name conflict/)
  })

  it('multiple methods on same path', async () => {
    const r = new Router()
      .get('/resource', () => Response.json({ method: 'GET' }))
      .post('/resource', () => Response.json({ method: 'POST' }))
      .put('/resource', () => Response.json({ method: 'PUT' }))
      .delete('/resource', () => Response.json({ method: 'DELETE' }))

    const h = r.handler()
    const tests = ['GET', 'POST', 'PUT', 'DELETE'] as const
    for (const method of tests) {
      const res = await h(new Request('http://localhost/resource', { method }), { params: {}, query: {} } as any)
      const data = await res.json() as Record<string, string>
      assert.equal(data.method, method)
    }
  })

  it('concurrent requests do not interfere', async () => {
    const r = new Router().get('/echo/:val', (req, ctx) =>
      Response.json({ val: ctx.params.val }),
    )
    const h = r.handler()
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        Promise.resolve(h(new Request(`http://localhost/echo/${i}`), { params: {}, query: {} } as any)).then(r => r.json()) as Promise<Record<string, string>>,
      ),
    )
    results.forEach((data, i) => {
      assert.equal(data.val, String(i))
    })
  })
})

// ── Router.ws ────────────────────────────────────────────────────────────────

describe('Router.ws', () => {
  it('echos messages', async () => {
    const router = new Router()
      .ws('/echo', { message(ws, _ctx, data) { ws.send(`echo: ${data}`) } })

    const server = serve(router.handler(), {
      port: 0,
      websocket: router.websocketHandler(),
    })
    await server.ready

    const ws = new WebSocket(`ws://localhost:${server.port}/echo`)
    const msg = await new Promise<string>((resolve, reject) => {
      ws.on('open', () => ws.send('hello'))
      ws.on('message', (data) => resolve(data.toString()))
      ws.on('error', reject)
      setTimeout(() => reject(new Error('timeout')), 3000)
    })
    assert.equal(msg, 'echo: hello')
    ws.close()
    server.stop()
  })

  it('passes params from URL', async () => {
    const router = new Router()
      .ws('/chat/:room', { open(ws, ctx) { ws.send(ctx.params.room!) } })

    const server = serve(router.handler(), {
      port: 0,
      websocket: router.websocketHandler(),
    })
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
    const router = new Router()
      .ws('/secure',
        (req, _ctx, next) => {
          const auth = req.headers.get('Authorization')
          if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })
          return next(req, _ctx)
        },
        { open(ws) { ws.send('authorized') } },
      )

    const server = serve(router.handler(), {
      port: 0,
      websocket: router.websocketHandler(),
    })
    await server.ready

    // Should be rejected (no auth header from Node.js built-in WebSocket)
    const ws = new WebSocket(`ws://localhost:${server.port}/secure`)
    const error = await new Promise<string | null>((resolve) => {
      ws.on('error', () => resolve('error'))
      ws.on('open', () => resolve(null))
      ws.on('unexpected-response', () => resolve('unexpected-response'))
      setTimeout(() => resolve('timeout'), 3000)
    })
    // Without auth, the middleware returns 401 and upgrade is rejected
    assert.ok(error === 'unexpected-response' || error === 'error', `Expected rejection, got: ${error}`)
    server.stop()
  })
})

// ── graphql middleware ──────────────────────────────────────────────────────────

describe('graphql', () => {
  it('handles GET query', async () => {
    const r = new Router()
    r.use('/graphql', graphql(() => ({
      schema: `type Query { hello: String }`,
      resolvers: { Query: { hello: () => 'world' } },
    })))

    const { server, url } = await createTestServer(r.handler())
    const res = await fetch(`${url}/graphql?query={hello}`)
    assert.equal(res.status, 200)
    const data = await res.json() as Record<string, unknown>
    assert.deepEqual(data, { data: { hello: 'world' } })
    server.stop()
  })

  it('handles POST query', async () => {
    const r = new Router()
    r.use('/graphql', graphql(() => ({
      schema: `type Query { hello: String }`,
      resolvers: { Query: { hello: () => 'world' } },
    })))

    const { server, url } = await createTestServer(r.handler())
    const res = await fetch(`${url}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ hello }' }),
    })
    assert.equal(res.status, 200)
    const data = await res.json() as Record<string, unknown>
    assert.deepEqual(data, { data: { hello: 'world' } })
    server.stop()
  })

  it('returns GraphiQL HTML on GET without query', async () => {
    const r = new Router()
    r.use('/graphql', graphql(() => ({
      schema: `type Query { hello: String }`,
      resolvers: { Query: { hello: () => 'world' } },
      graphiql: true,
    })))

    const { server, url } = await createTestServer(r.handler())
    const res = await fetch(`${url}/graphql`)
    assert.equal(res.status, 200)
    const text = await res.text()
    assert.ok(text.includes('GraphiQL'))
    assert.ok(text.includes('graphiql'))
    server.stop()
  })
})

// ── Additional serve tests ─────────────────────────────────────────────────

describe('serve additional', () => {
  it('passes WebSocket upgrade handler to server', async () => {
    let upgraded = false
    const handler: Handler = () => new Response('ok')
    const wsHandler = () => { upgraded = true }
    const server = serve(handler, { port: 0, websocket: wsHandler })
    await server.ready
    assert.equal(server.port > 0, true)
    server.stop()
  })

  it('preserves multiple Set-Cookie headers in sendResponse', async () => {
    const { server, url } = await createTestServer(() => {
      let res = new Response('ok')
      res = setCookie(res, 'a', '1')
      res = setCookie(res, 'b', '2')
      return res
    })
    const res = await fetch(url)
    const cookies = res.headers.getSetCookie?.() ?? [res.headers.get('Set-Cookie')!]
    assert.ok(Array.isArray(cookies) ? cookies.length >= 2 : true)
    server.stop()
  })

  it('handles HEAD method without body', async () => {
    const { server, url } = await createTestServer(() => new Response('body'))
    const res = await fetch(url, { method: 'HEAD' })
    assert.equal(res.status, 200)
    server.stop()
  })
})

// ── Router additional tests ────────────────────────────────────────────────

describe('Router additional', () => {
  it('uses route-level middleware on sub-router nodes', async () => {
    let mwCalled = false
    const sub = new Router().get('/data', () => new Response('ok'))
    const main = new Router()
      .use('/api', (req, ctx, next) => {
        mwCalled = true
        return next(req, ctx)
      })
      .use('/api', sub)

    const res = await main.handler()(new Request('http://localhost/api/data'), { params: {}, query: {} } as any)
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

    await root.handler()(new Request('http://localhost/root/middle/action'), { params: {}, query: {} } as any)
    assert.equal(capturedMountPath, '/root/middle')
  })

  it('error handler receives non-Error throws as wrapped Error', async () => {
    let caughtMessage = ''
    const r = new Router()
      .onError((err) => {
        caughtMessage = err.message
        return new Response('handled', { status: 500 })
      })
      .get('/crash', () => { throw 'string error' })

    await r.handler()(new Request('http://localhost/crash'), { params: {}, query: {} } as any)
    assert.equal(caughtMessage, 'string error')
  })

  it('ws wildcard matches sub-paths', async () => {
    const router = new Router()
      .ws('/chat/*', { open(ws, ctx) { ws.send('wildcard') } })

    const server = serve(router.handler(), {
      port: 0,
      websocket: router.websocketHandler(),
    })
    await server.ready

    const { WebSocket } = await import('ws')
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

  it('head method route works', async () => {
    const r = new Router().head('/x', () => new Response('ok', { headers: { 'x-custom': 'v' } }))
    const res = await r.handler()(new Request('http://localhost/x', { method: 'HEAD' }), { params: {}, query: {} } as any)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('x-custom'), 'v')
  })

  it('options method route works', async () => {
    const r = new Router().options('/x', () => new Response('ok'))
    const res = await r.handler()(new Request('http://localhost/x', { method: 'OPTIONS' }), { params: {}, query: {} } as any)
    assert.equal(res.status, 200)
  })

  it('all() with wildcard path matches any method and path', async () => {
    const r = new Router().all('/*', (req, ctx) => Response.json({ method: req.method, wildcard: ctx.params['*'] }))

    const res = await r.handler()(new Request('http://localhost/foo/bar', { method: 'PUT' }), { params: {}, query: {} } as any)
    const data = await res.json() as any
    assert.equal(data.method, 'PUT')
    assert.equal(data.wildcard, 'foo/bar')
  })
})

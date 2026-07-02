import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { serve } from '../core/serve.ts'
import { Router } from '../core/router.ts'

describe('serve', () => {
  let servers: Awaited<ReturnType<typeof serve>>[] = []

  afterEach(async () => {
    for (const s of servers) await s.close()
    servers = []
  })

  function start(app: Router, opts = {}) {
    const s = serve(app, { port: 0, shutdown: false, ...opts })
    servers.push(s)
    return s
  }

  it('starts and responds to GET', async () => {
    const app = new Router().get('/', () => new Response('hello'))
    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/`)
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'hello')
  })

  it('handles POST with body', async () => {
    const app = new Router().post('/echo', async (req) => {
      const body = await req.text()
      return new Response(body)
    })
    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/echo`, {
      method: 'POST',
      body: 'hello world',
    })
    assert.equal(await res.text(), 'hello world')
  })

  it('handles JSON response', async () => {
    const app = new Router().get('/json', () => Response.json({ ok: true }))
    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/json`)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'application/json')
    const data = await res.json()
    assert.deepEqual(data, { ok: true })
  })

  it('returns 404 for unknown routes', async () => {
    const app = new Router().get('/known', () => new Response('ok'))
    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/unknown`)
    assert.equal(res.status, 404)
  })

  it('supports path params', async () => {
    const app = new Router().get('/users/:id', (req, ctx) => {
      return new Response(ctx.params.id)
    })
    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/users/42`)
    assert.equal(await res.text(), '42')
  })

  it('handles concurrent requests', async () => {
    const app = new Router().get('/delay', () => new Response('ok'))
    const s = start(app)
    await s.ready
    const results = await Promise.all([
      fetch(`http://localhost:${s.port}/delay`),
      fetch(`http://localhost:${s.port}/delay`),
      fetch(`http://localhost:${s.port}/delay`),
    ])
    for (const r of results) assert.equal(r.status, 200)
  })

  it('handles large response body', async () => {
    const body = 'x'.repeat(100_000)
    const app = new Router().get('/large', () => new Response(body))
    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/large`)
    assert.equal(await res.text(), body)
  })

  it('handles query params', async () => {
    const app = new Router().get('/search', (req, ctx) => {
      return Response.json(ctx.query)
    })
    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/search?q=test&page=1`)
    const data = await res.json()
    assert.equal(data.q, 'test')
    assert.equal(data.page, '1')
  })

  it('handles 500 errors gracefully', async () => {
    const app = new Router().get('/crash', () => { throw new Error('boom') })
    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/crash`)
    assert.equal(res.status, 500)
  })

  it('handles custom error handler', async () => {
    const app = new Router()
      .get('/err', () => { throw new Error('custom') })
      .onError((err) => new Response(`error: ${err.message}`, { status: 400 }))
    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/err`)
    assert.equal(res.status, 400)
    assert.equal(await res.text(), 'error: custom')
  })

  it('sends x-trace-id header', async () => {
    const app = new Router().get('/', () => new Response('ok'))
    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/`)
    assert.ok(res.headers.get('x-trace-id'))
  })

  it('reuses incoming x-trace-id', async () => {
    const app = new Router().get('/', (req) => {
      return new Response('ok')
    })
    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/`, {
      headers: { 'x-trace-id': 'my-trace' },
    })
    assert.equal(res.headers.get('x-trace-id'), 'my-trace')
  })

  it('close() stops accepting connections', async () => {
    const app = new Router().get('/', () => new Response('ok'))
    const s = start(app)
    await s.ready
    await s.close()
    // After close, new connections should fail
    try {
      await fetch(`http://localhost:${s.port}/`)
      assert.fail('should not reach')
    } catch {
      // expected
    }
  })
})

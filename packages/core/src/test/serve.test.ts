import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { serve, createTestServer, Router } from '../index.ts'

function r(handler: (req: Request, ctx: any) => Response | Promise<Response>) {
  return new Router().all('/*', handler)
}

// ── serve ───────────────────────────────────────────────────────────────────

describe('serve', () => {
  it('handles GET request', async () => {
    const { server, url } = await createTestServer(r(() => new Response('hello')))
    const res = await fetch(url)
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'hello')
    server.stop()
  })

  it('handles POST with body echo', async () => {
    const { server, url } = await createTestServer(r(async (req) => {
      const body = await req.text()
      return new Response(body, { status: 201 })
    }))
    const res = await fetch(url, { method: 'POST', body: 'test data' })
    assert.equal(res.status, 201)
    assert.equal(await res.text(), 'test data')
    server.stop()
  })

  it('passes response headers through', async () => {
    const { server, url } = await createTestServer(
      r(() => new Response('ok', { headers: { 'x-custom': 'value', 'content-type': 'text/plain' } })),
    )
    const res = await fetch(url)
    assert.equal(res.headers.get('x-custom'), 'value')
    assert.equal(res.headers.get('content-type'), 'text/plain')
    server.stop()
  })

  it('provides ctx.query from URL', async () => {
    const { server, url } = await createTestServer(r((req, ctx) => Response.json(ctx.query)))
    const res = await fetch(`${url}?foo=bar&baz=qux`)
    const data = (await res.json()) as Record<string, string>
    assert.equal(data.foo, 'bar')
    assert.equal(data.baz, 'qux')
    server.stop()
  })

  it('returns 500 on handler error', async () => {
    const { server, url } = await createTestServer(r(() => { throw new Error('boom') }))
    const res = await fetch(url)
    assert.equal(res.status, 500)
    assert.match(await res.text(), /Internal Server Error/)
    server.stop()
  })

  it('server.stop() closes the server', async () => {
    const server = serve(r(() => new Response('ok')), { port: 0 })
    await server.ready
    const port = server.port
    server.stop()
    await assert.rejects(() => fetch(`http://localhost:${port}`))
  })

  it('rejects body exceeding maxBodySize', async () => {
    const handler = r(async (req) => new Response(await req.text()))
    const server = serve(handler, { port: 0, maxBodySize: 5 })
    await server.ready
    const res = await fetch(`http://localhost:${server.port}`, { method: 'POST', body: 'too large' })
    assert.equal(res.status, 413)
    server.stop()
  })

  it('accepts body within maxBodySize', async () => {
    const handler = r(async (req) => new Response(await req.text()))
    const server = serve(handler, { port: 0, maxBodySize: 100 })
    await server.ready
    const res = await fetch(`http://localhost:${server.port}`, { method: 'POST', body: 'small' })
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'small')
    server.stop()
  })

  it('uses custom hostname', async () => {
    const server = serve(r(() => new Response('ok')), { port: 0, hostname: '127.0.0.1' })
    await server.ready
    assert.ok(server.port > 0)
    assert.equal(server.hostname, '127.0.0.1')
    server.stop()
  })
})

// ── createTestServer ────────────────────────────────────────────────────────

describe('createTestServer', () => {
  it('returns a running server with a URL', async () => {
    const { server, url } = await createTestServer(r(() => new Response('hi')))
    assert.ok(url.startsWith('http://'))
    assert.ok(server.port > 0)
    server.stop()
  })

  it('shuts down cleanly', async () => {
    const { server } = await createTestServer(r(() => new Response('ok')))
    await server.stop()
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../core/router.ts'
import { compress } from '../middleware/compress.ts'

function mkCtx() { return { params: {}, query: {} } as any }

describe('compress', () => {
  it('gzip compresses when Accept-Encoding includes gzip', async () => {
    const r = new Router().use(compress()).get('/', () => new Response('x'.repeat(2000)))
    const res = await r.handler()(
      new Request('http://localhost/', { headers: { 'accept-encoding': 'gzip' } }),
      mkCtx())
    assert.equal(res.headers.get('Content-Encoding'), 'gzip')
  })

  it('brotli preferred over gzip', async () => {
    const r = new Router().use(compress()).get('/', () => new Response('x'.repeat(2000)))
    const res = await r.handler()(
      new Request('http://localhost/', { headers: { 'accept-encoding': 'br, gzip' } }),
      mkCtx())
    assert.equal(res.headers.get('Content-Encoding'), 'br')
  })

  it('does not compress small responses', async () => {
    const r = new Router().use(compress()).get('/', () => new Response('hi'))
    const res = await r.handler()(
      new Request('http://localhost/', { headers: { 'accept-encoding': 'gzip' } }),
      mkCtx())
    assert.equal(res.headers.get('Content-Encoding'), null)
  })

  it('does not compress without Accept-Encoding', async () => {
    const r = new Router().use(compress()).get('/', () => new Response('x'.repeat(2000)))
    const res = await r.handler()(new Request('http://localhost/'), mkCtx())
    assert.equal(res.headers.get('Content-Encoding'), null)
  })

  it('compressed body is smaller', async () => {
    const body = 'x'.repeat(10000)
    const r = new Router().use(compress()).get('/', () => new Response(body))
    const res = await r.handler()(
      new Request('http://localhost/', { headers: { 'accept-encoding': 'gzip' } }),
      mkCtx())
    const compressed = await res.text()
    assert.ok(compressed.length < body.length, `expected compressed (${compressed.length}) < original (${body.length})`)
  })
})

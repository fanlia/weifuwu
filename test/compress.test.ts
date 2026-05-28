import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { gunzipSync, brotliDecompressSync } from 'node:zlib'
import { Router } from '../router.ts'
import { compress } from '../compress.ts'

describe('compress', () => {
  it('compresses with gzip when accepted', async () => {
    const r = new Router()
      .use(compress({ threshold: 0 }))
      .get('/data', () => new Response('hello '.repeat(100)))

    const res = await r.handler()(
      new Request('http://localhost/data', { headers: { 'accept-encoding': 'gzip' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.headers.get('content-encoding'), 'gzip')
    const body = await res.bytes()
    const decoded = gunzipSync(Buffer.from(body)).toString()
    assert.equal(decoded, 'hello '.repeat(100))
  })

  it('compresses with brotli (preferred over gzip)', async () => {
    const r = new Router()
      .use(compress({ threshold: 0 }))
      .get('/data', () => new Response('hello '.repeat(100)))

    const res = await r.handler()(
      new Request('http://localhost/data', { headers: { 'accept-encoding': 'br, gzip' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.headers.get('content-encoding'), 'br')
  })

  it('skips compression for small responses', async () => {
    const r = new Router()
      .use(compress({ threshold: 1000 }))
      .get('/data', () => new Response('small'))

    const res = await r.handler()(
      new Request('http://localhost/data', { headers: { 'accept-encoding': 'gzip' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.headers.get('content-encoding'), null)
  })

  it('skips compression when Accept-Encoding is absent', async () => {
    const r = new Router()
      .use(compress({ threshold: 0 }))
      .get('/data', () => new Response('hello '.repeat(100)))

    const res = await r.handler()(
      new Request('http://localhost/data'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.headers.get('content-encoding'), null)
  })

  it('does not compress images', async () => {
    const r = new Router()
      .use(compress({ threshold: 0 }))
      .get('/data', () => new Response('fakeimage', { headers: { 'content-type': 'image/png' } }))

    const res = await r.handler()(
      new Request('http://localhost/data', { headers: { 'accept-encoding': 'gzip' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.headers.get('content-encoding'), null)
  })

  it('does not compress already encoded responses', async () => {
    const r = new Router()
      .use(compress({ threshold: 0 }))
      .get('/data', () => new Response('data', { headers: { 'content-encoding': 'gzip' } }))

    const res = await r.handler()(
      new Request('http://localhost/data', { headers: { 'accept-encoding': 'gzip' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.headers.get('content-encoding'), 'gzip')
  })

  it('sets Content-Length after compression', async () => {
    const r = new Router()
      .use(compress({ threshold: 0 }))
      .get('/data', () => new Response('hello '.repeat(100)))

    const res = await r.handler()(
      new Request('http://localhost/data', { headers: { 'accept-encoding': 'gzip' } }),
      { params: {}, query: {} } as any,
    )
    assert.ok(res.headers.get('content-length'))
  })

  it('sets Vary: Accept-Encoding', async () => {
    const r = new Router()
      .use(compress({ threshold: 0 }))
      .get('/data', () => new Response('hello '.repeat(100)))

    const res = await r.handler()(
      new Request('http://localhost/data', { headers: { 'accept-encoding': 'gzip' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.headers.get('Vary'), 'Accept-Encoding')
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { gunzipSync, brotliDecompressSync, inflateSync } from 'node:zlib'
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

  it('compresses with deflate when accepted', async () => {
    const r = new Router()
      .use(compress({ threshold: 0 }))
      .get('/data', () => new Response('hello '.repeat(100)))

    const res = await r.handler()(
      new Request('http://localhost/data', { headers: { 'accept-encoding': 'deflate' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.headers.get('content-encoding'), 'deflate')
    const body = await res.bytes()
    const decoded = inflateSync(Buffer.from(body)).toString()
    assert.equal(decoded, 'hello '.repeat(100))
  })

  it('skips compression for 204 No Content', async () => {
    const r = new Router()
      .use(compress({ threshold: 0 }))
      .get('/empty', () => new Response(null, { status: 204 }))

    const res = await r.handler()(
      new Request('http://localhost/empty', { headers: { 'accept-encoding': 'gzip' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.headers.get('content-encoding'), null)
    assert.equal(res.status, 204)
  })

  it('skips compression for 206 Partial Content', async () => {
    const r = new Router()
      .use(compress({ threshold: 0 }))
      .get('/partial', () => new Response('partial', { status: 206, headers: { 'Content-Range': 'bytes 0-4/100' } }))

    const res = await r.handler()(
      new Request('http://localhost/partial', { headers: { 'accept-encoding': 'gzip' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.headers.get('content-encoding'), null)
    // Content-Range should be preserved
    assert.ok(res.headers.get('Content-Range'))
  })

  it('skips compression for 304 Not Modified', async () => {
    const r = new Router()
      .use(compress({ threshold: 0 }))
      .get('/cached', () => new Response(null, { status: 304 }))

    const res = await r.handler()(
      new Request('http://localhost/cached', { headers: { 'accept-encoding': 'gzip' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.headers.get('content-encoding'), null)
  })

  it('appends to existing Vary header', async () => {
    const r = new Router()
      .use(compress({ threshold: 0 }))
      .get('/data', () => new Response('hello '.repeat(100), {
        headers: { 'Vary': 'Origin' },
      }))

    const res = await r.handler()(
      new Request('http://localhost/data', { headers: { 'accept-encoding': 'gzip' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.headers.get('Vary'), 'Origin, Accept-Encoding')
  })

  it('skips compression for audio content', async () => {
    const r = new Router()
      .use(compress({ threshold: 0 }))
      .get('/audio', () => new Response('audio data', { headers: { 'content-type': 'audio/mpeg' } }))

    const res = await r.handler()(
      new Request('http://localhost/audio', { headers: { 'accept-encoding': 'gzip' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.headers.get('content-encoding'), null)
  })

  it('skips compression for 302 redirect', async () => {
    const r = new Router()
      .use(compress({ threshold: 0 }))
      .get('/redirect', () => new Response(null, { status: 302, headers: { 'Location': '/new' } }))

    const res = await r.handler()(
      new Request('http://localhost/redirect', { headers: { 'accept-encoding': 'gzip' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.headers.get('content-encoding'), null)
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { gunzipSync, brotliDecompressSync, inflateSync } from 'node:zlib'
import { testApp } from '../test/test-utils.ts'
import { compress } from '../middleware/compress.ts'

describe('compress', () => {
  it('compresses with gzip when accepted', async () => {
    const res = await testApp()
      .use(compress({ threshold: 0 }))
      .get('/data', () => new Response('hello '.repeat(100)))
      .getReq('/data')
      .header('accept-encoding', 'gzip')
      .send()
    assert.equal(res.headers.get('content-encoding'), 'gzip')
    const body = await res.bytes()
    const decoded = gunzipSync(Buffer.from(body)).toString()
    assert.equal(decoded, 'hello '.repeat(100))
  })

  it('compresses with brotli (preferred over gzip)', async () => {
    const res = await testApp()
      .use(compress({ threshold: 0 }))
      .get('/data', () => new Response('hello '.repeat(100)))
      .getReq('/data')
      .header('accept-encoding', 'br, gzip')
      .send()
    assert.equal(res.headers.get('content-encoding'), 'br')
  })

  it('skips compression for small responses', async () => {
    const res = await testApp()
      .use(compress({ threshold: 1000 }))
      .get('/data', () => new Response('small'))
      .getReq('/data')
      .header('accept-encoding', 'gzip')
      .send()
    assert.equal(res.headers.get('content-encoding'), null)
  })

  it('skips compression when Accept-Encoding is absent', async () => {
    const res = await testApp()
      .use(compress({ threshold: 0 }))
      .get('/data', () => new Response('hello '.repeat(100)))
      .getReq('/data')
      .send()
    assert.equal(res.headers.get('content-encoding'), null)
  })

  it('does not compress images', async () => {
    const res = await testApp()
      .use(compress({ threshold: 0 }))
      .get('/data', () => new Response('fakeimage', { headers: { 'content-type': 'image/png' } }))
      .getReq('/data')
      .header('accept-encoding', 'gzip')
      .send()
    assert.equal(res.headers.get('content-encoding'), null)
  })

  it('does not compress already encoded responses', async () => {
    const res = await testApp()
      .use(compress({ threshold: 0 }))
      .get('/data', () => new Response('data', { headers: { 'content-encoding': 'gzip' } }))
      .getReq('/data')
      .header('accept-encoding', 'gzip')
      .send()
    assert.equal(res.headers.get('content-encoding'), 'gzip')
  })

  it('sets Content-Length after compression', async () => {
    const res = await testApp()
      .use(compress({ threshold: 0 }))
      .get('/data', () => new Response('hello '.repeat(100)))
      .getReq('/data')
      .header('accept-encoding', 'gzip')
      .send()
    assert.ok(res.headers.get('content-length'))
  })

  it('sets Vary: Accept-Encoding', async () => {
    const res = await testApp()
      .use(compress({ threshold: 0 }))
      .get('/data', () => new Response('hello '.repeat(100)))
      .getReq('/data')
      .header('accept-encoding', 'gzip')
      .send()
    assert.equal(res.headers.get('Vary'), 'Accept-Encoding')
  })

  it('compresses with deflate when accepted', async () => {
    const res = await testApp()
      .use(compress({ threshold: 0 }))
      .get('/data', () => new Response('hello '.repeat(100)))
      .getReq('/data')
      .header('accept-encoding', 'deflate')
      .send()
    assert.equal(res.headers.get('content-encoding'), 'deflate')
    const body = await res.bytes()
    const decoded = inflateSync(Buffer.from(body)).toString()
    assert.equal(decoded, 'hello '.repeat(100))
  })

  it('skips compression for 204 No Content', async () => {
    const res = await testApp()
      .use(compress({ threshold: 0 }))
      .get('/empty', () => new Response(null, { status: 204 }))
      .getReq('/empty')
      .header('accept-encoding', 'gzip')
      .send()
    assert.equal(res.headers.get('content-encoding'), null)
    assert.equal(res.status, 204)
  })

  it('skips compression for 206 Partial Content', async () => {
    const res = await testApp()
      .use(compress({ threshold: 0 }))
      .get(
        '/partial',
        () =>
          new Response('partial', {
            status: 206,
            headers: { 'Content-Range': 'bytes 0-4/100' },
          }),
      )
      .getReq('/partial')
      .header('accept-encoding', 'gzip')
      .send()
    assert.equal(res.headers.get('content-encoding'), null)
    assert.ok(res.headers.get('Content-Range'))
  })

  it('skips compression for 304 Not Modified', async () => {
    const res = await testApp()
      .use(compress({ threshold: 0 }))
      .get('/cached', () => new Response(null, { status: 304 }))
      .getReq('/cached')
      .header('accept-encoding', 'gzip')
      .send()
    assert.equal(res.headers.get('content-encoding'), null)
  })

  it('appends to existing Vary header', async () => {
    const res = await testApp()
      .use(compress({ threshold: 0 }))
      .get(
        '/data',
        () =>
          new Response('hello '.repeat(100), {
            headers: { Vary: 'Origin' },
          }),
      )
      .getReq('/data')
      .header('accept-encoding', 'gzip')
      .send()
    assert.equal(res.headers.get('Vary'), 'Origin, Accept-Encoding')
  })

  it('skips compression for audio content', async () => {
    const res = await testApp()
      .use(compress({ threshold: 0 }))
      .get(
        '/audio',
        () => new Response('audio data', { headers: { 'content-type': 'audio/mpeg' } }),
      )
      .getReq('/audio')
      .header('accept-encoding', 'gzip')
      .send()
    assert.equal(res.headers.get('content-encoding'), null)
  })

  it('skips compression for 302 redirect', async () => {
    const res = await testApp()
      .use(compress({ threshold: 0 }))
      .get('/redirect', () => new Response(null, { status: 302, headers: { Location: '/new' } }))
      .getReq('/redirect')
      .header('accept-encoding', 'gzip')
      .send()
    assert.equal(res.headers.get('content-encoding'), null)
  })

  it('skips compression of application/zip', async () => {
    const res = await testApp()
      .use(compress({ threshold: 0 }))
      .get(
        '/file',
        () => new Response(Buffer.alloc(2000), { headers: { 'Content-Type': 'application/zip' } }),
      )
      .getReq('/file')
      .header('accept-encoding', 'gzip')
      .send()
    assert.equal(res.headers.get('content-encoding'), null)
  })

  it('skips compression of video content', async () => {
    const res = await testApp()
      .use(compress({ threshold: 0 }))
      .get(
        '/clip',
        () => new Response(Buffer.alloc(2000), { headers: { 'Content-Type': 'video/mp4' } }),
      )
      .getReq('/clip')
      .header('accept-encoding', 'gzip')
      .send()
    assert.equal(res.headers.get('content-encoding'), null)
  })

  it('skips compression when response has no content-type', async () => {
    const res = await testApp()
      .use(compress({ threshold: 0 }))
      .get('/data', () => new Response(Buffer.alloc(2000)))
      .getReq('/data')
      .header('accept-encoding', 'gzip')
      .send()
    assert.equal(res.headers.get('content-encoding'), null)
  })
})

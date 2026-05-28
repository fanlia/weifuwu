import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Router } from '../router.ts'
import { serve } from '../serve.ts'
import { serveStatic } from '../static.ts'

const tmpDir = resolve(import.meta.dirname, '../.test-static')

before(async () => {
  await mkdir(tmpDir, { recursive: true })
  await writeFile(resolve(tmpDir, 'hello.txt'), 'Hello, World!')
  await writeFile(resolve(tmpDir, 'index.html'), '<h1>Index</h1>')
  await writeFile(resolve(tmpDir, 'script.js'), 'console.log(1)')
  await mkdir(resolve(tmpDir, 'sub'), { recursive: true })
  await writeFile(resolve(tmpDir, 'sub', 'deep.txt'), 'deep')
})

after(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('serveStatic', () => {
  it('serves a file', async () => {
    const r = new Router().get('/files/*', serveStatic(tmpDir))
    const res = await r.handler()(new Request('http://localhost/files/hello.txt'), { params: {}, query: {} } as any)
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'Hello, World!')
  })

  it('sets Content-Type based on extension', async () => {
    const r = new Router().get('/files/*', serveStatic(tmpDir))
    const res = await r.handler()(new Request('http://localhost/files/script.js'), { params: {}, query: {} } as any)
    assert.ok(res.headers.get('Content-Type')?.includes('javascript'))
  })

  it('sets ETag header', async () => {
    const r = new Router().get('/files/*', serveStatic(tmpDir))
    const res = await r.handler()(new Request('http://localhost/files/hello.txt'), { params: {}, query: {} } as any)
    assert.ok(res.headers.get('ETag'))
  })

  it('returns 304 on matching ETag', async () => {
    const r = new Router().get('/files/*', serveStatic(tmpDir))
    const res1 = await r.handler()(new Request('http://localhost/files/hello.txt'), { params: {}, query: {} } as any)
    const etag = res1.headers.get('ETag')
    const res2 = await r.handler()(
      new Request('http://localhost/files/hello.txt', { headers: { 'if-none-match': etag! } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res2.status, 304)
  })

  it('serves index.html for directory', async () => {
    const r = new Router().get('/files/*', serveStatic(tmpDir))
    const res = await r.handler()(new Request('http://localhost/files/'), { params: {}, query: {} } as any)
    assert.equal(res.status, 200)
    assert.equal(await res.text(), '<h1>Index</h1>')
  })

  it('returns 404 for missing file', async () => {
    const r = new Router().get('/files/*', serveStatic(tmpDir))
    const res = await r.handler()(new Request('http://localhost/files/nope.txt'), { params: {}, query: {} } as any)
    assert.equal(res.status, 404)
  })

  it('blocks directory traversal via wildcard param', async () => {
    const handler = serveStatic(tmpDir)
    const res = await handler(
      new Request('http://localhost/ignored'),
      { params: { '*': '../../package.json' }, query: {} } as any,
    )
    assert.equal(res.status, 403)
  })

  it('supports nested paths', async () => {
    const r = new Router().get('/files/*', serveStatic(tmpDir))
    const res = await r.handler()(new Request('http://localhost/files/sub/deep.txt'), { params: {}, query: {} } as any)
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'deep')
  })

  it('works with serve() end-to-end', async () => {
    const r = new Router().get('/static/*', serveStatic(tmpDir))
    const server = serve(r.handler(), { port: 0 })
    await server.ready
    const res = await fetch(`http://localhost:${server.port}/static/hello.txt`)
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'Hello, World!')
    server.stop()
  })
})

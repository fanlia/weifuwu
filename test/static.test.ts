import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { writeFile, mkdir, rm, symlink, chmod } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Router } from '../router.ts'
import { serve } from '../serve.ts'
import { serveStatic } from '../static.ts'

const tmpDir = resolve(import.meta.dirname, '../.test-static')

before(async () => {
  await rm(tmpDir, { recursive: true, force: true })
  await mkdir(tmpDir, { recursive: true })
  await writeFile(resolve(tmpDir, 'hello.txt'), 'Hello, World!')
  await writeFile(resolve(tmpDir, 'index.html'), '<h1>Index</h1>')
  await writeFile(resolve(tmpDir, 'app.html'), '<h1>App</h1>')
  await writeFile(resolve(tmpDir, 'script.js'), 'console.log(1)')
  await mkdir(resolve(tmpDir, 'sub'), { recursive: true })
  await writeFile(resolve(tmpDir, 'sub', 'deep.txt'), 'deep')
  // Symlink within root (should work)
  await symlink(resolve(tmpDir, 'hello.txt'), resolve(tmpDir, 'link.txt'))
  // Symlink escaping root (should be blocked)
  await symlink('/etc/passwd', resolve(tmpDir, 'escape.txt'))
  // File with unknown extension
  await writeFile(resolve(tmpDir, 'data.bin'), 'binary')
  // Empty directory for non-file index test
  await mkdir(resolve(tmpDir, 'not-a-file'), { recursive: true })
  // File with zero permissions for 500 error test
  await writeFile(resolve(tmpDir, 'no-perm.txt'), 'secret')
  await chmod(resolve(tmpDir, 'no-perm.txt'), 0o000)
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

  it('follows symlinks within root directory', async () => {
    const r = new Router().get('/files/*', serveStatic(tmpDir))
    const res = await r.handler()(new Request('http://localhost/files/link.txt'), { params: {}, query: {} } as any)
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'Hello, World!')
  })

  it('serves directory index with correct ETag from index file', async () => {
    const r = new Router().get('/files/*', serveStatic(tmpDir))
    const res = await r.handler()(new Request('http://localhost/files/'), { params: {}, query: {} } as any)
    assert.equal(res.status, 200)
    assert.equal(await res.text(), '<h1>Index</h1>')
    const etag = res.headers.get('ETag')
    // ETag should match the index file, not the directory
    const etag2 = (await r.handler()(new Request('http://localhost/files/'), { params: {}, query: {} } as any)).headers.get('ETag')
    assert.equal(etag, etag2)
  })

  it('returns 304 on matching ETag for directory index', async () => {
    const r = new Router().get('/files/*', serveStatic(tmpDir))
    const res = await r.handler()(new Request('http://localhost/files/'), { params: {}, query: {} } as any)
    const etag = res.headers.get('ETag')
    const res2 = await r.handler()(
      new Request('http://localhost/files/', { headers: { 'if-none-match': etag! } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res2.status, 304)
  })

  it('supports immutable cache-control option', async () => {
    const r = new Router().get('/files/*', serveStatic(tmpDir, { immutable: true, maxAge: 86400 }))
    const res = await r.handler()(new Request('http://localhost/files/hello.txt'), { params: {}, query: {} } as any)
    assert.ok(res.headers.get('Cache-Control')!.includes('immutable'))
    assert.ok(res.headers.get('Cache-Control')!.includes('max-age=86400'))
  })

  it('responds to If-Modified-Since', async () => {
    // Set If-Modified-Since to a far future date (well after mtime)
    const future = new Date('2099-01-01').toUTCString()
    const r = new Router().get('/files/*', serveStatic(tmpDir))
    const res = await r.handler()(
      new Request('http://localhost/files/hello.txt', { headers: { 'if-modified-since': future } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 304)
  })

  it('sets Last-Modified header', async () => {
    const r = new Router().get('/files/*', serveStatic(tmpDir))
    const res = await r.handler()(new Request('http://localhost/files/hello.txt'), { params: {}, query: {} } as any)
    const lm = res.headers.get('Last-Modified')
    assert.ok(lm)
    assert.ok(new Date(lm!).getTime() > 0)
  })

  it('supports custom index filename', async () => {
    const r = new Router().get('/files/*', serveStatic(tmpDir, { index: 'app.html' }))
    const res = await r.handler()(new Request('http://localhost/files/'), { params: {}, query: {} } as any)
    assert.equal(res.status, 200)
    assert.equal(await res.text(), '<h1>App</h1>')
  })

  it('blocks null byte in path', async () => {
    const r = new Router().get('/files/*', serveStatic(tmpDir))
    const res = await r.handler()(new Request('http://localhost/files/%00x.txt'), { params: {}, query: {} } as any)
    assert.equal(res.status, 403)
  })

  it('blocks symlink escaping root directory', async () => {
    const r = new Router().get('/files/*', serveStatic(tmpDir))
    const res = await r.handler()(new Request('http://localhost/files/escape.txt'), { params: {}, query: {} } as any)
    assert.equal(res.status, 403)
  })

  it('returns 404 when directory index target is not a file', async () => {
    const r = new Router().get('/files/*', serveStatic(tmpDir))
    const res = await r.handler()(new Request('http://localhost/files/not-a-file/'), { params: {}, query: {} } as any)
    assert.equal(res.status, 404)
  })

  it('falls back to application/octet-stream for unknown extension', async () => {
    const r = new Router().get('/files/*', serveStatic(tmpDir))
    const res = await r.handler()(new Request('http://localhost/files/data.bin'), { params: {}, query: {} } as any)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('Content-Type'), 'application/octet-stream')
  })

  it('default Cache-Control is public, max-age=0', async () => {
    const r = new Router().get('/files/*', serveStatic(tmpDir))
    const res = await r.handler()(new Request('http://localhost/files/hello.txt'), { params: {}, query: {} } as any)
    assert.ok(res.headers.get('Cache-Control')!.includes('public'))
    assert.ok(res.headers.get('Cache-Control')!.includes('max-age=0'))
    assert.doesNotMatch(res.headers.get('Cache-Control')!, /immutable/)
  })

  it('returns 500 for unreadable file', async () => {
    const r = new Router().get('/files/*', serveStatic(tmpDir))
    const res = await r.handler()(new Request('http://localhost/files/no-perm.txt'), { params: {}, query: {} } as any)
    assert.equal(res.status, 500)
  })
})

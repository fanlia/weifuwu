import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { serveStatic } from '../middleware/static.ts'

const tmpDir = join(import.meta.dirname || '.', '.tmp-static')

describe('serveStatic', () => {
  before(async () => {
    await mkdir(tmpDir, { recursive: true })
    await writeFile(join(tmpDir, 'hello.txt'), 'hello world')
    await writeFile(join(tmpDir, 'index.html'), '<h1>index</h1>')
  })

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('serves a file', async () => {
    const handler = serveStatic(tmpDir)
    const res = await handler(new Request('http://localhost/hello.txt'), { params: {}, query: {} } as any)
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'hello world')
  })

  it('serves index.html for directory', async () => {
    const handler = serveStatic(tmpDir)
    const res = await handler(new Request('http://localhost/'), { params: {}, query: {} } as any)
    assert.equal(res.status, 200)
    assert.ok((await res.text()).includes('index'))
  })

  it('returns 404 for missing file', async () => {
    const handler = serveStatic(tmpDir)
    const res = await handler(new Request('http://localhost/missing.txt'), { params: {}, query: {} } as any)
    assert.equal(res.status, 404)
  })

  it('sets content-type header', async () => {
    const handler = serveStatic(tmpDir)
    const res = await handler(new Request('http://localhost/hello.txt'), { params: {}, query: {} } as any)
    assert.ok(res.headers.get('content-type')?.includes('text/plain'))
  })

  it('sets cache-control when configured', async () => {
    const handler = serveStatic(tmpDir, { cacheControl: 'public, max-age=3600' })
    const res = await handler(new Request('http://localhost/hello.txt'), { params: {}, query: {} } as any)
    assert.ok(res.headers.get('cache-control'), 'should set cache-control header')
  })
})

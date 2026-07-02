import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { esbuildDev } from '../middleware/esbuild-dev.ts'
import type { Context } from '../types.ts'

const tmpDir = join(import.meta.dirname || '.', '.tmp-esbuild-dev')

const vendorCode = `
export { createElement, Fragment } from 'react'
export { hydrateRoot } from 'react-dom/client'
`

const clientCode = `
import { createElement as h } from 'react'
export function App() {
  return h('div', null, 'Hello from client')
}
`

const badCode = `
import { missingExport } from 'nonexistent-pkg-xyz-123'
export const msg: string = missingExport
`

describe('esbuildDev', () => {
  before(async () => {
    await mkdir(tmpDir, { recursive: true })
    await writeFile(join(tmpDir, 'vendor.ts'), vendorCode)
    await writeFile(join(tmpDir, 'client.ts'), clientCode)
    await writeFile(join(tmpDir, 'bad.ts'), badCode)
  })

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  const fakeNext = () => new Response('next')

  it('serves compiled vendor bundle', async () => {
    const mw = esbuildDev({
      entries: {
        '/assets/vendor.js': {
          entry: join(tmpDir, 'vendor.ts'),
          bundle: true,
          minify: false,
        },
      },
    }) as any

    const res = await mw(
      new Request('http://localhost/assets/vendor.js'),
      { params: {}, query: {} },
      fakeNext,
    )

    assert.equal(res.status, 200)
    assert.equal(res.headers.get('Content-Type'), 'text/javascript; charset=utf-8')

    const body = await res.text()
    assert.ok(body.includes('createElement'), 'should contain react export')
    assert.ok(body.includes('Fragment'), 'should contain react export')
    assert.ok(body.includes('hydrateRoot'), 'should contain react-dom export')
  })

  it('compiles client bundle with externals', async () => {
    const mw = esbuildDev({
      entries: {
        '/assets/client.js': {
          entry: join(tmpDir, 'client.ts'),
          bundle: true,
          external: ['react'],
          minify: false,
        },
      },
    }) as any

    const res = await mw(
      new Request('http://localhost/assets/client.js'),
      { params: {}, query: {} },
      fakeNext,
    )

    assert.equal(res.status, 200)
    const body = await res.text()
    assert.ok(body.includes('from "react"'), 'react should be external')
    assert.ok(body.includes('App'), 'should contain App')
  })

  it('returns importmap when importmap: true', async () => {
    const mw = esbuildDev({
      entries: {
        '/assets/vendor.js': { entry: join(tmpDir, 'vendor.ts') },
        '/assets/client.js': { entry: join(tmpDir, 'client.ts'), external: ['react'] },
      },
      importmap: true,
    }) as any

    const res = await mw(
      new Request('http://localhost/assets/importmap'),
      { params: {}, query: {} },
      fakeNext,
    )

    assert.equal(res.status, 200)
    const body = await res.text()
    assert.ok(body.includes('importmap'), 'should contain importmap')
    assert.ok(body.includes('react'), 'should map react')
    assert.ok(body.includes('/assets/vendor.js'), 'should map to vendor')
  })

  it('passes to next for unmatched routes', async () => {
    const mw = esbuildDev({
      entries: {
        '/assets/client.js': { entry: join(tmpDir, 'client.ts') },
      },
    }) as any

    const res = await mw(
      new Request('http://localhost/some-other-path'),
      { params: {}, query: {} },
      fakeNext,
    )

    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'next')
  })

  it('returns 500 with error page on build failure', async () => {
    const mw = esbuildDev({
      entries: {
        '/assets/bad.js': {
          entry: join(tmpDir, 'bad.ts'),
          bundle: true,
          minify: false,
        },
      },
    }) as any

    const res = await mw(
      new Request('http://localhost/assets/bad.js'),
      { params: {}, query: {} },
      fakeNext,
    )

    assert.equal(res.status, 500)
    assert.equal(res.headers.get('Content-Type'), 'text/html; charset=utf-8')
    const body = await res.text()
    assert.ok(body.includes('Build Error'), 'should show error page')
  })

  it('returns ETag and supports 304', async () => {
    const mw = esbuildDev({
      entries: {
        '/assets/etag.js': {
          entry: join(tmpDir, 'client.ts'),
          bundle: true,
          minify: false,
          external: ['react'],
        },
      },
    }) as any

    // First request — gets ETag
    const res1 = await mw(
      new Request('http://localhost/assets/etag.js'),
      { params: {}, query: {} },
      fakeNext,
    )
    assert.equal(res1.status, 200)
    const etag = res1.headers.get('ETag')
    assert.ok(etag, 'should have ETag')

    // Second request — sends If-None-Match → 304
    const res2 = await mw(
      new Request('http://localhost/assets/etag.js', {
        headers: { 'If-None-Match': etag! },
      }),
      { params: {}, query: {} },
      fakeNext,
    )
    assert.equal(res2.status, 304)
  })

  it('recompiles when source file changes', async () => {
    const entryFile = join(tmpDir, 'dynamic.ts')

    await writeFile(entryFile, `export const msg = 'version-1'`)

    const mw = esbuildDev({
      entries: {
        '/assets/dynamic.js': {
          entry: entryFile,
          bundle: true,
          minify: false,
        },
      },
      // Use memory cache explicitly
      cache: 'memory',
    }) as any

    // First compile
    const res1 = await mw(
      new Request('http://localhost/assets/dynamic.js'),
      { params: {}, query: {} },
      fakeNext,
    )
    const body1 = await res1.text()
    assert.ok(body1.includes('version-1'))

    // Modify the file
    await writeFile(entryFile, `export const msg = 'version-2'`)

    // Second compile — should pick up the change
    const res2 = await mw(
      new Request('http://localhost/assets/dynamic.js'),
      { params: {}, query: {} },
      fakeNext,
    )
    const body2 = await res2.text()
    assert.ok(body2.includes('version-2'), 'should recompile with new content')
  })

  it('string shorthand works for entries', async () => {
    const mw = esbuildDev({
      entries: {
        '/assets/string.js': join(tmpDir, 'client.ts'),
      },
    }) as any

    const res = await mw(
      new Request('http://localhost/assets/string.js'),
      { params: {}, query: {} },
      fakeNext,
    )

    assert.equal(res.status, 200)
    const body = await res.text()
    assert.ok(body.includes('App'), 'should compile with string entry')
  })

  it('custom errorTemplate is used', async () => {
    const mw = esbuildDev({
      entries: {
        '/assets/custom-err.js': { entry: join(tmpDir, 'bad.ts'), bundle: true },
      },
      errorTemplate: (errors) => `<custom>${errors}</custom>`,
    }) as any

    const res = await mw(
      new Request('http://localhost/assets/custom-err.js'),
      { params: {}, query: {} },
      fakeNext,
    )

    assert.equal(res.status, 500)
    const body = await res.text()
    assert.ok(body.includes('<custom>'), 'should use custom error template')
  })
})

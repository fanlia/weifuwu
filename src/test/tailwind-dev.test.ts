import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tailwindDev } from '../middleware/tailwind-dev.ts'

const tmpDir = join(import.meta.dirname || '.', '.tmp-tailwind-dev')

const inputCss = `@import "tailwindcss";\n`

const pageContent = `<div class="flex p-4 text-red-500 bg-blue-100 hover:bg-blue-200">
  <h1 class="text-2xl font-bold">Hello Tailwind</h1>
  <button class="px-4 py-2 rounded bg-blue-500 text-white">Click</button>
</div>`

describe('tailwindDev', () => {
  before(async () => {
    await mkdir(tmpDir, { recursive: true })
    await writeFile(join(tmpDir, 'input.css'), inputCss)
    await writeFile(join(tmpDir, 'page.ts'), pageContent)
  })

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  const fakeNext = () => new Response('next')

  it('serves compiled tailwind CSS', async () => {
    const mw = tailwindDev({
      entries: {
        '/assets/tailwind.css': {
          entry: join(tmpDir, 'input.css'),
          content: [join(tmpDir, 'page.ts')],
        },
      },
    }) as any

    const res = await mw(
      new Request('http://localhost/assets/tailwind.css'),
      { params: {}, query: {} },
      fakeNext,
    )

    assert.equal(res.status, 200)
    assert.equal(res.headers.get('Content-Type'), 'text/css; charset=utf-8')

    const body = await res.text()
    assert.ok(body.includes('tailwindcss'), 'should include tailwindcss header')
    assert.ok(body.includes('@layer'), 'should include CSS layers')
    assert.ok(body.includes('--font-sans'), 'should include theme variables')

    // Check that scanned class names generated styles
    assert.ok(body.includes('.flex'), 'should include .flex')
    assert.ok(body.includes('.p-4'), 'should include .p-4')
    assert.ok(body.includes('.text-red-500'), 'should include .text-red-500')
  })

  it('returns ETag and supports 304', async () => {
    const mw = tailwindDev({
      entries: {
        '/assets/tailwind.css': {
          entry: join(tmpDir, 'input.css'),
          content: [join(tmpDir, 'page.ts')],
        },
      },
    }) as any

    // First request
    const res1 = await mw(
      new Request('http://localhost/assets/tailwind.css'),
      { params: {}, query: {} },
      fakeNext,
    )
    assert.equal(res1.status, 200)
    const etag = res1.headers.get('ETag')
    assert.ok(etag, 'should have ETag')

    // Second request with ETag
    const res2 = await mw(
      new Request('http://localhost/assets/tailwind.css', {
        headers: { 'If-None-Match': etag! },
      }),
      { params: {}, query: {} },
      fakeNext,
    )
    assert.equal(res2.status, 304)
  })

  it('recompiles when CSS entry changes', async () => {
    const entryFile = join(tmpDir, 'dynamic.css')
    const contentFile = join(tmpDir, 'dynamic-page.ts')

    await writeFile(entryFile, '@import "tailwindcss";\n')
    await writeFile(contentFile, '<div class="text-green-500">green</div>')

    const mw = tailwindDev({
      entries: {
        '/assets/dynamic.css': {
          entry: entryFile,
          content: [contentFile],
        },
      },
      cache: 'memory',
    }) as any

    // First compile — should have text-green-500
    const res1 = await mw(
      new Request('http://localhost/assets/dynamic.css'),
      { params: {}, query: {} },
      fakeNext,
    )
    const body1 = await res1.text()
    assert.ok(body1.includes('.text-green-500'), 'should include green')

    // Change the content file
    await writeFile(contentFile, '<div class="text-blue-500">blue</div>')

    // Second compile — should now have text-blue-500
    const res2 = await mw(
      new Request('http://localhost/assets/dynamic.css'),
      { params: {}, query: {} },
      fakeNext,
    )
    const body2 = await res2.text()
    assert.ok(body2.includes('.text-blue-500'), 'should include blue after change')
  })

  it('passes to next for unmatched routes', async () => {
    const mw = tailwindDev({
      entries: {
        '/assets/tailwind.css': { entry: join(tmpDir, 'input.css') },
      },
    }) as any

    const res = await mw(
      new Request('http://localhost/other.css'),
      { params: {}, query: {} },
      fakeNext,
    )

    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'next')
  })

  it('string shorthand works for entries', async () => {
    const mw = tailwindDev({
      entries: {
        '/assets/short.css': join(tmpDir, 'input.css'),
      },
    }) as any

    const res = await mw(
      new Request('http://localhost/assets/short.css'),
      { params: {}, query: {} },
      fakeNext,
    )

    assert.equal(res.status, 200)
    const body = await res.text()
    assert.ok(body.includes('tailwindcss'), 'should compile with string entry')
  })

  it('returns 500 with error page on missing CSS entry', async () => {
    const mw = tailwindDev({
      entries: {
        '/assets/missing.css': { entry: join(tmpDir, 'nonexistent.css') },
      },
    }) as any

    const res = await mw(
      new Request('http://localhost/assets/missing.css'),
      { params: {}, query: {} },
      fakeNext,
    )

    assert.equal(res.status, 500)
    assert.equal(res.headers.get('Content-Type'), 'text/html; charset=utf-8')
    const body = await res.text()
    assert.ok(body.includes('Build Error'), 'should show error page')
  })

  it('custom errorTemplate is used', async () => {
    const mw = tailwindDev({
      entries: {
        '/assets/custom-err.css': { entry: join(tmpDir, 'nonexistent.css') },
      },
      errorTemplate: (errors) => `<custom-tailwind>${errors}</custom-tailwind>`,
    }) as any

    const res = await mw(
      new Request('http://localhost/assets/custom-err.css'),
      { params: {}, query: {} },
      fakeNext,
    )

    assert.equal(res.status, 500)
    const body = await res.text()
    assert.ok(body.includes('<custom-tailwind>'), 'should use custom error template')
  })

  it('generates base theme CSS even without content', async () => {
    const mw = tailwindDev({
      entries: {
        '/assets/base.css': { entry: join(tmpDir, 'input.css') },
      },
    }) as any

    const res = await mw(
      new Request('http://localhost/assets/base.css'),
      { params: {}, query: {} },
      fakeNext,
    )

    assert.equal(res.status, 200)
    const body = await res.text()
    assert.ok(body.includes('@layer theme'), 'should include theme layer')
    assert.ok(body.includes('@layer base'), 'should include base layer')
  })
})

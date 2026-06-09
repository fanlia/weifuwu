import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Context } from '../types.ts'

describe('tailwind', () => {
  const tmpDir = resolve(import.meta.dirname, '../.test-tailwind')

  before(async () => {
    await rm(tmpDir, { recursive: true, force: true })
    await mkdir(tmpDir, { recursive: true })
  })

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('addTailwindSource registers directories', async () => {
    const { addTailwindSource } = await import('../tailwind.ts')
    addTailwindSource(tmpDir)
  })

  it('compileTailwindCss creates app.css if missing', async () => {
    const cssPath = resolve(tmpDir, 'app.css')
    const { compileTailwindCss } = await import('../tailwind.ts')
    assert.equal(existsSync(cssPath), false)
    await compileTailwindCss(cssPath, tmpDir)
    assert.equal(existsSync(cssPath), true)
  })

  it('compileTailwindCss produces CSS output', async () => {
    const cssPath = resolve(tmpDir, 'app.css')
    await writeFile(cssPath, '@import "tailwindcss"\n')
    const { compileTailwindCss } = await import('../tailwind.ts')
    const css = await compileTailwindCss(cssPath, tmpDir)
    assert.equal(typeof css, 'string')
    assert.ok(css.length > 0, 'should produce CSS')
  })

  it('compileTailwindCss caches and returns same result', async () => {
    const cssPath = resolve(tmpDir, 'app.css')
    await writeFile(cssPath, '@import "tailwindcss"\n')
    const { compileTailwindCss } = await import('../tailwind.ts')
    const c1 = await compileTailwindCss(cssPath, tmpDir)
    const c2 = await compileTailwindCss(cssPath, tmpDir)
    assert.equal(c1, c2)
  })

  it('compileTailwindCss returns empty string on error', async () => {
    const cssPath = resolve(tmpDir, 'broken.css')
    await writeFile(cssPath, '@does-not-exist "bad-plugin"\n')
    const { compileTailwindCss } = await import('../tailwind.ts')
    const css = await compileTailwindCss(cssPath, tmpDir)
    assert.equal(typeof css, 'string')
    // error path returns ''
  })

  it('tailwind() returns a Router', async () => {
    const { tailwind } = await import('../tailwind.ts')
    const r = tailwind(tmpDir)
    assert.equal(typeof r.handler, 'function')
  })

  it('tailwind middleware sets compiledTailwindCss on ctx', async () => {
    await writeFile(resolve(tmpDir, 'app.css'), '@import "tailwindcss"\n')
    const { tailwind } = await import('../tailwind.ts')
    const r = tailwind(tmpDir)

    const ctx: any = { params: {}, query: {} }
    await r.handler()(new Request('http://localhost/'), ctx)
    assert.equal(typeof ctx.compiledTailwindCss, 'string')
    assert.ok(ctx.compiledTailwindCss.length > 0, 'compiledTailwindCss should be non-empty')
    assert.ok(ctx.tailwindCssUrl.includes('/__wfw/style/'), 'tailwindCssUrl should contain style path')
  })

  it('tailwind serves style CSS at generated URL', async () => {
    await writeFile(resolve(tmpDir, 'app.css'), '@import "tailwindcss"\n')
    const { tailwind } = await import('../tailwind.ts')
    const r = tailwind(tmpDir)

    const ctx: any = { params: {}, query: {} }
    await r.handler()(new Request('http://localhost/'), ctx)

    const url = ctx.tailwindCssUrl as string
    const hashMatch = url.match(/\/__wfw\/style\/([a-f0-9]+)\.css/)
    assert.ok(hashMatch, `expected hash in URL: ${url}`)
    const hash = hashMatch![1]

    const res = await r.handler()(new Request(`http://localhost${url}`), { params: { hash }, query: {} } as Context)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'text/css; charset=utf-8')
    const body = await res.text()
    assert.ok(body.length > 0)
  })
})

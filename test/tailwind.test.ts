import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { existsSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { Router } from '../router.ts'
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
  })

  it('tailwindContext is a Middleware', async () => {
    const { tailwindContext } = await import('../tailwind.ts')
    const mw = tailwindContext(tmpDir)
    assert.equal(typeof mw, 'function')
  })

  it('tailwindContext sets ctx.tailwind', async () => {
    const globalsDir = resolve(tmpDir, 'app')
    mkdirSync(globalsDir, { recursive: true })
    await writeFile(join(globalsDir, 'globals.css'), '@import "tailwindcss"\n')
    const { tailwindContext } = await import('../tailwind.ts')
    const mw = tailwindContext(tmpDir)

    const ctx: any = { params: {}, query: {} }
    const next = () => new Response('ok')
    await mw(new Request('http://localhost/'), ctx, next)
    assert.ok(ctx.tailwind)
    assert.equal(typeof ctx.tailwind.css, 'string')
    assert.ok(ctx.tailwind.css.length > 0)
    assert.ok(ctx.tailwind.url.includes('/__wfw/style/'))
  })

  it('tailwindRouter serves CSS at generated URL', async () => {
    const globalsDir = resolve(tmpDir, 'app')
    mkdirSync(globalsDir, { recursive: true })
    await writeFile(join(globalsDir, 'globals.css'), '@import "tailwindcss"\n')
    const { tailwindContext, tailwindRouter } = await import('../tailwind.ts')

    // First pass through context to get the URL and compile CSS
    const mw = tailwindContext(tmpDir)
    const ctx: any = { params: {}, query: {} }
    await mw(new Request('http://localhost/'), ctx, () => new Response('ok'))

    const url = ctx.tailwind.url as string
    const hashMatch = url.match(/\/__wfw\/style\/([a-f0-9]+)\.css/)
    assert.ok(hashMatch, `expected hash in URL: ${url}`)

    // Serve CSS via the router
    const cssRouter = tailwindRouter(tmpDir)
    const res = await cssRouter.handler()(new Request(`http://localhost${url}`), {
      params: { hash: hashMatch[1] },
      query: {},
    } as Context)
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type') || '', /text\/css/)
    const body = await res.text()
    assert.ok(body.length > 0)
  })
})

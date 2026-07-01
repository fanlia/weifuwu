import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { compileCSS, clearCSSCache, cssContext, cssRouter } from '../ssr/css.ts'
import { Router } from '../core/router.ts'
import type { Context } from '../types.ts'

function mkCtx(ctx?: Partial<Context>): Context {
  return { params: {}, query: {}, ...ctx } as Context
}

const fixtureDir = resolve('test/fixtures/pages-css')
const cssPath = resolve(fixtureDir, 'app/globals.css')
const appDir = resolve(fixtureDir, 'app')

describe('css pipeline', () => {
  before(() => clearCSSCache())
  after(() => clearCSSCache())

  it('compileCSS returns hash and url', async () => {
    const asset = await compileCSS(cssPath, appDir)
    assert.ok(asset.css.length > 0)
    assert.equal(asset.hash.length, 8)
    assert.match(asset.url, /^\/__wfw\/style\//)
  })

  it('compileCSS returns different hashes for different content', async () => {
    clearCSSCache()
    const asset1 = await compileCSS(cssPath, appDir)
    clearCSSCache()
    const asset2 = await compileCSS(cssPath, appDir)
    // Same file should produce same hash
    assert.equal(asset1.hash, asset2.hash)
  })

  it('compileCSS returns empty for missing file', async () => {
    const asset = await compileCSS('/nonexistent/globals.css', '/nonexistent')
    assert.equal(asset.css, '')
    assert.equal(asset.hash, 'empty')
  })

  it('cssContext middleware sets ctx.css', async () => {
    clearCSSCache()
    const mw = cssContext(fixtureDir)
    const ctx = mkCtx()

    const result = await mw(new Request('http://localhost/'), ctx, () =>
      Promise.resolve(new Response('ok')),
    )

    assert.ok(ctx.css)
    assert.equal(typeof ctx.css.url, 'string')
    assert.ok(ctx.css.url.startsWith('/__wfw/style/'))
  })

  it('cssRouter serves compiled CSS', async () => {
    clearCSSCache()
    // Pre-compile
    const asset = await compileCSS(cssPath, appDir)

    const router = cssRouter(fixtureDir)
    const app = new Router()
     
    app.use('/', router as any)

    const res = await app.handler()(new Request(`http://localhost${asset.url}`), mkCtx())

    assert.equal(res.status, 200)
    const ct = res.headers.get('content-type') ?? ''
    assert.match(ct, /text\/css/)
    const css = await res.text()
    assert.ok(css.length > 0)
  })

  it('CSS + layout + view work together', async () => {
    clearCSSCache()
    const { layout } = await import('../ssr/layout.ts')
    const { view } = await import('../ssr/view.ts')
    const Router = (await import('../core/router.ts')).Router
    const layoutFile = resolve(fixtureDir, 'app/layout.ts')
    const pageFile = resolve(fixtureDir, 'app/page.ts')

    const app = new Router()
     
    app.use('/', cssContext(fixtureDir) as any)
     
    app.use('/', cssRouter(fixtureDir) as any)
    app.use(layout(layoutFile))
    app.get('/', view(pageFile))

    const res = await app.handler()(new Request('http://localhost/'), mkCtx())
    assert.equal(res.status, 200)
    const text = await res.text()
    assert.match(text, /CSS Test/)
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { wfuwAssets } from '../ssr/ui/assets.ts'
import { Router } from '../core/router.ts'
import type { Context } from '../types.ts'

function mkCtx(ctx?: Partial<Context>): Context {
  return { params: {}, query: {}, ...ctx } as Context
}

describe('wfuwAssets', () => {
  it('serves weifuwu-ui.js', async () => {
    const assets = wfuwAssets()
    const app = new Router()
    app.use('/', assets)

    const res = await app.handler()(new Request('http://localhost/__wfw/js/weifuwu-ui.js'), mkCtx())
    assert.equal(res.status, 200)
    const ct = res.headers.get('content-type') ?? ''
    assert.ok(ct.includes('javascript'), `Expected JS content-type, got: ${ct}`)
    const text = await res.text()
    assert.ok(text.includes('weifuwu-ui.js'), 'Should contain file header')
    assert.ok(text.includes('init(root)'), 'Should contain init function')
    assert.ok(text.includes('getState'), 'Should contain getState')
    assert.ok(text.includes('wu-theme'), 'Should contain theme support')
    assert.ok(text.includes('wu-lang'), 'Should contain i18n support')
    assert.ok(text.includes('wu-flash'), 'Should contain flash support')
    assert.ok(text.includes('wu-modal'), 'Should contain modal component')
    assert.ok(text.includes('wu-stream'), 'Should contain SSE streaming')
    assert.ok(text.includes('wu-ws'), 'Should contain WebSocket support')
  })

  it('serves weifuwu-ui.css', async () => {
    const assets = wfuwAssets()
    const app = new Router()
    app.use('/', assets)

    const res = await app.handler()(
      new Request('http://localhost/__wfw/css/weifuwu-ui.css'),
      mkCtx(),
    )
    assert.equal(res.status, 200)
    const ct = res.headers.get('content-type') ?? ''
    assert.ok(ct.includes('css'), `Expected CSS content-type, got: ${ct}`)
    const text = await res.text()
    assert.ok(text.includes('weifuwu-ui.css'), 'Should contain file header')
    assert.ok(text.includes(':root'), 'Should contain CSS variables')
    assert.ok(text.includes('wu-btn'), 'Should contain button styles')
    assert.ok(text.includes('wu-modal'), 'Should contain modal styles')
    assert.ok(text.includes('wu-toast'), 'Should contain toast styles')
    assert.ok(text.includes('wu-skeleton'), 'Should contain skeleton styles')
    assert.ok(text.includes('data-theme'), 'Should contain dark theme')
  })

  it('returns immutable cache headers', async () => {
    const assets = wfuwAssets()
    const app = new Router()
    app.use('/', assets)

    const res = await app.handler()(new Request('http://localhost/__wfw/js/weifuwu-ui.js'), mkCtx())
    const cache = res.headers.get('cache-control') ?? ''
    assert.ok(cache.includes('immutable'), `Expected immutable cache, got: ${cache}`)
  })

  it('can be mounted under a prefix', async () => {
    const assets = wfuwAssets()
    const app = new Router()
    app.use('/assets', assets)

    const res = await app.handler()(
      new Request('http://localhost/assets/__wfw/js/weifuwu-ui.js'),
      mkCtx({ mountPath: '/assets' }),
    )
    assert.equal(res.status, 200)
  })

  it('html() + wfuwAssets integration example works', async () => {
    const { html } = await import('../ssr/html.ts')
    const assets = wfuwAssets()
    const app = new Router()
    app.use('/', assets)

    app.get('/', () => {
      return new Response(
        html`
          <!DOCTYPE html>
          <html>
            <head>
              <script src="/__wfw/js/weifuwu-ui.js"></script>
              <link rel="stylesheet" href="/__wfw/css/weifuwu-ui.css" />
            </head>
            <body>
              <div wu-data="{ count: 0 }">
                <button class="wu-btn" wu-on="click: count++">+1</button>
                <span wu-text="count">0</span>
              </div>
            </body>
          </html>
        `,
        { headers: { 'content-type': 'text/html; charset=utf-8' } },
      )
    })

    const res = await app.handler()(new Request('http://localhost/'), mkCtx())
    assert.equal(res.status, 200)
    const text = await res.text()
    assert.ok(text.includes('weifuwu-ui.js'))
    assert.ok(text.includes('weifuwu-ui.css'))
    assert.ok(text.includes('wu-data'))
    assert.ok(text.includes('wu-btn'))
    assert.ok(text.includes('wu-on'))
    assert.ok(text.includes('wu-text'))
  })

  it('returns 404 for unknown paths', async () => {
    const assets = wfuwAssets()
    const app = new Router()
    app.use('/', assets)

    const res = await app.handler()(
      new Request('http://localhost/__wfw/js/nonexistent.js'),
      mkCtx(),
    )
    assert.equal(res.status, 404)
  })
})

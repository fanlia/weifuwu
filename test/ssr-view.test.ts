import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { view } from '../ssr/view.ts'
import { clearModuleCache } from '../ssr/compile.ts'
import type { Context } from '../types.ts'

function mkCtx(ctx?: Partial<Context>): Context {
  return { params: {}, query: {}, ...ctx } as Context
}

const simplePage = resolve('test/fixtures/view/simple-page.ts')
const ctxPage = resolve('test/fixtures/view/ctx-page.ts')
const redirectPage = resolve('test/fixtures/view/redirect-page.ts')
const noDefault = resolve('test/fixtures/view/no-default.ts')

describe('view() — page handler factory', () => {
  afterEach(() => {
    clearModuleCache()
  })

  it('renders a simple page', async () => {
    const handler = view(simplePage)
    const res = await handler(new Request('http://localhost/'), mkCtx())

    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type') ?? '', /text\/html/)
    const text = await res.text()
    assert.equal(text, '<h1>Simple Page</h1>')
  })

  it('passes ctx to the render function', async () => {
    const handler = view(ctxPage)
    const res = await handler(
      new Request('http://localhost/blog/hello'),
      mkCtx({ params: { slug: 'hello' } }),
    )

    assert.equal(res.status, 200)
    const text = await res.text()
    assert.equal(text, '<h1>hello</h1>')
  })

  it('passes ctx with default params', async () => {
    const handler = view(ctxPage)
    const res = await handler(new Request('http://localhost/'), mkCtx())

    assert.equal(res.status, 200)
    const text = await res.text()
    assert.equal(text, '<h1>default</h1>')
  })

  it('supports returning a Response for redirects', async () => {
    const handler = view(redirectPage)
    const res = await handler(new Request('http://localhost/'), mkCtx())

    assert.equal(res.status, 302)
    assert.equal(res.headers.get('Location'), '/login')
  })

  it('throws if module has no default export', async () => {
    const handler = view(noDefault)
    await assert.rejects(
      () => handler(new Request('http://localhost/'), mkCtx()),
      /must export a default function/,
    )
  })

  it('caches the module across calls', async () => {
    const handler = view(simplePage)
    const res1 = await handler(new Request('http://localhost/'), mkCtx())
    const res2 = await handler(new Request('http://localhost/'), mkCtx())

    assert.equal(await res1.text(), '<h1>Simple Page</h1>')
    assert.equal(await res2.text(), '<h1>Simple Page</h1>')
  })

  it('works with layout middleware wrapping the result', async () => {
    const { Router } = await import('../core/router.ts')
    const { layout } = await import('../ssr/layout.ts')
    const rootLayout = resolve('test/fixtures/ssr-layout/root/layout.ts')

    const app = new Router()
    app.use(layout(rootLayout))
    app.get('/', view(simplePage))

    const res = await app.handler()(new Request('http://localhost/'), mkCtx())
    assert.equal(res.status, 200)
    const text = await res.text()
    assert.match(text, /<body><h1>Simple Page<\/h1><\/body>/)
  })

  it('works with nested layouts', async () => {
    const { Router } = await import('../core/router.ts')
    const { layout } = await import('../ssr/layout.ts')
    const rootLayout = resolve('test/fixtures/ssr-layout/root/layout.ts')
    const blogLayout = resolve('test/fixtures/ssr-layout/blog/layout.ts')

    const app = new Router()
    app.use(layout(rootLayout))
    app.use(layout(blogLayout))
    app.get('/', view(simplePage))

    const res = await app.handler()(new Request('http://localhost/'), mkCtx())
    const text = await res.text()
    assert.match(text, /<nav>Nav<\/nav><main><h1>Simple Page<\/h1><\/main>/)
    assert.match(text, /<body><nav>Nav<\/nav><main><h1>Simple Page<\/h1><\/main><\/body>/)
  })
})

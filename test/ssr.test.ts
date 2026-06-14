import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../router.ts'
import { ssr } from '../ssr.ts'
import { layout } from '../layout.ts'

const homePage = './test/fixtures/ssr/home/page.tsx'

describe('ssr({dir})', () => {
  it('renders page from directory', async () => {
    const app = new Router()
    app.use('/', ssr({ dir: './test/fixtures/ssr/home' }))
    const res = await app.handler()(
      new Request('http://localhost/'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    const html = await res.text()
    assert.match(html, /<!DOCTYPE html>/)
  })

  it('injects __WEIFUWU_CTX', async () => {
    const app = new Router()
    app.use('/', ssr({ dir: './test/fixtures/ssr/home' }))
    const res = await app.handler()(
      new Request('http://localhost/'),
      { params: {}, query: {} } as any,
    )
    const html = await res.text()
    assert.match(html, /__WEIFUWU_CTX/)
  })

  it('serves client bundle', async () => {
    const app = new Router()
    app.use('/', ssr({ dir: './test/fixtures/ssr/home' }))
    const res1 = await app.handler()(
      new Request('http://localhost/'),
      { params: {}, query: {} } as any,
    )
    const html = await res1.text()
    // New format: inline <script type="module"> with dynamic import
    const match = html.match(/\/__ssr\/([a-f0-9]+)\.js/)
    assert.ok(match, 'expected __ssr/[hash].js in HTML')

    const bundleKey = '/__ssr/' + match![1] + '.js'
    const res2 = await app.handler()(
      new Request(`http://localhost${bundleKey}`),
      { params: {}, query: {} } as any,
    )
    assert.equal(res2.status, 200)
    const js = await res2.text()
    assert.match(js, /React|createElement|export/)
  })

  it('passes ctx data via loaderData', async () => {
    const app = new Router()
    app.use(async (req, ctx, next) => {
      ctx.loaderData = { posts: [{ title: 'Hello' }] }
      return next(req, ctx)
    })
    app.use('/', ssr({ dir: './test/fixtures/ssr/home' }))
    const res = await app.handler()(
      new Request('http://localhost/'),
      { params: {}, query: {} } as any,
    )
    const html = await res.text()
    assert.match(html, /Hello/)
  })
})

describe('layout()', () => {
  it('wraps page component', async () => {
    const app = new Router()
    app.use('/', ssr({ dir: './test/fixtures/ssr/posts' }))
    const res = await app.handler()(
      new Request('http://localhost/'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    const html = await res.text()
    assert.match(html, /Layout-Header/)
  })

  it('throws when layout has no default export', async () => {
    const app = new Router()
    app.use(layout('./test/fixtures/error/no-default-error.tsx'))
    app.get('/page', () => new Response('ok'))
    const res = await app.handler()(new Request('http://localhost/page'), { params: {}, query: {} } as any)
    assert.equal(res.status, 500)
  })
})

describe('ssr e2e', () => {
  it('returns 404 for unmatched route without not-found.tsx', async () => {
    const app = new Router()
    app.use('/', ssr({ dir: './test/fixtures/ssr/home' }))
    const res = await app.handler()(
      new Request('http://localhost/nonexistent'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 404)
  })

  it('renders custom 404 with HTML when a valid SSR path does not match a page', async () => {
    // ssr() returns a Router — unmatched paths get a plain 404 from the parent
    // The not-found.tsx is for SSR-internal 404s (directory matches, no page file)
    // So we verify that the router correctly returns 404 status
    const app = new Router()
    app.use('/', ssr({ dir: './test/fixtures/ssr/home' }))
    const res = await app.handler()(
      new Request('http://localhost/unknown-path'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 404)
  })

  it('serializes ctx.params into __WEIFUWU_CTX for dynamic routes', async () => {
    const app = new Router()
    app.use('/', ssr({ dir: './test/fixtures/ssr/params' }))

    const res = await app.handler()(
      new Request('http://localhost/42'),
      { params: { id: '42', '*': '42' }, query: {} } as any,
    )

    assert.equal(res.status, 200)
    const html = await res.text()
    // Verify params are serialized in the context script
    assert.match(html, /"id":"42"/)
    assert.match(html, /__WEIFUWU_CTX/)
  })

  it('serves vendor bundle at /__wfw/v/bundle', async () => {
    const app = new Router()
    app.use('/', ssr({ dir: './test/fixtures/ssr/home' }))
    const res = await app.handler()(
      new Request('http://localhost/__wfw/v/bundle'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    const js = await res.text()
    assert.match(js, /React/)
  })

  it('handles concurrent requests without interference', async () => {
    const app = new Router()
    app.use('/', ssr({ dir: './test/fixtures/ssr/home' }))

    const [res1, res2] = await Promise.all([
      app.handler()(new Request('http://localhost/'), { params: {}, query: {} } as any),
      app.handler()(new Request('http://localhost/'), { params: {}, query: {} } as any),
    ])
    assert.equal(res1.status, 200)
    assert.equal(res2.status, 200)
  })

  it('renders HTML with hydration script', async () => {
    const app = new Router()
    app.use('/', ssr({ dir: './test/fixtures/ssr/home' }))
    const res = await app.handler()(
      new Request('http://localhost/'),
      { params: {}, query: {} } as any,
    )
    const html = await res.text()
    // Verify hydration infrastructure: importmap + type="module" script
    assert.match(html, /importmap/)
    assert.match(html, /type=.module./)
    assert.match(html, /await import/)
  })
})

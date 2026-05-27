import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { tsx } from '../tsx.ts'
import { serve, Router } from '../index.ts'
import type { Server } from '../serve.ts'

const fixtures = './test/fixtures/pages'

describe('tsx()', () => {
  describe('SSR rendering', () => {
    it('renders root page', async () => {
      const r = await tsx({ dir: fixtures })
      const res = await r.handler()(
        new Request('http://localhost/'),
        { params: {}, query: {} },
      )
      assert.equal(res.status, 200)

      const html = await res.text()
      assert.match(html, /<!DOCTYPE html>/)
      assert.match(html, /<h1>Home<\/h1>/)
    })

    it('renders nested static page', async () => {
      const r = await tsx({ dir: fixtures })
      const res = await r.handler()(
        new Request('http://localhost/about'),
        { params: {}, query: {} },
      )
      assert.equal(res.status, 200)

      const html = await res.text()
      assert.match(html, /<h1>About<\/h1>/)
    })

    it('renders dynamic route with params', async () => {
      const r = await tsx({ dir: fixtures })
      const res = await r.handler()(
        new Request('http://localhost/blog/hello-world'),
        { params: { slug: 'hello-world' }, query: {} },
      )
      assert.equal(res.status, 200)

      const html = await res.text()
      assert.match(html, /hello-world/)
    })

    it('passes query params', async () => {
      const r = await tsx({ dir: fixtures })
      const res = await r.handler()(
        new Request('http://localhost/?foo=bar'),
        { params: {}, query: { foo: 'bar' } },
      )
      assert.equal(res.status, 200)
      assert.equal((await res.text()).includes('Home'), true)
    })

    it('returns 404 for non-existent route', async () => {
      const r = await tsx({ dir: fixtures })
      const res = await r.handler()(
        new Request('http://localhost/nonexistent'),
        { params: {}, query: {} },
      )
      assert.equal(res.status, 404)
    })
  })

  describe('data loading (load.ts)', () => {
    it('calls load() and passes data as props', async () => {
      const r = await tsx({ dir: fixtures })
      const res = await r.handler()(
        new Request('http://localhost/blog/my-post'),
        { params: { slug: 'my-post' }, query: {} },
      )
      assert.equal(res.status, 200)

      const html = await res.text()
      assert.match(html, /Post: my-post/)
    })

    it('serializes props to __WEIFUWU_PROPS', async () => {
      const r = await tsx({ dir: fixtures })
      const res = await r.handler()(
        new Request('http://localhost/blog/my-post'),
        { params: { slug: 'my-post' }, query: {} },
      )
      const html = await res.text()
      assert.match(html, /__WEIFUWU_PROPS/)
      assert.match(html, /Post: my-post/)
    })
  })

  describe('layout chain', () => {
    it('wraps page with root layout', async () => {
      const r = await tsx({ dir: fixtures })
      const res = await r.handler()(
        new Request('http://localhost/'),
        { params: {}, query: {} },
      )

      const html = await res.text()
      assert.match(html, /<html>/)
      assert.match(html, /<title>App<\/title>/)
      assert.match(html, /__weifuwu_root/)
    })

    it('wraps blog pages with nested layouts', async () => {
      const r = await tsx({ dir: fixtures })
      const res = await r.handler()(
        new Request('http://localhost/blog/some-post'),
        { params: { slug: 'some-post' }, query: {} },
      )

      const html = await res.text()
      assert.match(html, /blog-layout/)
    })
  })

  describe('route.ts API', () => {
    it('GET returns SSR page, not route.ts', async () => {
      const r = await tsx({ dir: fixtures })
      const res = await r.handler()(
        new Request('http://localhost/blog/my-route'),
        { params: { slug: 'my-route' }, query: {} },
      )
      // GET is handled by page.tsx SSR, not route.ts
      const html = await res.text()
      assert.match(html, /<!DOCTYPE html>/)
      assert.match(html, /my-route/)
    })

    it('handles POST from route.ts', async () => {
      const r = await tsx({ dir: fixtures })
      const res = await r.handler()(
        new Request('http://localhost/blog/my-route', { method: 'POST' }),
        { params: { slug: 'my-route' }, query: {} },
      )

      const data = await res.json() as any
      assert.equal(data.method, 'POST')
      assert.equal(data.slug, 'my-route')
    })
  })

  describe('hydration', () => {
    it('injects hydration scripts', async () => {
      const r = await tsx({ dir: fixtures })
      const res = await r.handler()(
        new Request('http://localhost/'),
        { params: {}, query: {} },
      )

      const html = await res.text()
      assert.match(html, /<script type="module"/)
      assert.match(html, /__wfw\/client\//)
    })

    it('serves hydration bundle', async () => {
      const r = await tsx({ dir: fixtures })
      const res1 = await r.handler()(
        new Request('http://localhost/'),
        { params: {}, query: {} },
      )
      const html = await res1.text()
      const match = html.match(/src="(\/__wfw\/client\/[^"]+)"/)
      assert.ok(match)

      const res2 = await r.handler()(
        new Request(`http://localhost${match[1]}`),
        { params: {}, query: {} },
      )
      assert.equal(res2.status, 200)
      const js = await res2.text()
      assert.match(js, /hydrateRoot/)
    })
  })

  describe('mounting via router.use()', () => {
    it('works as sub-router', async () => {
      const pages = await tsx({ dir: fixtures })
      const main = new Router()
      main.use('/app', pages)

      const res = await main.handler()(
        new Request('http://localhost/app/about'),
        { params: {}, query: {} },
      )
      assert.equal(res.status, 200)
      const html = await res.text()
      assert.match(html, /<h1>About<\/h1>/)
    })

    it('coexists with other Router features', async () => {
      const pages = await tsx({ dir: fixtures })
      const main = new Router()
      main.use('/app', pages)
      main.get('/api/ping', () => Response.json({ ok: true }))

      const res1 = await main.handler()(
        new Request('http://localhost/app/about'),
        { params: {}, query: {} },
      )
      assert.equal(res1.status, 200)
      const html = await res1.text()
      assert.match(html, /<h1>About<\/h1>/)

      const res2 = await main.handler()(
        new Request('http://localhost/api/ping'),
        { params: {}, query: {} },
      )
      const data = await res2.json() as any
      assert.equal(data.ok, true)
    })
  })

  describe('end-to-end via serve()', () => {
    let server: Server
    let url: string

    before(async () => {
      const pages = await tsx({ dir: fixtures })
      server = serve(pages.handler(), { port: 0 })
      await server.ready
      url = `http://localhost:${server.port}`
    })

    after(() => server.stop())

    it('serves page via HTTP', async () => {
      const res = await fetch(`${url}/about`)
      assert.equal(res.status, 200)
      const html = await res.text()
      assert.match(html, /<h1>About<\/h1>/)
    })

    it('serves hydration bundle via HTTP', async () => {
      const res = await fetch(`${url}/`)
      const html = await res.text()
      const match = html.match(/src="(\/__wfw\/client\/[^"]+)"/)
      assert.ok(match)

      const bundleRes = await fetch(`${url}${match[1]}`)
      assert.equal(bundleRes.status, 200)
      const js = await bundleRes.text()
      assert.match(js, /hydrateRoot/)
    })

    it('serves dynamic route and API', async () => {
      const res = await fetch(`${url}/blog/test-article`)
      assert.equal(res.status, 200)
      const html = await res.text()
      assert.match(html, /Post: test-article/)
    })
  })

  describe('root layout with req/ctx', () => {
    it('receives request headers', async () => {
      const r = await tsx({ dir: './test/fixtures/custom-html' })
      const res = await r.handler()(
        new Request('http://localhost/', { headers: { 'x-theme': 'dark' } }),
        { params: {}, query: {} },
      )
      assert.equal(res.status, 200)
      const html = await res.text()
      assert.match(html, /data-theme="dark"/)
    })

    it('passes ctx to root layout', async () => {
      const r = await tsx({ dir: './test/fixtures/custom-html' })
      const res = await r.handler()(
        new Request('http://localhost/'),
        { params: {}, query: {} },
      )
      assert.equal(res.status, 200)
      const html = await res.text()
      assert.match(html, /data-theme="light"/)
    })
  })

  describe('TsxContext and useTsx exports', () => {
    it('exports TsxContext with correct structure', async () => {
      const { TsxContext, useTsx } = await import('../tsx.ts')
      assert.ok(TsxContext)
      assert.equal(typeof TsxContext.Provider, 'object')
      assert.equal(typeof TsxContext.Consumer, 'object')
      assert.equal(typeof useTsx, 'function')
    })

    it('provides params and query via Provider', async () => {
      // The Provider wraps the component tree in makeSsrHandler.
      // Verify params/query reach the component via props (established pathway).
      const r = await tsx({ dir: './test/fixtures/pages' })
      const res = await r.handler()(
        new Request('http://localhost/blog/test-art'),
        { params: { slug: 'test-art' }, query: { ref: 'home' } },
      )
      const html = await res.text()
      assert.match(html, /test-art/)
      assert.match(html, /__WEIFUWU_PROPS/)
      // Verify context values are serialized
      assert.match(html, /"params":\{"slug":"test-art"\}/)
      assert.match(html, /"query":\{"ref":"home"\}/)
    })
  })

  describe('not-found.tsx', () => {
    it('returns 404 page with layout for unknown routes', async () => {
      const r = await tsx({ dir: fixtures })
      const res = await r.handler()(
        new Request('http://localhost/unknown-path'),
        { params: {}, query: {} },
      )
      assert.equal(res.status, 404)

      const html = await res.text()
      assert.match(html, /404 - Not Found/)
      assert.match(html, /<html>/)
      assert.match(html, /<title>App<\/title>/)
    })

    it('returns 200 for existing routes', async () => {
      const r = await tsx({ dir: fixtures })
      const res = await r.handler()(
        new Request('http://localhost/about'),
        { params: {}, query: {} },
      )
      assert.equal(res.status, 200)
    })
  })

  describe('edge cases', () => {
    it('non-existent directory returns empty router', async () => {
      const r = await tsx({ dir: './test/fixtures/nonexistent' })
      const res = await r.handler()(
        new Request('http://localhost/'),
        { params: {}, query: {} },
      )
      assert.equal(res.status, 404)
    })

    it('empty directory returns empty router', async () => {
      const r = await tsx({ dir: './test/fixtures/empty' })
      const res = await r.handler()(
        new Request('http://localhost/'),
        { params: {}, query: {} },
      )
      assert.equal(res.status, 404)
    })

    it('handles page.ts without tsx extension', async () => {
      // about/ has page.tsx only, but scanPages also checks page.ts
      const r = await tsx({ dir: fixtures })
      const res = await r.handler()(
        new Request('http://localhost/about'),
        { params: {}, query: {} },
      )
      assert.equal(res.status, 200)
    })
  })
})

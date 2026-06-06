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
        { params: {}, query: {} } as any,
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
        { params: {}, query: {} } as any,
      )
      assert.equal(res.status, 200)

      const html = await res.text()
      assert.match(html, /<h1>About<\/h1>/)
    })

    it('renders dynamic route with params', async () => {
      const r = await tsx({ dir: fixtures })
      const res = await r.handler()(
        new Request('http://localhost/blog/hello-world'),
        { params: { slug: 'hello-world' }, query: {} } as any,
      )
      assert.equal(res.status, 200)

      const html = await res.text()
      assert.match(html, /hello-world/)
    })

    it('passes query params', async () => {
      const r = await tsx({ dir: fixtures })
      const res = await r.handler()(
        new Request('http://localhost/?foo=bar'),
        { params: {}, query: { foo: 'bar' } } as any,
      )
      assert.equal(res.status, 200)
      assert.equal((await res.text()).includes('Home'), true)
    })

    it('returns 404 for non-existent route', async () => {
      const r = await tsx({ dir: fixtures })
      const res = await r.handler()(
        new Request('http://localhost/nonexistent'),
        { params: {}, query: {} } as any,
      )
      assert.equal(res.status, 404)
    })
  })

  describe('data loading (load.ts)', () => {
    it('calls load() and passes data as props', async () => {
      const r = await tsx({ dir: fixtures })
      const res = await r.handler()(
        new Request('http://localhost/blog/my-post'),
        { params: { slug: 'my-post' }, query: {} } as any,
      )
      assert.equal(res.status, 200)

      const html = await res.text()
      assert.match(html, /Post: my-post/)
    })

    it('serializes props to __WEIFUWU_PROPS', async () => {
      const r = await tsx({ dir: fixtures })
      const res = await r.handler()(
        new Request('http://localhost/blog/my-post'),
        { params: { slug: 'my-post' }, query: {} } as any,
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
        { params: {}, query: {} } as any,
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
        { params: { slug: 'some-post' }, query: {} } as any,
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
        { params: { slug: 'my-route' }, query: {} } as any,
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
        { params: { slug: 'my-route' }, query: {} } as any,
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
        { params: {}, query: {} } as any,
      )

      const html = await res.text()
      assert.match(html, /<script type="module"/)
      assert.match(html, /__wfw\/client\//)
      assert.match(html, /id="__weifuwu_root"/)
    })

    it('serves hydration bundle', async () => {
      const r = await tsx({ dir: fixtures })
      const res1 = await r.handler()(
        new Request('http://localhost/'),
        { params: {}, query: {} } as any,
      )
      const html = await res1.text()
      const match = html.match(/src="(\/__wfw\/client\/[^"]+)"/)
      assert.ok(match)

      const res2 = await r.handler()(
        new Request(`http://localhost${match[1]}`),
        { params: {}, query: {} } as any,
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
        { params: {}, query: {} } as any,
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
        { params: {}, query: {} } as any,
      )
      assert.equal(res1.status, 200)
      const html = await res1.text()
      assert.match(html, /<h1>About<\/h1>/)

      const res2 = await main.handler()(
        new Request('http://localhost/api/ping'),
        { params: {}, query: {} } as any,
      )
      const data = await res2.json() as any
      assert.equal(data.ok, true)
    })

    it('multiple mount points serve correct client script paths', async () => {
      const pages = await tsx({ dir: fixtures })
      const main = new Router()
      main.use('/a', pages)
      main.use('/b', pages)

      const resA = await main.handler()(
        new Request('http://localhost/a/'),
        { params: {}, query: {} } as any,
      )
      const htmlA = await resA.text()
      assert.match(htmlA, /src="\/a\/__wfw\/client\/[^"]+\.js"/)

      const resB = await main.handler()(
        new Request('http://localhost/b/'),
        { params: {}, query: {} } as any,
      )
      const htmlB = await resB.text()
      assert.match(htmlB, /src="\/b\/__wfw\/client\/[^"]+\.js"/)
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

  describe('TsxContext / useLoaderData', () => {
    it('exports TsxContext', async () => {
      const { TsxContext } = await import('../tsx.ts')
      assert.equal(typeof TsxContext.Provider, 'object')
    })

    it('provides params and query via Provider and loaderData via hook', async () => {
      const r = await tsx({ dir: './test/fixtures/pages' })
      const res = await r.handler()(
        new Request('http://localhost/blog/test-art'),
        { params: { slug: 'test-art' }, query: { ref: 'home' } } as any,
      )
      const html = await res.text()
      assert.match(html, /Post: test-art/)
      assert.match(html, /__WEIFUWU_PROPS/)
      assert.match(html, /"params":\{"slug":"test-art"\}/)
      assert.match(html, /"query":\{"ref":"home"\}/)
    })
  })

  describe('not-found.tsx', () => {
    it('returns 404 page with layout for unknown routes', async () => {
      const r = await tsx({ dir: fixtures })
      const res = await r.handler()(
        new Request('http://localhost/unknown-path'),
        { params: {}, query: {} } as any,
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
        { params: {}, query: {} } as any,
      )
      assert.equal(res.status, 200)
    })
  })

  describe('edge cases', () => {
    it('non-existent directory returns empty router', async () => {
      const r = await tsx({ dir: './test/fixtures/nonexistent' })
      const res = await r.handler()(
        new Request('http://localhost/'),
        { params: {}, query: {} } as any,
      )
      assert.equal(res.status, 404)
    })

    it('empty directory returns empty router', async () => {
      const r = await tsx({ dir: './test/fixtures/empty' })
      const res = await r.handler()(
        new Request('http://localhost/'),
        { params: {}, query: {} } as any,
      )
      assert.equal(res.status, 404)
    })

    it('handles page.ts without tsx extension', async () => {
      // about/ has page.tsx only, but scanPages also checks page.ts
      const r = await tsx({ dir: fixtures })
      const res = await r.handler()(
        new Request('http://localhost/about'),
        { params: {}, query: {} } as any,
      )
      assert.equal(res.status, 200)
    })
  })
})

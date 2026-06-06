import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from 'weifuwu'
import { ssr, layout } from 'weifuwu'

const homePage = './test/fixtures/ssr/home/page.tsx'

describe('ssr()', () => {
  it('returns HTML with doctype', async () => {
    const app = new Router()
    app.get('/', ssr(homePage))
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
    app.get('/', ssr(homePage))
    const res = await app.handler()(
      new Request('http://localhost/'),
      { params: {}, query: {} } as any,
    )
    const html = await res.text()
    assert.match(html, /__WEIFUWU_CTX/)
  })

  it('serves client bundle', async () => {
    const app = new Router()
    app.get('/', ssr(homePage))
    const res1 = await app.handler()(
      new Request('http://localhost/'),
      { params: {}, query: {} } as any,
    )
    const html = await res1.text()
    const match = html.match(/src="(\/__ssr\/[^"]+)"/)
    assert.ok(match, 'expected hydration script src in HTML')

    const bundleKey = match![1]
    const res2 = await app.handler()(
      new Request(`http://localhost${bundleKey}`),
      { params: {}, query: {} } as any,
    )
    assert.equal(res2.status, 200)
    const js = await res2.text()
    assert.match(js, /hydrateRoot/)
  })

  it('passes ctx data via loaderData', async () => {
    const app = new Router()
    app.use(async (req, ctx, next) => {
      ctx.posts = [{ title: 'Hello' }]
      return next(req, ctx)
    })
    app.get('/', ssr(homePage))
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
    app.use(layout('./test/fixtures/ssr/posts/layout.tsx'))
    app.get('/posts', ssr('./test/fixtures/ssr/posts/page.tsx'))
    const res = await app.handler()(
      new Request('http://localhost/posts'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    const html = await res.text()
    assert.match(html, /Layout-Header/)
  })
})

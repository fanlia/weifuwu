import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../router.ts'
import { ssr, layout } from '../ssr/index.ts'
import { readStream } from '../ssr/stream.ts'

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

  it('injects hydration script', async () => {
    const app = new Router()
    app.get('/', ssr(homePage))
    const res = await app.handler()(
      new Request('http://localhost/'),
      { params: {}, query: {} } as any,
    )
    const html = await res.text()
    assert.match(html, /<script type="module"/)
    assert.match(html, /__ssr\//)
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
    assert.match(html, /"loaderData"/)
  })
})

describe('liveReload()', () => {
  it('returns a Router that can be mounted via app.use()', async () => {
    const { liveReload } = await import('../ssr/live.ts')
    const { Router } = await import('../router.ts')
    const app = new Router()
    const lr = liveReload({ dirs: ['./test/fixtures/ssr'] })
    app.use(lr)
    assert.ok(lr.close)
    lr.close()
  })

  it('can be used without mount path', async () => {
    const { liveReload } = await import('../ssr/live.ts')
    const { Router } = await import('../router.ts')
    const app = new Router()
    const lr = liveReload({ dirs: ['./test/fixtures/ssr'] })
    app.use(lr)
    const wsHandler = app.websocketHandler()
    assert.ok(typeof wsHandler === 'function')
    lr.close()
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

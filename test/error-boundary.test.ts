import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../router.ts'
import { ssr } from '../ssr.ts'
import { layout } from '../layout.ts'
import { errorBoundary } from '../error-boundary.ts'

const errComponent = './test/fixtures/error/error.tsx'

describe('errorBoundary()', () => {
  it('catches error and renders error component', async () => {
    const app = new Router()
    app.use(errorBoundary(errComponent))
    app.use('/', ssr({ dir: './test/fixtures/error' }))
    const res = await app.handler()(new Request('http://localhost/'), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.status, 500)
    const html = await res.text()
    assert.match(html, /Something went wrong/)
    assert.match(html, /Intentional error/)
  })

  it('wraps in layout when present', async () => {
    const app = new Router()
    app.use(layout('./test/fixtures/ssr/posts/app/layout.tsx'))
    app.use(errorBoundary(errComponent))
    app.use('/', ssr({ dir: './test/fixtures/error' }))
    const res = await app.handler()(new Request('http://localhost/'), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.status, 500)
    const html = await res.text()
    assert.match(html, /Layout-Header/)
    assert.match(html, /Something went wrong/)
  })

  it('re-throws when error component has no default export', async () => {
    const app = new Router()
    app.use(errorBoundary('./test/fixtures/error/no-default-error.tsx'))
    app.use('/', ssr({ dir: './test/fixtures/error' }))
    const res = await app.handler()(new Request('http://localhost/'), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.status, 500)
  })
})

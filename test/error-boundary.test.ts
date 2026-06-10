import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from 'weifuwu'
import { ssr } from 'weifuwu'
import { layout } from '../layout.ts'
import { errorBoundary } from '../error-boundary.ts'

const errPage = './test/fixtures/error/page.tsx'
const errComponent = './test/fixtures/error/error.tsx'

describe('errorBoundary()', () => {
  it('catches error and renders error component', async () => {
    const app = new Router()
    app.use(errorBoundary(errComponent))
    app.get('/', ssr(errPage))
    const res = await app.handler()(
      new Request('http://localhost/'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 500)
    const html = await res.text()
    assert.match(html, /Something went wrong/)
    assert.match(html, /Intentional error/)
  })

  it('wraps in layout when present', async () => {
    const app = new Router()
    app.use(layout('./test/fixtures/ssr/posts/layout.tsx'))
    app.use(errorBoundary(errComponent))
    app.get('/', ssr(errPage))
    const res = await app.handler()(
      new Request('http://localhost/'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 500)
    const html = await res.text()
    assert.match(html, /Layout-Header/)
    assert.match(html, /Something went wrong/)
  })

  it('re-throws when error component has no default export', async () => {
    const app = new Router()
    app.use(errorBoundary('./test/fixtures/error/no-default-error.tsx'))
    app.get('/', ssr(errPage))
    const res = await app.handler()(
      new Request('http://localhost/'),
      { params: {}, query: {} } as any,
    )
    // When error component has no default, the original error propagates
    assert.equal(res.status, 500)
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from 'weifuwu'
import { notFound } from '../not-found.ts'
import { layout } from '../layout.ts'

const nfPage = './test/fixtures/not-found/page.tsx'
const nfLayout = './test/fixtures/not-found/layout.tsx'

describe('notFound()', () => {
  it('returns plain text when no path given', async () => {
    const app = new Router()
    app.all('/*', notFound())
    const res = await app.handler()(
      new Request('http://localhost/any'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 404)
    const text = await res.text()
    assert.equal(text, 'Not Found')
  })

  it('returns plain text when component file not found', async () => {
    const app = new Router()
    app.all('/*', notFound('./test/fixtures/not-found/nonexistent.tsx'))
    const res = await app.handler()(
      new Request('http://localhost/any'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 404)
    const text = await res.text()
    assert.equal(text, 'Not Found')
  })

  it('returns HTML with 404 status', async () => {
    const app = new Router()
    app.all('/*', notFound(nfPage))
    const res = await app.handler()(
      new Request('http://localhost/any'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 404)
    const html = await res.text()
    assert.match(html, /<!DOCTYPE html>/i)
    assert.match(html, /404 - Page Not Found/)
  })

  it('wraps in layout when present', async () => {
    const app = new Router()
    app.use(layout(nfLayout))
    app.all('/*', notFound(nfPage))
    const res = await app.handler()(
      new Request('http://localhost/any'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 404)
    const html = await res.text()
    assert.match(html, /Layout-Header/)
    assert.match(html, /404 - Page Not Found/)
  })

  it('returns plain text when component has no default export', async () => {
    const app = new Router()
    app.all('/*', notFound('./test/fixtures/not-found/no-default.tsx'))
    const res = await app.handler()(
      new Request('http://localhost/any'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 404)
    const text = await res.text()
    assert.equal(text, 'Not Found')
  })
})

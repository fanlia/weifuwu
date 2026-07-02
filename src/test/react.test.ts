import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h, Fragment, type ReactElement } from 'react'
import { serve } from '../core/serve.ts'
import { Router } from '../core/router.ts'
import { react, useServerData } from '../react/index.ts'
import type { Server } from '../core/serve.ts'

describe('react SSR', () => {
  let servers: Server[] = []

  afterEach(async () => {
    for (const s of servers) await s.close()
    servers = []
  })

  function start(app: Router): Server {
    const s = serve(app, { port: 0, shutdown: false })
    servers.push(s)
    return s
  }

  // Helper layout components
  function ShellLayout({ children }: { children: unknown }) {
    return h('html', null,
      h('body', null,
        h('div', { id: 'root' }, children),
      ),
    ) as ReactElement
  }

  function InnerLayout({ children }: { children: unknown }) {
    return h('div', { 'data-layer': 'inner' }, children) as ReactElement
  }

  /** Layout that renders __WEIFUWU_DATA__ script from useServerData(). */
  function DataScriptLayout({ children }: { children: unknown }) {
    const data = useServerData()
    const hasData = Object.keys(data).length > 0
    return h('html', null,
      h('body', null,
        children,
        hasData && h('script', {
          id: '__WEIFUWU_DATA__',
          type: 'application/json',
          dangerouslySetInnerHTML: { __html: JSON.stringify(data) },
        }),
      ),
    ) as ReactElement
  }

  it('ctx.render returns HTML with doctype', async () => {
    const app = new Router()
    app.use(react({ layout: ShellLayout }))
    app.get('/', async (_req, ctx) => ctx.render(h('h1', null, 'Hello')))

    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/`)
    const text = await res.text()

    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type')!, /text\/html/)
    assert.match(text, /^<!DOCTYPE html>/)
    assert.match(text, /<h1>Hello<\/h1>/)
  })

  it('ctx.render wraps content with layout', async () => {
    const app = new Router()
    app.use(react({ layout: ShellLayout }))
    app.get('/', async (_req, ctx) => ctx.render(h('p', null, 'Content')))

    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/`)
    const text = await res.text()

    assert.match(text, /<html>/)
    assert.match(text, /<body>/)
    assert.match(text, /<div id="root">/)
    assert.match(text, /<p>Content<\/p>/)
  })

  it('ctx.render serializes data to script tag via Layout', async () => {
    const app = new Router()
    app.use(react({ layout: DataScriptLayout }))
    app.get('/', async (_req, ctx) =>
      ctx.render(h('div', null, 'Page'), { data: { user: 'Alice' } }),
    )

    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/`)
    const text = await res.text()

    assert.match(text, /<script id="__WEIFUWU_DATA__"/)
    assert.match(text, /"user":"Alice"/)
  })

  it('ctx.render uses custom status code', async () => {
    const app = new Router()
    app.use(react())
    app.get('/', async (_req, ctx) =>
      ctx.render(h('p', null, 'Not found'), { status: 404 }),
    )

    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/`)

    assert.equal(res.status, 404)
  })

  it('layout nesting via mount — inner wraps inside outer', async () => {
    const app = new Router()
    app.use(react({ layout: ShellLayout }))

    const sub = new Router()
    sub.use(react({ layout: InnerLayout }))
    sub.get('/', async (_req, ctx) => ctx.render(h('span', null, 'inner content')))

    app.mount('/sub', sub)

    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/sub`)
    const text = await res.text()

    assert.match(text, /data-layer="inner"/)
    assert.match(text, /<span>inner content<\/span>/)
    assert.match(text, /<div id="root">/)

    const outerIdx = text.indexOf('id="root"')
    const innerIdx = text.indexOf('data-layer="inner"')
    const contentIdx = text.indexOf('<span>')
    assert.ok(outerIdx < innerIdx, 'outer layout should come before inner layout')
    assert.ok(innerIdx < contentIdx, 'inner layout should come before content')
  })

  it('non-React routes coexist with React routes', async () => {
    const app = new Router()
    app.use(react())
    app.get('/api', () => Response.json({ ok: true }))
    app.get('/page', async (_req, ctx) => ctx.render(h('h1', null, 'Page')))

    const s = start(app)
    await s.ready

    const apiRes = await fetch(`http://localhost:${s.port}/api`)
    assert.deepEqual(await apiRes.json(), { ok: true })

    const pageRes = await fetch(`http://localhost:${s.port}/page`)
    const text = await pageRes.text()
    assert.match(text, /<h1>Page<\/h1>/)
  })

  it('ctx.render with Fragment layout (no layout specified)', async () => {
    const app = new Router()
    app.use(react())
    app.get('/', async (_req, ctx) =>
      ctx.render(h('main', null, h('p', null, 'No layout'))),
    )

    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/`)
    const text = await res.text()

    assert.match(text, /<main>/)
    assert.match(text, /<p>No layout<\/p>/)
  })

  it('ctx.render returns streaming HTML', async () => {
    const app = new Router()
    app.use(react())
    app.get('/', async (_req, ctx) => ctx.render(h('h2', null, 'Streamed')))

    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/`)
    const text = await res.text()

    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type')!, /text\/html/)
    assert.match(text, /<h2>Streamed<\/h2>/)
  })


})

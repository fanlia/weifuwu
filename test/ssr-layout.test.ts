import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { layout } from '../ssr/layout.ts'
import { Router } from '../core/router.ts'
import type { Context } from '../types.ts'

function mkCtx(ctx?: Partial<Context>): Context {
  return { params: {}, query: {}, ...ctx } as Context
}

const rootLayout = resolve('test/fixtures/ssr-layout/root/layout.ts')
const blogLayout = resolve('test/fixtures/ssr-layout/blog/layout.ts')

function htmlResponse(body: string): Response {
  return new Response(body, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

describe('layout middleware', () => {
  it('wraps HTML response', async () => {
    const app = new Router()
    app.use(layout(rootLayout))
    app.get('/', () => htmlResponse('<h1>Hello</h1>'))

    const res = await app.handler()(new Request('http://localhost/'), mkCtx())
    assert.equal(res.status, 200)
    const text = await res.text()
    assert.match(text, /<h1>Hello<\/h1>/)
    assert.match(text, /<!DOCTYPE html>/)
  })

  it('does not wrap non-HTML responses', async () => {
    const app = new Router()
    app.use(layout(rootLayout))
    app.get('/api', () => Response.json({ ok: true }))

    const res = await app.handler()(new Request('http://localhost/api'), mkCtx())
    assert.equal(res.status, 200)
    // Use clone() to allow multiple reads
    const text = await res.clone().text()
    assert.equal(text, '{"ok":true}')
    const ct = res.headers.get('content-type') ?? ''
    assert.match(ct, /application\/json/)
  })

  it('supports nested layouts (outer wraps inner)', async () => {
    const app = new Router()
    app.use(layout(rootLayout)) // root: html > body
    app.use(layout(blogLayout)) // blog: nav > main
    app.get('/', () => htmlResponse('<p>Content</p>'))

    const res = await app.handler()(new Request('http://localhost/'), mkCtx())
    const text = await res.text()
    // Innermost content
    assert.match(text, /<p>Content<\/p>/)
    // Blog layout wraps content
    assert.match(text, /<nav>Nav<\/nav>/)
    assert.match(text, /<main><p>Content<\/p><\/main>/)
    // Root wraps all
    assert.match(text, /<body>/)
  })

  it('works with route-level layout', async () => {
    const app = new Router()
    // Route-level layout (only applies to /blog/*)
    app.get('/blog/:slug', layout(blogLayout), () => htmlResponse('<h1>Post</h1>'))
    // Another route without layout
    app.get('/', () => htmlResponse('<h1>Home</h1>'))

    const res1 = await app.handler()(new Request('http://localhost/blog/hello'), mkCtx())
    const text1 = await res1.text()
    assert.match(text1, /<nav>Nav<\/nav>/)
    assert.match(text1, /<h1>Post<\/h1>/)

    const res2 = await app.handler()(new Request('http://localhost/'), mkCtx())
    assert.equal(await res2.text(), '<h1>Home</h1>') // No layout
  })
})

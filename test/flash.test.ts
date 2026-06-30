import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../core/router.ts'
import type { FlashInjected } from '../middleware/flash.ts'

// Simulate a full middleware chain with flash
function buildApp() {
  const r = new Router()
  r.use(async (req, ctx, next) => {
    // Simulate a cookie header for flash testing
    return next(req, ctx)
  })
  return r
}

describe('flash', () => {
  it('injects ctx.flash with value undefined when no cookie', async () => {
    const { flash } = await import('../middleware/flash.ts')
    const r = new Router<{ flash: FlashInjected }>()
    r.use(flash())
    r.get('/', (_req, ctx) => {
      assert.equal(ctx.flash.value, undefined)
      return Response.json({ ok: true })
    })

    const res = await r.handler()(new Request('http://localhost/'), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.status, 200)
  })

  it('reads flash value from cookie', async () => {
    const { flash } = await import('../middleware/flash.ts')
    const r = new Router<{ flash: FlashInjected }>()
    r.use(flash())
    r.get('/', (_req, ctx) => {
      assert.deepEqual(ctx.flash.value, { type: 'success', text: 'Saved!' })
      return Response.json({ ok: true })
    })

    const encoded = encodeURIComponent(JSON.stringify({ type: 'success', text: 'Saved!' }))
    const res = await r.handler()(
      new Request('http://localhost/', { headers: { cookie: 'flash=' + encoded } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
  })

  it('clears flash cookie after read', async () => {
    const { flash } = await import('../middleware/flash.ts')
    const r = new Router<{ flash: FlashInjected }>()
    r.use(flash())
    r.get('/', (_req, ctx) => {
      return Response.json({ value: ctx.flash.value })
    })

    const encoded = encodeURIComponent(JSON.stringify('hello'))
    const res = await r.handler()(
      new Request('http://localhost/', { headers: { cookie: 'flash=' + encoded } }),
      { params: {}, query: {} } as any,
    )
    const setCookie = res.headers.getSetCookie()
    assert.ok(
      setCookie.some((c) => c.startsWith('flash=;') || c.includes('Max-Age=0')),
      `Expected flash clear cookie, got: ${setCookie.join(', ')}`,
    )
  })

  it('set creates a redirect response with flash cookie', async () => {
    const { flash } = await import('../middleware/flash.ts')
    const r = new Router<{ flash: FlashInjected }>()
    r.use(flash())
    r.get('/', (_req, ctx) => {
      return ctx.flash.set({ type: 'error', text: 'Failed' }, '/error')
    })

    const res = await r.handler()(new Request('http://localhost/'), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.status, 302)
    assert.equal(res.headers.get('location'), '/error')
    const cookies = res.headers.getSetCookie()
    assert.ok(cookies.some((c) => c.startsWith('flash=')))
  })

  it('set uses referer when no location given', async () => {
    const { flash } = await import('../middleware/flash.ts')
    const r = new Router<{ flash: FlashInjected }>()
    r.use(flash())
    r.get('/', (_req, ctx) => {
      return ctx.flash.set({ msg: 'back' })
    })

    const res = await r.handler()(
      new Request('http://localhost/', { headers: { referer: '/previous' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 302)
    assert.equal(res.headers.get('location'), '/previous')
  })

  it('supports custom cookie name', async () => {
    const { flash } = await import('../middleware/flash.ts')
    const r = new Router<{ flash: FlashInjected }>()
    r.use(flash({ name: 'notification' }))
    r.get('/', (_req, ctx) => {
      return ctx.flash.set({ msg: 'hi' }, '/')
    })

    const res = await r.handler()(new Request('http://localhost/'), {
      params: {},
      query: {},
    } as any)
    const cookies = res.headers.getSetCookie()
    assert.ok(cookies.some((c) => c.startsWith('notification=')))
  })

  it('handles plain string flash value', async () => {
    const { flash } = await import('../middleware/flash.ts')
    const r = new Router<{ flash: FlashInjected }>()
    r.use(flash())
    r.get('/', (_req, ctx) => {
      assert.equal(ctx.flash.value, 'plain-string')
      return Response.json({ ok: true })
    })

    const encoded = encodeURIComponent(JSON.stringify('plain-string'))
    const res = await r.handler()(
      new Request('http://localhost/', { headers: { cookie: 'flash=' + encoded } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
  })

  it('handles malformed flash cookie gracefully', async () => {
    const { flash } = await import('../middleware/flash.ts')
    const r = new Router<{ flash: FlashInjected }>()
    r.use(flash())
    r.get('/', (_req, ctx) => {
      // Malformed JSON falls through to raw string value
      return Response.json({ value: ctx.flash.value })
    })

    const res = await r.handler()(
      new Request('http://localhost/', { headers: { cookie: 'flash=not-json' } }),
      { params: {}, query: {} } as any,
    )
    const body = await res.json()
    assert.equal(body.value, 'not-json')
  })
})

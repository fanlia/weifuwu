import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../core/router.ts'

describe('theme', () => {
  it('injects ctx.theme with default value "system"', async () => {
    const { theme } = await import('../middleware/theme.ts')
    const r = new Router()
    r.use(theme().middleware())
    r.get('/', (_req, ctx) => {
      assert.equal(ctx.theme?.value, 'system')
      return Response.json({ ok: true })
    })

    const res = await r.handler()(new Request('http://localhost/'), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.status, 200)
  })

  it('supports custom default theme', async () => {
    const { theme } = await import('../middleware/theme.ts')
    const r = new Router()
    r.use(theme({ default: 'dark' }).middleware())
    r.get('/', (_req, ctx) => {
      assert.equal(ctx.theme?.value, 'dark')
      return Response.json({ ok: true })
    })

    const res = await r.handler()(new Request('http://localhost/'), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.status, 200)
  })

  it('reads theme from cookie', async () => {
    const { theme } = await import('../middleware/theme.ts')
    const r = new Router()
    r.use(theme().middleware())
    r.get('/', (_req, ctx) => {
      assert.equal(ctx.theme?.value, 'light')
      return Response.json({ ok: true })
    })

    const res = await r.handler()(
      new Request('http://localhost/', { headers: { cookie: 'theme=light' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
  })

  it('__theme/:value route redirects with Set-Cookie', async () => {
    const { theme } = await import('../middleware/theme.ts')
    const r = new Router()
    r.use('/', theme())

    const res = await r.handler()(
      new Request('http://localhost/__theme/dark', { headers: { referer: '/settings' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 302)
    assert.equal(res.headers.get('location'), '/settings')
    const cookies = res.headers.getSetCookie()
    assert.ok(cookies.some((c) => c.startsWith('theme=dark')))
  })

  it('__theme/:value returns JSON when Accept includes application/json', async () => {
    const { theme } = await import('../middleware/theme.ts')
    const r = new Router()
    r.use('/', theme())

    const res = await r.handler()(
      new Request('http://localhost/__theme/dark', {
        headers: { accept: 'application/json', referer: '/settings' },
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.theme, 'dark')
    assert.equal(body.ok, true)
    const cookies = res.headers.getSetCookie()
    assert.ok(cookies.some((c) => c.startsWith('theme=dark')))
  })

  it('set() returns redirect with cookie', async () => {
    const { theme } = await import('../middleware/theme.ts')
    const r = new Router()
    r.use(theme().middleware())
    r.get('/set-theme', (_req, ctx) => {
      return ctx.theme?.set?.('light', '/home') ?? new Response('no theme', { status: 500 })
    })

    const res = await r.handler()(new Request('http://localhost/set-theme'), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.status, 302)
    assert.equal(res.headers.get('location'), '/home')
    const cookies = res.headers.getSetCookie()
    assert.ok(cookies.some((c) => c.startsWith('theme=light')))
  })

  it('supports custom cookie name', async () => {
    const { theme } = await import('../middleware/theme.ts')
    const r = new Router()
    r.use(theme({ cookie: 'pref_theme' }).middleware())
    r.get('/__theme/dark', (_req, ctx) => {
      return ctx.theme?.set?.('dark') ?? new Response('no theme', { status: 500 })
    })

    const res = await r.handler()(
      new Request('http://localhost/__theme/dark', { headers: { referer: '/' } }),
      { params: {}, query: {} } as any,
    )
    const cookies = res.headers.getSetCookie()
    assert.ok(cookies.some((c) => c.startsWith('pref_theme=dark')))
  })

  it('handles empty cookie name (no cookie persistence)', async () => {
    const { theme } = await import('../middleware/theme.ts')
    const r = new Router()
    r.use(theme({ cookie: '' }).middleware())
    r.get('/', (_req, ctx) => {
      assert.equal(ctx.theme?.value, 'system')
      return Response.json({ ok: true })
    })

    const res = await r.handler()(
      new Request('http://localhost/', { headers: { cookie: 'theme=dark' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
  })
})

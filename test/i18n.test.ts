import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Router } from '../router.ts'

const tmpDir = resolve(import.meta.dirname, '../.test-i18n')

describe('i18n', () => {
  before(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    mkdirSync(tmpDir, { recursive: true })
    writeFileSync(
      resolve(tmpDir, 'en.json'),
      JSON.stringify({
        greeting: 'Hello',
        farewell: 'Goodbye',
        nested: { key: 'Nested value' },
        with_param: 'Hello, {name}!',
      }),
    )
    writeFileSync(
      resolve(tmpDir, 'zh.json'),
      JSON.stringify({
        greeting: '你好',
        farewell: '再见',
      }),
    )
  })

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('injects ctx.i18n with default locale', async () => {
    const { i18n } = await import('../i18n.ts')
    const r = new Router()
    r.use(i18n({ dir: tmpDir }).middleware())
    r.get('/', (_req, ctx) => {
      assert.equal(ctx.i18n?.locale, 'en')
      assert.equal(typeof ctx.i18n?.t, 'function')
      return Response.json({ ok: true })
    })

    const res = await r.handler()(new Request('http://localhost/'), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.status, 200)
  })

  it('translates using t()', async () => {
    const { i18n } = await import('../i18n.ts')
    const r = new Router()
    r.use(i18n({ dir: tmpDir }).middleware())
    r.get('/', (_req, ctx) => {
      assert.equal(ctx.i18n?.t('greeting'), 'Hello')
      assert.equal(ctx.i18n?.t('farewell'), 'Goodbye')
      return Response.json({ ok: true })
    })

    const res = await r.handler()(new Request('http://localhost/'), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.status, 200)
  })

  it('translates with parameters', async () => {
    const { i18n } = await import('../i18n.ts')
    const r = new Router()
    r.use(i18n({ dir: tmpDir }).middleware())
    r.get('/', (_req, ctx) => {
      assert.equal(ctx.i18n?.t('with_param', { name: 'World' }), 'Hello, World!')
      return Response.json({ ok: true })
    })

    const res = await r.handler()(new Request('http://localhost/'), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.status, 200)
  })

  it('returns key as fallback for missing translation', async () => {
    const { i18n } = await import('../i18n.ts')
    const r = new Router()
    r.use(i18n({ dir: tmpDir }).middleware())
    r.get('/', (_req, ctx) => {
      assert.equal(ctx.i18n?.t('nonexistent'), 'nonexistent')
      return Response.json({ ok: true })
    })

    const res = await r.handler()(new Request('http://localhost/'), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.status, 200)
  })

  it('supports custom fallback in t()', async () => {
    const { i18n } = await import('../i18n.ts')
    const r = new Router()
    r.use(i18n({ dir: tmpDir }).middleware())
    r.get('/', (_req, ctx) => {
      assert.equal(ctx.i18n?.t('missing', undefined, 'Custom fallback'), 'Custom fallback')
      return Response.json({ ok: true })
    })

    const res = await r.handler()(new Request('http://localhost/'), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.status, 200)
  })

  it('navigates nested keys with dot notation', async () => {
    const { i18n } = await import('../i18n.ts')
    const r = new Router()
    r.use(i18n({ dir: tmpDir }).middleware())
    r.get('/', (_req, ctx) => {
      assert.equal(ctx.i18n?.t('nested.key'), 'Nested value')
      return Response.json({ ok: true })
    })

    const res = await r.handler()(new Request('http://localhost/'), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.status, 200)
  })

  it('reads locale from cookie', async () => {
    const { i18n } = await import('../i18n.ts')
    const r = new Router()
    r.use(i18n({ dir: tmpDir }).middleware())
    r.get('/', (_req, ctx) => {
      assert.equal(ctx.i18n?.locale, 'zh')
      return Response.json({ ok: true })
    })

    const res = await r.handler()(
      new Request('http://localhost/', { headers: { cookie: 'locale=zh' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
  })

  it('translates in zh locale', async () => {
    const { i18n } = await import('../i18n.ts')
    const r = new Router()
    r.use(i18n({ dir: tmpDir }).middleware())
    r.get('/', (_req, ctx) => {
      assert.equal(ctx.i18n?.t('greeting'), '你好')
      return Response.json({ ok: true })
    })

    const res = await r.handler()(
      new Request('http://localhost/', { headers: { cookie: 'locale=zh' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
  })

  it('reads locale from Accept-Language header', async () => {
    const { i18n } = await import('../i18n.ts')
    const r = new Router()
    r.use(i18n({ dir: tmpDir }).middleware())
    r.get('/', (_req, ctx) => {
      // Accept-Language: zh-CN,zh;q=0.9 => first value is zh-CN
      assert.equal(ctx.i18n?.locale, 'zh-CN')
      // zh-CN falls back to zh messages
      assert.equal(ctx.i18n?.t('greeting'), '你好')
      return Response.json({ ok: true })
    })

    const res = await r.handler()(
      new Request('http://localhost/', { headers: { 'accept-language': 'zh-CN,zh;q=0.9' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
  })

  it('__lang/:value route sets cookie and redirects', async () => {
    const { i18n } = await import('../i18n.ts')
    const r = new Router()
    r.use('/', i18n({ dir: tmpDir }))
    r.use(i18n({ dir: tmpDir }).middleware())

    const res = await r.handler()(
      new Request('http://localhost/__lang/zh', { headers: { referer: '/settings' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 302)
    assert.equal(res.headers.get('location'), '/settings')
    const cookies = res.headers.getSetCookie()
    assert.ok(cookies.some((c) => c.startsWith('locale=zh')))
  })

  it('__lang/:value returns JSON when Accept includes application/json', async () => {
    const { i18n } = await import('../i18n.ts')
    const r = new Router()
    r.use('/', i18n({ dir: tmpDir }))
    r.use(i18n({ dir: tmpDir }).middleware())

    const res = await r.handler()(
      new Request('http://localhost/__lang/fr', {
        headers: { accept: 'application/json', referer: '/settings' },
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.locale, 'fr')
    assert.equal(body.ok, true)
  })

  it('uses custom default locale', async () => {
    const { i18n } = await import('../i18n.ts')
    const r = new Router()
    r.use(i18n({ dir: tmpDir, default: 'zh' }).middleware())
    r.get('/', (_req, ctx) => {
      assert.equal(ctx.i18n?.locale, 'zh')
      return Response.json({ ok: true })
    })

    const res = await r.handler()(new Request('http://localhost/'), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.status, 200)
  })

  it('supports inline messages (no filesystem)', async () => {
    const { i18n } = await import('../i18n.ts')
    const r = new Router()
    r.use(
      i18n({
        default: 'de',
        messages: {
          de: { hello: 'Hallo' },
          fr: { hello: 'Bonjour' },
        },
      }).middleware(),
    )
    r.get('/', (_req, ctx) => {
      assert.equal(ctx.i18n?.t('hello'), 'Hallo')
      return Response.json({ ok: true })
    })

    const res = await r.handler()(new Request('http://localhost/'), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.status, 200)
  })

  it('inline messages override filesystem', async () => {
    const { i18n } = await import('../i18n.ts')
    const r = new Router()
    r.use(
      i18n({
        dir: tmpDir,
        messages: { en: { greeting: 'Overridden' } },
      }).middleware(),
    )
    r.get('/', (_req, ctx) => {
      assert.equal(ctx.i18n?.t('greeting'), 'Overridden')
      return Response.json({ ok: true })
    })

    const res = await r.handler()(new Request('http://localhost/'), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.status, 200)
  })

  it('set() returns redirect with cookie', async () => {
    const { i18n } = await import('../i18n.ts')
    const r = new Router()
    r.use(i18n({ dir: tmpDir }).middleware())
    r.get('/set-locale', (_req, ctx) => {
      return ctx.i18n?.set?.('fr', '/home') ?? new Response('no i18n', { status: 500 })
    })

    const res = await r.handler()(new Request('http://localhost/set-locale'), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.status, 302)
    assert.equal(res.headers.get('location'), '/home')
    const cookies = res.headers.getSetCookie()
    assert.ok(cookies.some((c) => c.startsWith('locale=fr')))
  })

  it('custom cookie name', async () => {
    const { i18n } = await import('../i18n.ts')
    const r = new Router()
    r.use(i18n({ dir: tmpDir, cookie: 'lang' }).middleware())
    r.get('/', (_req, ctx) => {
      assert.equal(ctx.i18n?.locale, 'zh')
      return Response.json({ ok: true })
    })

    const res = await r.handler()(
      new Request('http://localhost/', { headers: { cookie: 'lang=zh' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
  })

  it('disables Accept-Language detection', async () => {
    const { i18n } = await import('../i18n.ts')
    const r = new Router()
    r.use(i18n({ dir: tmpDir, fromAcceptLanguage: false }).middleware())
    r.get('/', (_req, ctx) => {
      assert.equal(ctx.i18n?.locale, 'en') // default, not from header
      return Response.json({ ok: true })
    })

    const res = await r.handler()(
      new Request('http://localhost/', {
        headers: { 'accept-language': 'fr-FR,fr;q=0.9' },
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
  })

  it('zh-CN falls back to zh messages', async () => {
    const { i18n } = await import('../i18n.ts')
    const r = new Router()
    r.use(i18n({ dir: tmpDir }).middleware())
    r.get('/', (_req, ctx) => {
      assert.equal(ctx.i18n?.t('greeting'), '你好')
      return Response.json({ ok: true })
    })

    const res = await r.handler()(
      new Request('http://localhost/', {
        headers: { cookie: 'locale=zh-CN' },
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
  })
})

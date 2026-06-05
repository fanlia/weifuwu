import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Context } from '../types.ts'
import { preferences } from '../preferences.ts'

describe('preferences', () => {
  let tmpDir: string

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'prefs-test-'))
    writeFileSync(join(tmpDir, 'en.json'), JSON.stringify({ greeting: 'Hello, {name}!', bye: 'Bye' }))
    writeFileSync(join(tmpDir, 'zh.json'), JSON.stringify({ greeting: '你好，{name}！', bye: '再见' }))
  })

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('locale detection', () => {
    it('detects locale from Accept-Language', async () => {
      const mw = preferences({ dir: tmpDir })
      const ctx = { params: {}, query: {} } as Context
      await mw(
        new Request('http://localhost/', { headers: { 'Accept-Language': 'zh-CN,zh;q=0.9' } }),
        ctx,
        async () => new Response('ok'),
      )
      assert.equal(ctx.locale, 'zh')
      assert.equal(ctx.prefs!.locale, 'zh')
      assert.equal(ctx.t!('greeting', { name: 'World' }), '你好，World！')
    })

    it('falls back to default locale', async () => {
      const mw = preferences({ dir: tmpDir, locale: { default: 'en' } })
      const ctx = { params: {}, query: {} } as Context
      await mw(
        new Request('http://localhost/'),
        ctx,
        async () => new Response('ok'),
      )
      assert.equal(ctx.locale, 'en')
      assert.equal(ctx.prefs!.locale, 'en')
      assert.equal(ctx.t!('greeting', { name: 'World' }), 'Hello, World!')
    })

    it('detects locale from cookie', async () => {
      const mw = preferences({ dir: tmpDir })
      const ctx = { params: {}, query: {} } as Context
      await mw(
        new Request('http://localhost/', { headers: { Cookie: 'locale=zh' } }),
        ctx,
        async () => new Response('ok'),
      )
      assert.equal(ctx.locale, 'zh')
      assert.equal(ctx.prefs!.locale, 'zh')
    })

    it('cookie takes priority over Accept-Language', async () => {
      const mw = preferences({ dir: tmpDir })
      const ctx = { params: {}, query: {} } as Context
      await mw(
        new Request('http://localhost/', {
          headers: {
            Cookie: 'locale=en',
            'Accept-Language': 'zh-CN,zh;q=0.9',
          },
        }),
        ctx,
        async () => new Response('ok'),
      )
      assert.equal(ctx.locale, 'en')
    })

    it('supports custom cookie name', async () => {
      const mw = preferences({ dir: tmpDir, locale: { cookie: 'lang' } })
      const ctx = { params: {}, query: {} } as Context
      await mw(
        new Request('http://localhost/', { headers: { Cookie: 'lang=zh' } }),
        ctx,
        async () => new Response('ok'),
      )
      assert.equal(ctx.locale, 'zh')
    })

    it('disables Accept-Language detection', async () => {
      const mw = preferences({ dir: tmpDir, locale: { fromAcceptLanguage: false, default: 'ja' } })
      const ctx = { params: {}, query: {} } as Context
      await mw(
        new Request('http://localhost/', { headers: { 'Accept-Language': 'zh-CN,zh;q=0.9' } }),
        ctx,
        async () => new Response('ok'),
      )
      assert.equal(ctx.locale, 'ja')
    })
  })

  describe('theme detection', () => {
    it('defaults to system', async () => {
      const mw = preferences({})
      const ctx = { params: {}, query: {} } as Context
      await mw(
        new Request('http://localhost/'),
        ctx,
        async () => new Response('ok'),
      )
      assert.equal(ctx.theme, 'system')
      assert.equal(ctx.prefs!.theme, 'system')
    })

    it('reads from cookie', async () => {
      const mw = preferences({ theme: { default: 'light' } })
      const ctx = { params: {}, query: {} } as Context
      await mw(
        new Request('http://localhost/', { headers: { Cookie: 'theme=dark' } }),
        ctx,
        async () => new Response('ok'),
      )
      assert.equal(ctx.theme, 'dark')
    })

    it('supports custom cookie name', async () => {
      const mw = preferences({ theme: { default: 'light', cookie: 'color-theme' } })
      const ctx = { params: {}, query: {} } as Context
      await mw(
        new Request('http://localhost/', { headers: { Cookie: 'color-theme=dark' } }),
        ctx,
        async () => new Response('ok'),
      )
      assert.equal(ctx.theme, 'dark')
    })
  })

  describe('translation', () => {
    it('returns key when translation is missing', async () => {
      const mw = preferences({ dir: tmpDir })
      const ctx = { params: {}, query: {} } as Context
      await mw(
        new Request('http://localhost/'),
        ctx,
        async () => new Response('ok'),
      )
      assert.equal(ctx.t!('nonexistent'), 'nonexistent')
    })

    it('handles params interpolation', async () => {
      const mw = preferences({ dir: tmpDir })
      const ctx = { params: {}, query: {} } as Context
      await mw(
        new Request('http://localhost/'),
        ctx,
        async () => new Response('ok'),
      )
      assert.equal(ctx.t!('greeting', { name: 'World' }), 'Hello, World!')
    })

    it('loads translations for each locale', async () => {
      const mw = preferences({ dir: tmpDir })
      const ctx1 = { params: {}, query: {} } as Context
      await mw(
        new Request('http://localhost/', { headers: { 'Accept-Language': 'en' } }),
        ctx1,
        async () => new Response('ok'),
      )
      const ctx2 = { params: {}, query: {} } as Context
      await mw(
        new Request('http://localhost/', { headers: { 'Accept-Language': 'zh' } }),
        ctx2,
        async () => new Response('ok'),
      )
      assert.equal(ctx1.t!('bye'), 'Bye')
      assert.equal(ctx2.t!('bye'), '再见')
    })
  })

  describe('no dir (theme only)', () => {
    it('works without translations', async () => {
      const mw = preferences({ theme: {} })
      const ctx = { params: {}, query: {} } as Context
      await mw(
        new Request('http://localhost/'),
        ctx,
        async () => new Response('ok'),
      )
      assert.equal(ctx.theme, 'system')
      assert.equal(ctx.prefs!.theme, 'system')
      assert.equal(ctx.t, undefined)
    })
  })

  describe('setPref', () => {
    it('returns 302 with Set-Cookie', async () => {
      const mw = preferences({})
      const ctx = { params: {}, query: {} } as Context
      await mw(
        new Request('http://localhost/', { headers: { Referer: 'http://localhost/page' } }),
        ctx,
        async () => new Response('ok'),
      )
      const res = ctx.setPref!('theme', 'dark')
      assert.equal(res.status, 302)
      assert.equal(res.headers.get('Location'), 'http://localhost/page')
      const cookie = res.headers.get('Set-Cookie')
      assert.ok(cookie?.includes('theme=dark'))
      assert.ok(cookie?.includes('Path=/'))
    })

    it('redirects to / when no referer', async () => {
      const mw = preferences({})
      const ctx = { params: {}, query: {} } as Context
      await mw(
        new Request('http://localhost/'),
        ctx,
        async () => new Response('ok'),
      )
      const res = ctx.setPref!('locale', 'zh')
      assert.equal(res.headers.get('Location'), '/')
    })
  })
})

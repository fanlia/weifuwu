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
    writeFileSync(join(tmpDir, 'nested.json'), JSON.stringify({
      nav: { home: 'Home', tools: 'Tools' },
      categories: { text: 'Text Tools', encode: 'Encoding' },
      tools: { uppercase: { title: 'Uppercase', desc: 'Convert to uppercase' } },
    }))
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
      assert.equal(ctx.prefs!.locale, 'zh-CN')
      assert.equal(ctx.prefs!.locale, 'zh-CN')
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
      assert.equal(ctx.prefs!.locale, 'en')
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
      assert.equal(ctx.prefs!.locale, 'zh')
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
      assert.equal(ctx.prefs!.locale, 'en')
    })

    it('supports custom cookie name', async () => {
      const mw = preferences({ dir: tmpDir, locale: { cookie: 'lang' } })
      const ctx = { params: {}, query: {} } as Context
      await mw(
        new Request('http://localhost/', { headers: { Cookie: 'lang=zh' } }),
        ctx,
        async () => new Response('ok'),
      )
      assert.equal(ctx.prefs!.locale, 'zh')
    })

    it('disables Accept-Language detection', async () => {
      const mw = preferences({ dir: tmpDir, locale: { fromAcceptLanguage: false, default: 'ja' } })
      const ctx = { params: {}, query: {} } as Context
      await mw(
        new Request('http://localhost/', { headers: { 'Accept-Language': 'zh-CN,zh;q=0.9' } }),
        ctx,
        async () => new Response('ok'),
      )
      assert.equal(ctx.prefs!.locale, 'ja')
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
      assert.equal(ctx.prefs!.theme, 'system')
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
      assert.equal(ctx.prefs!.theme, 'dark')
    })

    it('supports custom cookie name', async () => {
      const mw = preferences({ theme: { default: 'light', cookie: 'color-theme' } })
      const ctx = { params: {}, query: {} } as Context
      await mw(
        new Request('http://localhost/', { headers: { Cookie: 'color-theme=dark' } }),
        ctx,
        async () => new Response('ok'),
      )
      assert.equal(ctx.prefs!.theme, 'dark')
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

    it('supports nested dot-path keys', async () => {
      const mw = preferences({ dir: tmpDir })
      const ctx = { params: {}, query: {} } as Context
      await mw(
        new Request('http://localhost/', { headers: { 'Accept-Language': 'en' } }),
        ctx,
        async () => new Response('ok'),
      )
      // Force reload from nested.json
      await mw(
        new Request('http://localhost/', { headers: { 'Accept-Language': 'nested' } }),
        ctx,
        async () => new Response('ok'),
      )
      assert.equal(ctx.t!('nav.home'), 'Home')
      assert.equal(ctx.t!('categories.text'), 'Text Tools')
      assert.equal(ctx.t!('tools.uppercase.title'), 'Uppercase')
      assert.equal(ctx.t!('tools.uppercase.desc'), 'Convert to uppercase')
    })

    it('returns key for non-existent nested path', async () => {
      const mw = preferences({ dir: tmpDir })
      const ctx = { params: {}, query: {} } as Context
      await mw(
        new Request('http://localhost/', { headers: { 'Accept-Language': 'nested' } }),
        ctx,
        async () => new Response('ok'),
      )
      assert.equal(ctx.t!('nonexistent.key'), 'nonexistent.key')
      assert.equal(ctx.t!('tools.uppercase.missing'), 'tools.uppercase.missing')
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
      assert.equal(ctx.prefs!.theme, 'system')
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

  describe('auto-routing', () => {
    it('GET /__lang/:locale returns 302 with cookie', async () => {
      const mw = preferences({ dir: tmpDir, locale: { default: 'en' } })
      const ctx = { params: {}, query: {} } as Context
      const res = await mw(
        new Request('http://localhost/__lang/zh', { headers: { Referer: 'http://localhost/page' } }),
        ctx,
        async () => new Response('ok'),
      )
      assert.equal(res.status, 302)
      assert.equal(res.headers.get('Location'), 'http://localhost/page')
      assert.ok(res.headers.get('Set-Cookie')?.includes('locale=zh'))
    })

    it('GET /__lang/:locale returns JSON with messages when Accept: application/json', async () => {
      const mw = preferences({ dir: tmpDir, locale: { default: 'en' } })
      const ctx = { params: {}, query: {} } as Context
      const res = await mw(
        new Request('http://localhost/__lang/zh', {
          headers: { accept: 'application/json' },
        }),
        ctx,
        async () => new Response('ok'),
      )
      assert.equal(res.status, 200)
      assert.match(res.headers.get('content-type') || '', /application\/json/)
      const data = await res.json() as any
      assert.equal(data.ok, true)
      assert.equal(data.locale, 'zh')
      assert.deepEqual(data.messages, { greeting: '你好，{name}！', bye: '再见' })
      assert.ok(res.headers.get('Set-Cookie')?.includes('locale=zh'))
    })

    it('GET /__theme/:locale returns 302 with cookie', async () => {
      const mw = preferences({})
      const ctx = { params: {}, query: {} } as Context
      const res = await mw(
        new Request('http://localhost/__theme/dark', { headers: { Referer: 'http://localhost/page' } }),
        ctx,
        async () => new Response('ok'),
      )
      assert.equal(res.status, 302)
      assert.equal(res.headers.get('Location'), 'http://localhost/page')
      assert.ok(res.headers.get('Set-Cookie')?.includes('theme=dark'))
    })

    it('GET /__theme/:locale returns JSON when Accept: application/json', async () => {
      const mw = preferences({})
      const ctx = { params: {}, query: {} } as Context
      const res = await mw(
        new Request('http://localhost/__theme/light', {
          headers: { accept: 'application/json' },
        }),
        ctx,
        async () => new Response('ok'),
      )
      assert.equal(res.status, 200)
      assert.match(res.headers.get('content-type') || '', /application\/json/)
      const data = await res.json() as any
      assert.equal(data.ok, true)
      assert.equal(data.theme, 'light')
      assert.ok(res.headers.get('Set-Cookie')?.includes('theme=light'))
    })

    it('does not intercept normal requests', async () => {
      const mw = preferences({ dir: tmpDir, locale: { default: 'en' } })
      let called = false
      const ctx = { params: {}, query: {} } as Context
      await mw(
        new Request('http://localhost/some-page'),
        ctx,
        async () => { called = true; return new Response('ok') },
      )
      assert.equal(called, true)
      assert.equal(ctx.prefs!.locale, 'en')
    })

    it('POST to /__lang/:locale is not intercepted', async () => {
      const mw = preferences({})
      let called = false
      const ctx = { params: {}, query: {} } as Context
      const res = await mw(
        new Request('http://localhost/__lang/zh', { method: 'POST' }),
        ctx,
        async () => { called = true; return new Response('ok') },
      )
      assert.equal(called, true)
    })
  })

  describe('flash cookie', () => {
    it('reads flash cookie into ctx.prefs.flash', async () => {
      const mw = preferences({})
      const ctx = { params: {}, query: {} } as Context
      await mw(
        new Request('http://localhost/', { headers: { Cookie: 'flash={"msg":"hi"}' } }),
        ctx,
        async () => new Response('ok'),
      )
      assert.deepEqual(ctx.prefs!.flash, { msg: 'hi' })
    })

    it('handles flash cookie with non-JSON value as raw string', async () => {
      const mw = preferences({})
      const ctx = { params: {}, query: {} } as Context
      await mw(
        new Request('http://localhost/', { headers: { Cookie: 'flash=plain-text' } }),
        ctx,
        async () => new Response('ok'),
      )
      assert.equal(ctx.prefs!.flash, 'plain-text')
    })

    it('clears flash cookie on response', async () => {
      const mw = preferences({})
      const ctx = { params: {}, query: {} } as Context
      const res = await mw(
        new Request('http://localhost/', { headers: { Cookie: 'flash={"msg":"hi"}' } }),
        ctx,
        async () => new Response('ok'),
      )
      const setCookie = res.headers.get('Set-Cookie')
      assert.ok(setCookie?.includes('flash=;'), 'flash cookie should be cleared')
      assert.ok(setCookie?.includes('Max-Age=0'), 'flash cookie should have Max-Age=0')
    })
  })

  describe('validLocale', () => {
    it('rejects locale containing ..', async () => {
      const mw = preferences({ dir: tmpDir, locale: { default: 'en' } })
      const ctx = { params: {}, query: {} } as Context
      await mw(
        new Request('http://localhost/', { headers: { Cookie: 'locale=../etc' } }),
        ctx,
        async () => new Response('ok'),
      )
      // validLocale returns false so no translations loaded; t() returns key
      assert.equal(ctx.t!('greeting'), 'greeting')
    })
  })

  describe('short locale fallback', () => {
    before(() => {
      writeFileSync(join(tmpDir, 'fr.json'), JSON.stringify({ greeting: 'Bonjour' }))
    })

    it('falls back fr-FR to fr when fr-FR file does not exist', async () => {
      const mw = preferences({ dir: tmpDir, locale: { default: 'en' } })
      const ctx = { params: {}, query: {} } as Context
      await mw(
        new Request('http://localhost/', { headers: { 'Accept-Language': 'fr-FR' } }),
        ctx,
        async () => new Response('ok'),
      )
      assert.equal(ctx.t!('greeting'), 'Bonjour')
    })

    it('falls back to key when short locale also has no file', async () => {
      const mw = preferences({ dir: tmpDir, locale: { default: 'en' } })
      const ctx = { params: {}, query: {} } as Context
      await mw(
        new Request('http://localhost/', { headers: { 'Accept-Language': 'ja-JP' } }),
        ctx,
        async () => new Response('ok'),
      )
      assert.equal(ctx.t!('greeting'), 'greeting')
    })
  })

  describe('load errors', () => {
    before(() => {
      writeFileSync(join(tmpDir, 'bad.json'), 'not valid json {{{')
    })

    it('returns empty translations for unparseable locale file', async () => {
      const mw = preferences({ dir: tmpDir, locale: { default: 'en' } })
      const ctx = { params: {}, query: {} } as Context
      await mw(
        new Request('http://localhost/__lang/bad', { headers: { Referer: '/page' } }),
        ctx,
        async () => new Response('ok'),
      )
      // Should not throw, no translations loaded
      assert.equal(ctx.t, undefined)
    })
  })

  describe('JSON mode resolve', () => {
    it('returns JSON without messages when locale has no translations', async () => {
      const mw = preferences({ dir: tmpDir, locale: { default: 'en' } })
      const res = await mw(
        new Request('http://localhost/__lang/xx', { headers: { accept: 'application/json' } }),
        { params: {}, query: {} } as Context,
        async () => new Response('ok'),
      )
      const data = await res.json() as any
      assert.equal(data.ok, true)
      assert.equal(data.locale, 'xx')
      assert.equal(data.messages, undefined, 'empty translations should not set messages')
    })
  })

  describe('globalThis and ctx.parsed', () => {
    it('sets globalThis.__LOCALE_DATA__', async () => {
      const mw = preferences({ dir: tmpDir, locale: { default: 'en' } })
      const ctx = { params: {}, query: {} } as Context
      await mw(
        new Request('http://localhost/', { headers: { 'Accept-Language': 'en' } }),
        ctx,
        async () => new Response('ok'),
      )
      assert.ok((globalThis as any).__LOCALE_DATA__)
      assert.equal((globalThis as any).__LOCALE_DATA__.greeting, 'Hello, {name}!')
    })

    it('merges __localeData into ctx.parsed', async () => {
      const mw = preferences({ dir: tmpDir, locale: { default: 'en' } })
      const ctx = { params: {}, query: {} } as Context
      await mw(
        new Request('http://localhost/', { headers: { 'Accept-Language': 'en' } }),
        ctx,
        async () => new Response('ok'),
      )
      assert.ok(ctx.parsed)
      assert.ok((ctx.parsed as any).__localeData)
      assert.equal((ctx.parsed as any).__localeData.greeting, 'Hello, {name}!')
    })
  })

  describe('extractCookie edge cases', () => {
    it('ignores malformed cookie parts without equals sign', async () => {
      const mw = preferences({ theme: { default: 'light' } })
      const ctx = { params: {}, query: {} } as Context
      await mw(
        new Request('http://localhost/', {
          headers: { Cookie: 'malformed; theme=dark; anotherbad' },
        }),
        ctx,
        async () => new Response('ok'),
      )
      assert.equal(ctx.prefs!.theme, 'dark')
    })
  })
})

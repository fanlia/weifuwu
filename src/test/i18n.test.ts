import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { testApp } from '../test/test-utils.ts'
import { i18n } from '../middleware/i18n.ts'

describe('i18n', () => {
  it('injects ctx.i18n with default locale', async () => {
    let captured: any = 'not-set'

    await testApp()
      .use(i18n().middleware())
      .get('/', (req, ctx) => {
        captured = (ctx as any).i18n
        return new Response('ok')
      })
      .getReq('/')
      .send()

    assert.equal(captured.locale, 'en')
    assert.equal(typeof captured.t, 'function')
    assert.equal(typeof captured.set, 'function')
  })

  it('reads locale from cookie', async () => {
    let captured: any = 'not-set'

    await testApp()
      .use(i18n().middleware())
      .get('/', (req, ctx) => {
        captured = (ctx as any).i18n
        return new Response('ok')
      })
      .getReq('/')
      .header('cookie', 'locale=zh-CN')
      .send()

    assert.equal(captured.locale, 'zh-CN')
  })

  it('reads locale from Accept-Language header', async () => {
    let captured: any = 'not-set'

    await testApp()
      .use(i18n().middleware())
      .get('/', (req, ctx) => {
        captured = (ctx as any).i18n
        return new Response('ok')
      })
      .getReq('/')
      .header('accept-language', 'fr-FR, fr;q=0.9, en;q=0.8')
      .send()

    assert.equal(captured.locale, 'fr-FR')
  })

  it('cookie takes priority over Accept-Language', async () => {
    let captured: any = 'not-set'

    await testApp()
      .use(i18n().middleware())
      .get('/', (req, ctx) => {
        captured = (ctx as any).i18n
        return new Response('ok')
      })
      .getReq('/')
      .header('cookie', 'locale=ja')
      .header('accept-language', 'fr-FR')
      .send()

    assert.equal(captured.locale, 'ja')
  })

  it('respects custom default locale', async () => {
    let captured: any = 'not-set'

    await testApp()
      .use(i18n({ default: 'zh' }).middleware())
      .get('/', (req, ctx) => {
        captured = (ctx as any).i18n
        return new Response('ok')
      })
      .getReq('/')
      .send()

    assert.equal(captured.locale, 'zh')
  })

  it('uses inline messages for translation', async () => {
    const messages = {
      en: { hello: 'Hello', greeting: 'Hello {name}!' },
      zh: { hello: '你好', greeting: '你好 {name}！' },
    }

    let tFn: any

    await testApp()
      .use(i18n({ messages }).middleware())
      .get('/', (req, ctx) => {
        tFn = (ctx as any).i18n.t
        return new Response('ok')
      })
      .getReq('/')
      .send()

    assert.equal(tFn('hello'), 'Hello')
    assert.equal(tFn('greeting', { name: 'World' }), 'Hello World!')
  })

  it('t() returns key for missing translation', async () => {
    let tFn: any

    await testApp()
      .use(i18n().middleware())
      .get('/', (req, ctx) => {
        tFn = (ctx as any).i18n.t
        return new Response('ok')
      })
      .getReq('/')
      .send()

    assert.equal(tFn('nonexistent.key'), 'nonexistent.key')
  })

  it('t() returns fallback when provided', async () => {
    let tFn: any

    await testApp()
      .use(i18n().middleware())
      .get('/', (req, ctx) => {
        tFn = (ctx as any).i18n.t
        return new Response('ok')
      })
      .getReq('/')
      .send()

    assert.equal(tFn('nonexistent', undefined, 'Default'), 'Default')
  })

  it('supports nested key lookup', async () => {
    const messages = {
      en: { nav: { home: 'Home', about: 'About Us' } },
    }

    let tFn: any

    await testApp()
      .use(i18n({ messages }).middleware())
      .get('/', (req, ctx) => {
        tFn = (ctx as any).i18n.t
        return new Response('ok')
      })
      .getReq('/')
      .send()

    assert.equal(tFn('nav.home'), 'Home')
    assert.equal(tFn('nav.about'), 'About Us')
  })

  it('i18n.set() returns 302 redirect with locale cookie', async () => {
    let setFn: ((value: string, loc?: string) => Response) | undefined

    await testApp()
      .use(i18n().middleware())
      .get('/', (req, ctx) => {
        setFn = (ctx as any).i18n.set
        return new Response('ok')
      })
      .getReq('/')
      .send()

    assert.ok(setFn)
    const res = setFn!('zh-CN', '/home')

    assert.equal(res.status, 302)
    assert.equal(res.headers.get('location'), '/home')
    assert.ok(res.headers.get('set-cookie')?.includes('locale=zh-CN'))
  })

  it('__lang/:locale route sets cookie and returns JSON by default', async () => {
    const l = i18n()
    const app = testApp()
    app._router.mount('/', l)

    const res = await app.getReq('/__lang/zh-CN')
      .header('accept', 'application/json')
      .send()

    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(body, { ok: true, locale: 'zh-CN' })
    assert.ok(res.headers.get('set-cookie')?.includes('locale=zh-CN'))
  })

  it('__lang/:locale redirects for HTML requests', async () => {
    const l = i18n()
    const app = testApp()
    app._router.mount('/', l)

    const res = await app.getReq('/__lang/fr')
      .header('referer', '/about')
      .send()

    assert.equal(res.status, 302)
    assert.equal(res.headers.get('location'), '/about')
    assert.ok(res.headers.get('set-cookie')?.includes('locale=fr'))
  })

  it('cookie takes precedence with inline messages', async () => {
    const messages = {
      en: { hello: 'Hello' },
      zh: { hello: '你好' },
    }

    let tFn: any

    await testApp()
      .use(i18n({ messages }).middleware())
      .get('/', (req, ctx) => {
        tFn = (ctx as any).i18n.t
        return new Response('ok')
      })
      .getReq('/')
      .header('cookie', 'locale=zh')
      .send()

    assert.equal(tFn('hello'), '你好')
  })

  it('disables Accept-Language when fromAcceptLanguage is false', async () => {
    let captured: any = 'not-set'

    await testApp()
      .use(i18n({ fromAcceptLanguage: false }).middleware())
      .get('/', (req, ctx) => {
        captured = (ctx as any).i18n
        return new Response('ok')
      })
      .getReq('/')
      .header('accept-language', 'fr-FR')
      .send()

    assert.equal(captured.locale, 'en')
  })

  it('disables cookie when cookie option is empty', async () => {
    let captured: any = 'not-set'

    await testApp()
      .use(i18n({ cookie: '' }).middleware())
      .get('/', (req, ctx) => {
        captured = (ctx as any).i18n
        return new Response('ok')
      })
      .getReq('/')
      .header('cookie', 'locale=zh')
      .send()

    assert.equal(captured.locale, 'en')
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { testApp } from '../test/test-utils.ts'
import { theme } from '../middleware/theme.ts'

describe('theme', () => {
  it('injects ctx.theme with default value', async () => {
    let capturedTheme: unknown = 'not-set'

    await testApp()
      .use(theme().middleware())
      .get('/', (req, ctx) => {
        capturedTheme = (ctx as any).theme
        return new Response('ok')
      })
      .getReq('/')
      .send()

    assert.deepEqual(capturedTheme, {
      value: 'system',
      set: (capturedTheme as any).set,
    })
  })

  it('reads theme from cookie', async () => {
    let capturedTheme: unknown = 'not-set'

    await testApp()
      .use(theme().middleware())
      .get('/', (req, ctx) => {
        capturedTheme = (ctx as any).theme
        return new Response('ok')
      })
      .getReq('/')
      .header('cookie', 'theme=dark')
      .send()

    assert.equal((capturedTheme as any).value, 'dark')
  })

  it('respects custom default', async () => {
    let capturedTheme: unknown = 'not-set'

    await testApp()
      .use(theme({ default: 'light' }).middleware())
      .get('/', (req, ctx) => {
        capturedTheme = (ctx as any).theme
        return new Response('ok')
      })
      .getReq('/')
      .send()

    assert.equal((capturedTheme as any).value, 'light')
  })

  it('theme.set() returns 302 redirect with cookie', async () => {
    let setFn: ((value: string, loc?: string) => Response) | undefined

    await testApp()
      .use(theme().middleware())
      .get('/', (req, ctx) => {
        setFn = (ctx as any).theme.set
        return new Response('ok')
      })
      .getReq('/')
      .send()

    assert.ok(setFn)
    const res = setFn!('dark', '/settings')

    assert.equal(res.status, 302)
    assert.equal(res.headers.get('location'), '/settings')
    assert.ok(res.headers.get('set-cookie')?.includes('theme=dark'))
  })

  it('theme.set() defaults to Referer', async () => {
    let setFn: ((value: string, loc?: string) => Response) | undefined

    await testApp()
      .use(theme().middleware())
      .get('/', (req, ctx) => {
        setFn = (ctx as any).theme.set
        return new Response('ok')
      })
      .getReq('/')
      .header('referer', '/previous')
      .send()

    const res = setFn!('light')
    assert.equal(res.headers.get('location'), '/previous')
  })

  it('disables cookie when cookie option is empty string', async () => {
    let capturedTheme: unknown = 'not-set'

    await testApp()
      .use(theme({ cookie: '' }).middleware())
      .get('/', (req, ctx) => {
        capturedTheme = (ctx as any).theme
        return new Response('ok')
      })
      .getReq('/')
      .header('cookie', 'theme=dark')
      .send()

    // With empty cookie name, theme should not read from cookie
    assert.equal((capturedTheme as any).value, 'system')
  })

  it('__theme/:value route sets cookie and redirects (HTML)', async () => {
    const t = theme()
    const app = testApp()
    app._router.mount('/', t)

    const res = await app.getReq('/__theme/dark')
      .header('referer', '/home')
      .send()

    assert.equal(res.status, 302)
    assert.equal(res.headers.get('location'), '/home')
    assert.ok(res.headers.get('set-cookie')?.includes('theme=dark'))
  })

  it('__theme/:value route returns JSON when Accept: application/json', async () => {
    const t = theme()
    const app = testApp()
    app._router.mount('/', t)

    const res = await app.getReq('/__theme/light')
      .header('accept', 'application/json')
      .send()

    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(body, { ok: true, theme: 'light' })
    assert.ok(res.headers.get('set-cookie')?.includes('theme=light'))
  })

  it('respects custom cookie name in route switch', async () => {
    const t = theme({ cookie: 'preferred_theme' })
    const app = testApp()
    app._router.mount('/', t)

    const res = await app.getReq('/__theme/light')
      .header('accept', 'application/json')
      .send()

    assert.ok(res.headers.get('set-cookie')?.includes('preferred_theme=light'))
  })
})

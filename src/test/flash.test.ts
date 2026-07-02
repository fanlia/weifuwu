import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { testApp } from '../test/test-utils.ts'
import { flash } from '../middleware/flash.ts'

function ok() { return new Response('ok') }

describe('flash', () => {
  it('injects ctx.flash.value (empty when no cookie)', async () => {
    let capturedFlash: unknown = 'not-set'

    const res = await testApp()
      .use(flash())
      .get('/', (req, ctx) => {
        capturedFlash = (ctx as any).flash?.value
        return new Response('ok')
      })
      .getReq('/')
      .send()

    assert.equal(res.status, 200)
    assert.equal(capturedFlash, undefined)
  })

  it('parses flash value from cookie', async () => {
    let capturedFlash: unknown = 'not-set'
    const flashData = encodeURIComponent(JSON.stringify({ type: 'success', text: 'Saved!' }))

    await testApp()
      .use(flash())
      .get('/', (req, ctx) => {
        capturedFlash = (ctx as any).flash?.value
        return new Response('ok')
      })
      .getReq('/')
      .header('cookie', `flash=${flashData}`)
      .send()

    assert.deepEqual(capturedFlash, { type: 'success', text: 'Saved!' })
  })

  it('clears flash cookie after reading', async () => {
    const flashData = encodeURIComponent(JSON.stringify({ text: 'hello' }))

    const res = await testApp()
      .use(flash())
      .get('/', (req, ctx) => {
        return new Response('ok')
      })
      .getReq('/')
      .header('cookie', `flash=${flashData}`)
      .send()

    assert.equal(res.status, 200)
    const setCookie = res.headers.get('set-cookie')
    assert.ok(setCookie?.includes('flash=;'), 'should clear flash cookie')
    assert.ok(setCookie?.includes('Max-Age=0'), 'should set Max-Age=0')
  })

  it('ctx.flash.set() returns 302 redirect with flash cookie', async () => {
    let setFn: ((data: unknown, loc?: string) => Response) | undefined

    await testApp()
      .use(flash())
      .get('/set', (req, ctx) => {
        setFn = (ctx as any).flash?.set
        return new Response('ok')
      })
      .getReq('/set')
      .send()

    assert.ok(setFn, 'flash.set should be defined')
    const res = setFn!({ type: 'info', text: 'updated' }, '/dashboard')

    assert.equal(res.status, 302)
    assert.equal(res.headers.get('location'), '/dashboard')
    const setCookie = res.headers.get('set-cookie')
    assert.ok(setCookie?.includes('flash='), 'should set flash cookie')
  })

  it('flash.set() defaults to Referer when no location', async () => {
    let setFn: ((data: unknown, loc?: string) => Response) | undefined

    await testApp()
      .use(flash())
      .get('/save', (req, ctx) => {
        setFn = (ctx as any).flash?.set
        return new Response('ok')
      })
      .getReq('/save')
      .header('referer', '/previous-page')
      .send()

    const res = setFn!({ text: 'done' })
    assert.equal(res.status, 302)
    assert.equal(res.headers.get('location'), '/previous-page')
  })

  it('flash.set() defaults to / when no Referer either', async () => {
    let setFn: ((data: unknown, loc?: string) => Response) | undefined

    await testApp()
      .use(flash())
      .get('/save', (req, ctx) => {
        setFn = (ctx as any).flash?.set
        return new Response('ok')
      })
      .getReq('/save')
      .send()

    const res = setFn!({ text: 'done' })
    assert.equal(res.status, 302)
    assert.equal(res.headers.get('location'), '/')
  })

  it('respects custom cookie name', async () => {
    const flashData = encodeURIComponent(JSON.stringify({ text: 'hello' }))
    let capturedFlash: unknown = 'not-set'

    const res = await testApp()
      .use(flash({ name: 'msg' }))
      .get('/', (req, ctx) => {
        capturedFlash = (ctx as any).flash?.value
        return new Response('ok')
      })
      .getReq('/')
      .header('cookie', `msg=${flashData}`)
      .send()

    assert.deepEqual(capturedFlash, { text: 'hello' })
    assert.ok(res.headers.get('set-cookie')?.includes('msg=;'), 'should clear custom named cookie')
  })
})

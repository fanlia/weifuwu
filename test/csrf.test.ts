import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { testApp } from '../test/test-utils.ts'
import { csrf } from '../middleware/csrf.ts'

describe('csrf', () => {
  it('sets cookie and ctx.csrf.token on GET', async () => {
    const app = testApp()
      .use(csrf())
      .get('/data', () => new Response('ok'))
    const res = await app.getReq('/data').send()
    assert.equal(res.status, 200)
    const setCookie = res.headers.get('set-cookie')
    assert.ok(setCookie, 'should have set-cookie')
    assert.ok(setCookie!.includes('_csrf'))
  })

  it('reuses existing cookie token on GET', async () => {
    const app = testApp()
      .use(csrf())
      .get('/data', () => new Response('ok'))
    const res1 = await app.getReq('/data').send()
    const cookie = res1.headers.get('set-cookie')?.split(';')[0]

    const res2 = await app
      .getReq('/data')
      .header('cookie', cookie ?? '')
      .send()
    assert.equal(res2.status, 200)
    // Should not set a new cookie (same token)
    assert.equal(res2.headers.get('set-cookie'), null)
  })

  it('passes POST with valid token', async () => {
    const app = testApp()
      .use(csrf())
      .post('/data', () => new Response('ok'))
    const handler = app.handler()

    // First GET to get the token
    const getRes = await handler(new Request('http://localhost/data'), {
      params: {},
      query: {},
    } as any)
    const cookie = getRes.headers.get('set-cookie')!
    const token = cookie.split(';')[0].split('=')[1]

    const res = await handler(
      new Request('http://localhost/data', {
        method: 'POST',
        headers: { cookie, 'x-csrf-token': token },
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
  })

  it('rejects POST with mismatched token', async () => {
    const app = testApp()
      .use(csrf())
      .post('/data', () => new Response('ok'))
    const handler = app.handler()

    const getRes = await handler(new Request('http://localhost/data'), {
      params: {},
      query: {},
    } as any)
    const cookie = getRes.headers.get('set-cookie')!

    const res = await handler(
      new Request('http://localhost/data', {
        method: 'POST',
        headers: { cookie, 'x-csrf-token': 'wrong-token' },
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 403)
  })

  it('rejects POST with missing header', async () => {
    const app = testApp()
      .use(csrf())
      .post('/data', () => new Response('ok'))
    const handler = app.handler()

    const res = await handler(
      new Request('http://localhost/data', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 403)
  })

  it('reads token from request body when header is absent', async () => {
    const app = testApp()
      .use(csrf())
      .post('/data', () => new Response('ok'))
    const handler = app.handler()

    const getRes = await handler(new Request('http://localhost/data'), {
      params: {},
      query: {},
    } as any)
    const cookie = getRes.headers.get('set-cookie')!
    const token = cookie.split(';')[0].split('=')[1]

    const res = await handler(
      new Request('http://localhost/data', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ _csrf: token }),
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
  })

  it('accepts custom cookie/header/key names', async () => {
    const app = testApp()
      .use(csrf({ cookie: 'my_csrf', header: 'x-xsrf-token' }))
      .post('/data', () => new Response('ok'))
    const handler = app.handler()

    const getRes = await handler(new Request('http://localhost/data'), {
      params: {},
      query: {},
    } as any)
    const cookie = getRes.headers.get('set-cookie')!
    assert.ok(cookie.includes('my_csrf'))
    const token = cookie.split(';')[0].split('=')[1]

    const res = await handler(
      new Request('http://localhost/data', {
        method: 'POST',
        headers: { cookie, 'x-xsrf-token': token },
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
  })

  it('excludes custom methods', async () => {
    const app = testApp()
      .use(csrf({ excludeMethods: ['GET', 'POST', 'HEAD', 'OPTIONS'] }))
      .post('/data', () => new Response('ok'))
    const handler = app.handler()

    const res = await handler(new Request('http://localhost/data', { method: 'POST' }), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.status, 200)
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { testApp } from '../test/test-utils.ts'
import { csrf } from '../middleware/csrf.ts'

function ok() { return new Response('ok') }

describe('csrf', () => {
  it('generates token and sets cookie on GET', async () => {
    const res = await testApp()
      .use(csrf())
      .get('/', ok)
      .getReq('/')
      .send()

    assert.equal(res.status, 200)
    const setCookie = res.headers.get('set-cookie')
    assert.ok(setCookie?.includes('_csrf='))
    assert.ok(setCookie?.includes('HttpOnly'))
    assert.ok(setCookie?.includes('SameSite=strict'))
  })

  it('does not overwrite existing cookie', async () => {
    const res = await testApp()
      .use(csrf())
      .get('/', ok)
      .getReq('/')
      .header('cookie', '_csrf=existing-token')
      .send()

    assert.equal(res.status, 200)
    assert.equal(res.headers.get('set-cookie'), null)
  })

  it('rejects POST with empty body', async () => {
    const res = await testApp()
      .use(csrf())
      .post('/submit', ok)
      .postReq('/submit')
      .header('content-type', 'application/json')
      .send()

    // No body → json() fails → caught → 400
    assert.equal(res.status, 400)
  })

  it('rejects POST without CSRF token in body', async () => {
    const res = await testApp()
      .use(csrf())
      .post('/submit', ok)
      .postReq('/submit')
      .header('content-type', 'application/json')
      .body({ data: 'no-csrf' })
      .send()

    // Has body but no _csrf → 403
    assert.equal(res.status, 403)
  })

  it('accepts POST with matching header token', async () => {
    const res = await testApp()
      .use(csrf())
      .post('/submit', ok)
      .postReq('/submit')
      .header('content-type', 'application/json')
      .header('cookie', '_csrf=mytoken')
      .header('x-csrf-token', 'mytoken')
      .body({})
      .send()

    assert.equal(res.status, 200)
  })

  it('rejects POST when tokens mismatch', async () => {
    const res = await testApp()
      .use(csrf())
      .post('/submit', ok)
      .postReq('/submit')
      .header('content-type', 'application/json')
      .header('cookie', '_csrf=abc')
      .header('x-csrf-token', 'xyz')
      .body({})
      .send()

    assert.equal(res.status, 403)
  })

  it('skips validation for GET', async () => {
    const res = await testApp()
      .use(csrf())
      .get('/data', ok)
      .getReq('/data')
      .send()

    assert.equal(res.status, 200)
  })

  it('respects custom cookie name', async () => {
    const res = await testApp()
      .use(csrf({ cookie: 'xsrf-token' }))
      .post('/submit', ok)
      .postReq('/submit')
      .header('content-type', 'application/json')
      .header('cookie', 'xsrf-token=mycustom')
      .header('x-csrf-token', 'mycustom')
      .body({})
      .send()

    assert.equal(res.status, 200)
  })

  it('respects custom header name', async () => {
    const res = await testApp()
      .use(csrf({ header: 'x-xsrf-token' }))
      .post('/submit', ok)
      .postReq('/submit')
      .header('content-type', 'application/json')
      .header('cookie', '_csrf=mycustom')
      .header('x-xsrf-token', 'mycustom')
      .body({})
      .send()

    assert.equal(res.status, 200)
  })

  it('reads token from JSON body when header missing', async () => {
    const res = await testApp()
      .use(csrf())
      .post('/submit', ok)
      .postReq('/submit')
      .header('content-type', 'application/json')
      .header('cookie', '_csrf=mytoken')
      .body({ _csrf: 'mytoken' })
      .send()

    assert.equal(res.status, 200)
  })

  it('respects custom body key', async () => {
    const res = await testApp()
      .use(csrf({ key: 'csrf_token' }))
      .post('/submit', ok)
      .postReq('/submit')
      .header('content-type', 'application/json')
      .header('cookie', '_csrf=mytoken')
      .body({ csrf_token: 'mytoken' })
      .send()

    assert.equal(res.status, 200)
  })

  it('respects custom excludeMethods', async () => {
    const res = await testApp()
      .use(csrf({ excludeMethods: ['GET', 'POST'] }))
      .post('/submit', ok)
      .postReq('/submit')
      .header('content-type', 'application/json')
      .body({})
      .send()

    assert.equal(res.status, 200)
  })

  it('validates PUT', async () => {
    const res = await testApp()
      .use(csrf())
      .put('/item', ok)
      .putReq('/item')
      .header('content-type', 'application/json')
      .header('cookie', '_csrf=mytoken')
      .header('x-csrf-token', 'mytoken')
      .body({})
      .send()

    assert.equal(res.status, 200)
  })

  it('validates DELETE', async () => {
    const res = await testApp()
      .use(csrf())
      .delete('/item', ok)
      .deleteReq('/item')
      .header('content-type', 'application/json')
      .header('cookie', '_csrf=mytoken')
      .header('x-csrf-token', 'mytoken')
      .body({})
      .send()

    assert.equal(res.status, 200)
  })
})

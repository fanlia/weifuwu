import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { csrf } from '../csrf.ts'

function mockReq(method: string, headers: Record<string, string> = {}, body?: string) {
  return {
    method,
    headers: new Map(Object.entries(headers)) as any,
    clone: () => ({
      json: async () => body ? JSON.parse(body) : {},
    }),
  } as any
}

function mockCtx() {
  return {} as any
}

describe('csrf', () => {
  it('sets cookie and ctx.csrfToken on GET', async () => {
    const mw = csrf()
    const req = mockReq('GET')
    const ctx = mockCtx()
    let nextCalled = false

    const res = await mw(req, ctx, async () => {
      nextCalled = true
      return new Response('ok')
    })

    assert.ok(nextCalled)
    assert.equal(typeof ctx.csrfToken, 'string')
    assert.ok(ctx.csrfToken.length > 0)
    assert.ok(res.headers.get('set-cookie')?.includes('_csrf='))
    assert.ok(res.headers.get('set-cookie')?.includes('HttpOnly'))
    assert.ok(res.headers.get('set-cookie')?.includes('SameSite=strict'))
  })

  it('reuses existing cookie token on GET', async () => {
    const mw = csrf()
    const token = crypto.randomUUID()
    const req = mockReq('GET', { cookie: `_csrf=${token}` })
    const ctx = mockCtx()

    await mw(req, ctx, async () => new Response('ok'))

    assert.equal(ctx.csrfToken, token)
  })

  it('does not set cookie if token already exists', async () => {
    const mw = csrf()
    const token = crypto.randomUUID()
    const req = mockReq('GET', { cookie: `_csrf=${token}` })
    const ctx = mockCtx()

    const res = await mw(req, ctx, async () => new Response('ok'))

    assert.equal(ctx.csrfToken, token)
    assert.equal(res.headers.get('set-cookie'), null)
  })

  it('passes POST with valid token', async () => {
    const mw = csrf()
    const token = crypto.randomUUID()
    const req = mockReq('POST', {
      cookie: `_csrf=${token}`,
      'x-csrf-token': token,
    })
    let passed = false

    await mw(req, mockCtx(), async () => {
      passed = true
      return new Response('ok')
    })

    assert.ok(passed)
  })

  it('rejects POST with mismatched token', async () => {
    const mw = csrf()
    const req = mockReq('POST', {
      cookie: '_csrf=abc123',
      'x-csrf-token': 'wrong-token',
    })

    const res = await mw(req, mockCtx(), async () => new Response('ok'))

    assert.equal(res.status, 403)
  })

  it('rejects POST with missing header', async () => {
    const mw = csrf()
    const req = mockReq('POST', { cookie: '_csrf=abc123' })

    const res = await mw(req, mockCtx(), async () => new Response('ok'))

    assert.equal(res.status, 403)
  })

  it('reads token from request body when header is absent', async () => {
    const mw = csrf()
    const token = crypto.randomUUID()
    const req = mockReq('POST', { cookie: `_csrf=${token}` }, JSON.stringify({ _csrf: token }))
    let passed = false

    await mw(req, mockCtx(), async () => {
      passed = true
      return new Response('ok')
    })

    assert.ok(passed)
  })

  it('accepts custom cookie/header/key names', async () => {
    const mw = csrf({ cookie: 'x_token', header: 'x-token', key: 'token' })
    const token = crypto.randomUUID()
    const req = mockReq('POST', {
      cookie: `x_token=${token}`,
      'x-token': token,
    })
    let passed = false

    await mw(req, mockCtx(), async () => {
      passed = true
      return new Response('ok')
    })

    assert.ok(passed)
  })

  it('excludes custom methods', async () => {
    const mw = csrf({ excludeMethods: ['GET', 'HEAD', 'OPTIONS', 'TRACE'] })
    const req = mockReq('TRACE')
    let passed = false

    const res = await mw(req, mockCtx(), async () => {
      passed = true
      return new Response('ok')
    })

    assert.ok(passed)
    assert.ok(res.headers.get('set-cookie')?.includes('_csrf='))
  })

  it('rejects with 400 when body is invalid JSON', async () => {
    const mw = csrf()
    const req = mockReq('POST', { cookie: '_csrf=abc123' }, 'not-valid-json')
    const res = await mw(req, mockCtx(), async () => new Response('ok'))
    assert.equal(res.status, 400)
  })

  it('reads token from body for PUT method', async () => {
    const mw = csrf()
    const token = crypto.randomUUID()
    const req = mockReq('PUT', { cookie: `_csrf=${token}` }, JSON.stringify({ _csrf: token }))
    let passed = false

    await mw(req, mockCtx(), async () => {
      passed = true
      return new Response('ok')
    })

    assert.ok(passed)
  })

  it('reads token from body for PATCH method', async () => {
    const mw = csrf()
    const token = crypto.randomUUID()
    const req = mockReq('PATCH', { cookie: `_csrf=${token}` }, JSON.stringify({ _csrf: token }))
    let passed = false

    await mw(req, mockCtx(), async () => {
      passed = true
      return new Response('ok')
    })

    assert.ok(passed)
  })

  it('reads token from body for DELETE method', async () => {
    const mw = csrf()
    const token = crypto.randomUUID()
    const req = mockReq('DELETE', { cookie: `_csrf=${token}` }, JSON.stringify({ _csrf: token }))
    let passed = false

    await mw(req, mockCtx(), async () => {
      passed = true
      return new Response('ok')
    })

    assert.ok(passed)
  })
})

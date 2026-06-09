import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '../types.ts'
import { helmet } from '../helmet.ts'

describe('helmet', () => {
  it('sets default security headers', async () => {
    const mw = helmet()
    const res = await mw(
      new Request('http://localhost/'),
      { params: {}, query: {} } as Context,
      async () => new Response('ok'),
    )
    assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff')
    assert.equal(res.headers.get('X-Frame-Options'), 'SAMEORIGIN')
    assert.equal(res.headers.get('X-XSS-Protection'), '0')
    assert.equal(res.headers.get('Strict-Transport-Security'), 'max-age=15552000; includeSubDomains')
    assert.equal(res.headers.get('Referrer-Policy'), 'no-referrer')
    assert.equal(res.headers.get('X-DNS-Prefetch-Control'), 'off')
    assert.equal(res.headers.get('X-Download-Options'), 'noopen')
    assert.equal(res.headers.get('X-Permitted-Cross-Domain-Policies'), 'none')
    assert.equal(res.headers.get('Cross-Origin-Embedder-Policy'), 'require-corp')
    assert.equal(res.headers.get('Cross-Origin-Opener-Policy'), 'same-origin')
    assert.equal(res.headers.get('Cross-Origin-Resource-Policy'), 'same-origin')
    assert.equal(res.headers.get('Origin-Agent-Cluster'), '?1')
    assert.ok(res.headers.get('Content-Security-Policy'))
    assert.ok(res.headers.get('Permissions-Policy'))
  })

  it('allows overriding a header', async () => {
    const mw = helmet({ xFrameOptions: 'DENY' })
    const res = await mw(
      new Request('http://localhost/'),
      { params: {}, query: {} } as Context,
      async () => new Response('ok'),
    )
    assert.equal(res.headers.get('X-Frame-Options'), 'DENY')
  })

  it('removes a header when set to false', async () => {
    const mw = helmet({ xFrameOptions: false })
    const res = await mw(
      new Request('http://localhost/'),
      { params: {}, query: {} } as Context,
      async () => new Response('ok'),
    )
    assert.equal(res.headers.get('X-Frame-Options'), null)
  })

  it('does not override existing headers on the response', async () => {
    const mw = helmet({ strictTransportSecurity: 'max-age=31536000' })
    const res = await mw(
      new Request('http://localhost/'),
      { params: {}, query: {} } as Context,
      async () => new Response('ok', {
        headers: { 'Strict-Transport-Security': 'max-age=1' },
      }),
    )
    assert.equal(res.headers.get('Strict-Transport-Security'), 'max-age=1')
  })

  it('allows custom CSP', async () => {
    const mw = helmet({ contentSecurityPolicy: "default-src 'none'" })
    const res = await mw(
      new Request('http://localhost/'),
      { params: {}, query: {} } as Context,
      async () => new Response('ok'),
    )
    assert.equal(res.headers.get('Content-Security-Policy'), "default-src 'none'")
  })

  it('removes CSP when set to false', async () => {
    const mw = helmet({ contentSecurityPolicy: false })
    const res = await mw(
      new Request('http://localhost/'),
      { params: {}, query: {} } as Context,
      async () => new Response('ok'),
    )
    assert.equal(res.headers.get('Content-Security-Policy'), null)
  })

  it('preserves other response headers', async () => {
    const mw = helmet()
    const res = await mw(
      new Request('http://localhost/'),
      { params: {}, query: {} } as Context,
      async () => new Response('ok', { headers: { 'x-custom': 'val' } }),
    )
    assert.equal(res.headers.get('x-custom'), 'val')
  })

  it('explicit undefined option removes default header', async () => {
    const mw = helmet({ xFrameOptions: undefined })
    const res = await mw(
      new Request('http://localhost/'),
      { params: {}, query: {} } as Context,
      async () => new Response('ok'),
    )
    assert.equal(res.headers.get('X-Frame-Options'), null)
  })
})

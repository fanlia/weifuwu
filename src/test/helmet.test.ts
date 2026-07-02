import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../core/router.ts'
import { helmet } from '../middleware/helmet.ts'

function mkCtx() { return { params: {}, query: {} } as any }

describe('helmet', () => {
  it('sets X-Content-Type-Options', async () => {
    const r = new Router().use(helmet()).get('/', () => new Response('ok'))
    const res = await r.handler()(new Request('http://localhost/'), mkCtx())
    assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff')
  })

  it('sets X-Frame-Options', async () => {
    const r = new Router().use(helmet()).get('/', () => new Response('ok'))
    const res = await r.handler()(new Request('http://localhost/'), mkCtx())
    assert.equal(res.headers.get('X-Frame-Options'), 'SAMEORIGIN')
  })

  it('sets Referrer-Policy', async () => {
    const r = new Router().use(helmet()).get('/', () => new Response('ok'))
    const res = await r.handler()(new Request('http://localhost/'), mkCtx())
    assert.equal(res.headers.get('Referrer-Policy'), 'no-referrer')
  })

  it('sets X-XSS-Protection', async () => {
    const r = new Router().use(helmet()).get('/', () => new Response('ok'))
    const res = await r.handler()(new Request('http://localhost/'), mkCtx())
    assert.equal(res.headers.get('X-XSS-Protection'), '0')
  })

  it('sets Strict-Transport-Security', async () => {
    const r = new Router().use(helmet()).get('/', () => new Response('ok'))
    const res = await r.handler()(new Request('http://localhost/'), mkCtx())
    assert.ok(res.headers.get('Strict-Transport-Security')?.includes('max-age='))
  })

  it('allows customizing CSP', async () => {
    const r = new Router()
      .use(helmet({ contentSecurityPolicy: "default-src 'self'" }))
      .get('/', () => new Response('ok'))
    const res = await r.handler()(new Request('http://localhost/'), mkCtx())
    assert.equal(res.headers.get('Content-Security-Policy'), "default-src 'self'")
  })
})

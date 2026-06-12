import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { testApp } from '../test-utils.ts'
import { helmet } from '../helmet.ts'

describe('helmet', () => {
  function mkReq() {
    return testApp().use(helmet()).get('/data', () => new Response('ok'))
  }

  it('sets default security headers', async () => {
    const res = await mkReq().getReq('/data').send()
    assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff')
    assert.equal(res.headers.get('X-Frame-Options'), 'SAMEORIGIN')
  })

  it('allows overriding a header', async () => {
    const res = await testApp()
      .use(helmet({ xFrameOptions: 'DENY' }))
      .get('/data', () => new Response('ok'))
      .getReq('/data')
      .send()
    assert.equal(res.headers.get('X-Frame-Options'), 'DENY')
  })

  it('removes a header when set to false', async () => {
    const res = await testApp()
      .use(helmet({ xFrameOptions: false as any }))
      .get('/data', () => new Response('ok'))
      .getReq('/data')
      .send()
    assert.equal(res.headers.get('X-Frame-Options'), null)
  })

  it('does not override existing headers on the response', async () => {
    const res = await testApp()
      .use(helmet())
      .get('/data', () => new Response('ok', { headers: { 'X-Frame-Options': 'ALLOW' } }))
      .getReq('/data')
      .send()
    assert.equal(res.headers.get('X-Frame-Options'), 'ALLOW')
  })

  it('allows custom CSP', async () => {
    const res = await testApp()
      .use(helmet({ contentSecurityPolicy: "default-src 'none'" }))
      .get('/data', () => new Response('ok'))
      .getReq('/data')
      .send()
    assert.equal(res.headers.get('Content-Security-Policy'), "default-src 'none'")
  })

  it('removes CSP when set to false', async () => {
    const res = await testApp()
      .use(helmet({ contentSecurityPolicy: false as any }))
      .get('/data', () => new Response('ok'))
      .getReq('/data')
      .send()
    assert.equal(res.headers.get('Content-Security-Policy'), null)
  })

  it('preserves other response headers', async () => {
    const res = await testApp()
      .use(helmet())
      .get('/data', () => new Response('ok', { headers: { 'X-Custom': 'value' } }))
      .getReq('/data')
      .send()
    assert.equal(res.headers.get('X-Custom'), 'value')
  })

  it('explicit undefined option removes default header', async () => {
    const res = await testApp()
      .use(helmet({ strictTransportSecurity: undefined }))
      .get('/data', () => new Response('ok'))
      .getReq('/data')
      .send()
    assert.equal(res.headers.get('Strict-Transport-Security'), null)
  })
})

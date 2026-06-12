import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { testApp } from '../test-utils.ts'
import { requestId } from '../request-id.ts'

describe('requestId', () => {
  it('sets X-Request-ID header', async () => {
    const res = await testApp()
      .use(requestId())
      .get('/data', () => new Response('ok'))
      .getReq('/data')
      .send()
    assert.ok(res.headers.get('X-Request-ID'))
  })

  it('preserves incoming X-Request-ID', async () => {
    const res = await testApp()
      .use(requestId())
      .get('/data', () => new Response('ok'))
      .getReq('/data')
      .header('X-Request-ID', 'incoming-id')
      .send()
    assert.equal(res.headers.get('X-Request-ID'), 'incoming-id')
  })

  it('uses custom header name', async () => {
    const res = await testApp()
      .use(requestId({ header: 'X-Trace-Id' }))
      .get('/data', () => new Response('ok'))
      .getReq('/data')
      .send()
    assert.ok(res.headers.get('X-Trace-Id'))
    assert.equal(res.headers.get('X-Request-ID'), null)
  })

  it('uses custom generator', async () => {
    const res = await testApp()
      .use(requestId({ generator: () => 'custom-id' }))
      .get('/data', () => new Response('ok'))
      .getReq('/data')
      .send()
    assert.equal(res.headers.get('X-Request-ID'), 'custom-id')
  })

  it('does not override existing response header', async () => {
    const res = await testApp()
      .use(requestId())
      .get('/data', () => new Response('ok', { headers: { 'X-Request-ID': 'existing' } }))
      .getReq('/data')
      .send()
    assert.equal(res.headers.get('X-Request-ID'), 'existing')
  })
})

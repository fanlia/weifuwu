import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '../types.ts'
import { requestId } from '../request-id.ts'

describe('requestId', () => {
  it('sets X-Request-ID header', async () => {
    const mw = requestId()
    const ctx = { params: {}, query: {} } as Context
    const res = await mw(
      new Request('http://localhost/'),
      ctx,
      async () => new Response('ok'),
    )
    const id = res.headers.get('X-Request-ID')
    assert.ok(id)
    assert.equal(id, ctx.requestId)
  })

  it('preserves incoming X-Request-ID', async () => {
    const mw = requestId()
    const ctx = { params: {}, query: {} } as Context
    const res = await mw(
      new Request('http://localhost/', { headers: { 'X-Request-ID': 'incoming-id' } }),
      ctx,
      async () => new Response('ok'),
    )
    assert.equal(res.headers.get('X-Request-ID'), 'incoming-id')
    assert.equal(ctx.requestId, 'incoming-id')
  })

  it('uses custom header name', async () => {
    const mw = requestId({ header: 'X-Trace-Id' })
    const ctx = { params: {}, query: {} } as Context
    const res = await mw(
      new Request('http://localhost/'),
      ctx,
      async () => new Response('ok'),
    )
    assert.ok(res.headers.get('X-Trace-Id'))
    assert.equal(res.headers.get('X-Request-ID'), null)
  })

  it('uses custom generator', async () => {
    const mw = requestId({ generator: () => 'custom-id' })
    const ctx = { params: {}, query: {} } as Context
    const res = await mw(
      new Request('http://localhost/'),
      ctx,
      async () => new Response('ok'),
    )
    assert.equal(res.headers.get('X-Request-ID'), 'custom-id')
    assert.equal(ctx.requestId, 'custom-id')
  })

  it('does not override existing response header', async () => {
    const mw = requestId()
    const ctx = { params: {}, query: {} } as Context
    const res = await mw(
      new Request('http://localhost/'),
      ctx,
      async () => new Response('ok', {
        headers: { 'X-Request-ID': 'response-id' },
      }),
    )
    assert.equal(res.headers.get('X-Request-ID'), 'response-id')
  })
})

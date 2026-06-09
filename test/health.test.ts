import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '../types.ts'
import { health } from '../health.ts'

describe('health', () => {
  it('returns 200 on /health', async () => {
    const r = health()
    const res = await r.handler()(
      new Request('http://localhost/'),
      { params: {}, query: {} } as Context,
    )
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'OK')
  })

  it('supports custom path', async () => {
    const r = health({ path: '/healthz' })
    const res = await r.handler()(
      new Request('http://localhost/healthz'),
      { params: {}, query: {} } as Context,
    )
    assert.equal(res.status, 200)
  })

  it('returns 503 when custom check fails', async () => {
    const r = health({
      check: async () => { throw new Error('db down') },
    })
    const res = await r.handler()(
      new Request('http://localhost/'),
      { params: {}, query: {} } as Context,
    )
    assert.equal(res.status, 503)
  })

  it('handles HEAD request', async () => {
    const r = health({ path: '/_health' })
    const res = await r.handler()(
      new Request('http://localhost/_health', { method: 'HEAD' }),
      { params: {}, query: {} } as Context,
    )
    assert.equal(res.status, 200)
  })
})

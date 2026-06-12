import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { testApp } from '../test-utils.ts'
import { health } from '../health.ts'

describe('health', () => {
  it('returns 200 on GET', async () => {
    const res = await health().handler()(
      new Request('http://localhost/__health'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'OK')
  })

  it('returns 200 on HEAD', async () => {
    const res = await health().handler()(
      new Request('http://localhost/__health', { method: 'HEAD' }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
  })

  it('returns 503 when check throws', async () => {
    const res = await health({ check: () => { throw new Error('db down') } }).handler()(
      new Request('http://localhost/__health'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 503)
    assert.equal(await res.text(), 'Service Unavailable')
  })

  it('supports custom path', async () => {
    const res = await health({ path: '/__healthz' }).handler()(
      new Request('http://localhost/__healthz'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
  })
})

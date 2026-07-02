import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { redis } from '../redis/index.ts'

describe('redis', () => {
  const r = redis()
  const c = r.redis

  after(async () => {
    await c.flushdb()
    await r.close()
  })

  it('set and get string', async () => {
    await c.set('test:key', 'hello')
    const val = await c.get('test:key')
    assert.equal(val, 'hello')
  })

  it('delete key', async () => {
    await c.set('test:del', 'bye')
    await c.del('test:del')
    const val = await c.get('test:del')
    assert.equal(val, null)
  })

  it('increments counter', async () => {
    await c.set('test:counter', '0')
    await c.incr('test:counter')
    await c.incr('test:counter')
    assert.equal(await c.get('test:counter'), '2')
  })

  it('ctx.redis is injected by middleware', async () => {
    let captured: any
    await r(
      new Request('http://localhost/'),
      {} as any,
      async (req, ctx: any) => {
        captured = ctx.redis
        return new Response('ok')
      })
    assert.ok(captured)
  })
})

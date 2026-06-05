import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { WebSocketServer, WebSocket } from 'ws'
import { createHub } from '../hub.ts'
import type { Redis } from 'ioredis'

const REDIS_URL = process.env.REDIS_URL ?? process.env.TEST_REDIS_URL

describe('createHub', () => {
  it('join / leave / broadcast in-memory', () => {
    const hub = createHub()
    let callCount = 0
    const ws = { send: () => callCount++ } as any as WebSocket

    hub.join('room:1', ws)
    hub.broadcast('room:1', 'hello')
    assert.equal(callCount, 1)
    hub.broadcast('room:1', 'world')
    assert.equal(callCount, 2)

    // Different room — no send
    hub.broadcast('room:2', 'nobody')
    assert.equal(callCount, 2)

    hub.leave(ws)
    hub.broadcast('room:1', 'gone')
    assert.equal(callCount, 2)
  })

  it('broadcasts to all members of a key', () => {
    const hub = createHub()
    const ws1 = { send: () => c1++ } as any
    const ws2 = { send: () => c2++ } as any
    let c1 = 0, c2 = 0

    hub.join('ch', ws1)
    hub.join('ch', ws2)
    hub.broadcast('ch', 'data')

    assert.equal(c1, 1)
    assert.equal(c2, 1)
  })

  it('leave removes from all keys', () => {
    const hub = createHub()
    const ws = { send: () => count++ } as any
    let count = 0

    hub.join('a', ws)
    hub.join('b', ws)
    hub.leave(ws)
    hub.broadcast('a', 'x')
    hub.broadcast('b', 'x')
    assert.equal(count, 0)
  })

  it('close clears everything', async () => {
    const hub = createHub()
    const ws = { send: () => count++ } as any
    let count = 0

    hub.join('x', ws)
    await hub.close()
    hub.broadcast('x', 'after-close')
    assert.equal(count, 0)
  })

  describe('with Redis', { skip: !REDIS_URL }, () => {
    let redis: Redis
    let otherRedis: Redis
    let redisSub: Redis

    before(async () => {
      const { Redis } = await import('ioredis')
      redis = new Redis(REDIS_URL!)
      otherRedis = new Redis(REDIS_URL!)
      redisSub = new Redis(REDIS_URL!)
    })

    after(async () => {
      await redis.quit()
      await otherRedis.quit()
      await redisSub.quit()
    })

    it('broadcasts cross-process via Redis', async () => {
      const hubA = createHub({ redis })
      const hubB = createHub({ redis: otherRedis })

      const received: string[] = []
      const wsB = { send: (d: string) => received.push(d) } as any as WebSocket
      hubB.join('room:1', wsB)

      // Wait for Redis subscription to register
      await new Promise(r => setTimeout(r, 100))

      hubA.broadcast('room:1', { text: 'cross-process' })

      await new Promise(r => setTimeout(r, 100))

      assert.equal(received.length, 1)
      assert.equal(JSON.parse(received[0]).text, 'cross-process')

      await hubA.close()
      await hubB.close()
    })

    it('does not duplicate on same process', async () => {
      const hub = createHub({ redis })

      const received: string[] = []
      const ws = { send: (d: string) => received.push(d) } as any as WebSocket
      hub.join('dup', ws)

      await new Promise(r => setTimeout(r, 100))

      hub.broadcast('dup', { n: 1 })

      await new Promise(r => setTimeout(r, 100))

      // Local broadcast + Redis forward = exactly 1 (not 2)
      assert.equal(received.length, 1)

      await hub.close()
    })
  })
})

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { RedisPool } from './pool.ts'
import { RedisSubscriber } from './subscriber.ts'

// CS-04: 真实 redis
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const port = Number(new URL(REDIS_URL).port || 6379)

describe('redis pub/sub (real database)', () => {
  const CH = `wf_pubsub_${process.pid}`
  let pub: RedisPool
  let sub: RedisSubscriber

  before(async () => {
    pub = await RedisPool.create({ port, poolSize: 2 })
    sub = new RedisSubscriber({ port })
    await sub.connect()
  })

  after(async () => {
    await sub.close()
    await pub.close()
  })

  it('subscribe receives published messages', async () => {
    const received: string[] = []
    await sub.subscribe(CH, (channel, message) => received.push(message))
    await new Promise((r) => setTimeout(r, 100)) // 等订阅生效
    await pub.publish(CH, 'hello-pubsub')
    await new Promise((r) => setTimeout(r, 200))
    assert.deepEqual(received, ['hello-pubsub'])
  })

  it('psubscribe matches pattern channels', async () => {
    const received: { channel: string; message: string }[] = []
    await sub.psubscribe(`${CH}:*`, (channel, message) => received.push({ channel, message }))
    await new Promise((r) => setTimeout(r, 100))
    await pub.publish(`${CH}:room1`, 'msg-1')
    await pub.publish(`${CH}:room2`, 'msg-2')
    await new Promise((r) => setTimeout(r, 200))
    assert.equal(received.length, 2)
    assert.ok(received.some((r) => r.channel === `${CH}:room1` && r.message === 'msg-1'))
    assert.ok(received.some((r) => r.channel === `${CH}:room2` && r.message === 'msg-2'))
  })
})

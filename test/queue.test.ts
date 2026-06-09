import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { Redis } from 'ioredis'
import { queue } from '../queue/index.ts'
import type { Queue, QueueJob } from '../queue/types.ts'

const REDIS_URL = process.env.TEST_REDIS_URL ?? process.env.REDIS_URL

describe('queue', { skip: !REDIS_URL }, () => {
  let q: Queue

  before(async () => {
    const r = new Redis(REDIS_URL)
    await r.del('testq:jobs')
    await r.quit()
    q = queue({ url: REDIS_URL, prefix: 'testq' })
  })

  after(async () => {
    q.stop()
    const r = new Redis(REDIS_URL)
    await r.del('testq:jobs')
    await r.quit()
    await q.close()
  })

  it('processes an immediate job', async () => {
    const received: QueueJob[] = []
    q.process('immediate', async (job) => { received.push(job) })
    await q.run()

    const id = await q.add('immediate', { msg: 'hello' })
    assert.ok(id)

    await new Promise(r => setTimeout(r, 500))
    assert.equal(received.length, 1)
    assert.equal(received[0].id, id)
    assert.equal(received[0].type, 'immediate')
    assert.deepEqual(received[0].payload, { msg: 'hello' })
    assert.ok(received[0].createdAt)
    assert.ok(received[0].runAt <= Date.now())

    q.stop()
  })

  it('processes a delayed job', async () => {
    const received: QueueJob[] = []
    q.process('delayed', async (job) => { received.push(job) })

    const start = Date.now()
    await q.add('delayed', { x: 1 }, { delay: 300 })
    q.run()

    await new Promise(r => setTimeout(r, 200))
    assert.equal(received.length, 0, 'should not fire before delay')

    await new Promise(r => setTimeout(r, 250))
    assert.equal(received.length, 1)
    assert.ok(received[0].runAt - start >= 300)

    q.stop()
  })

  it('schedules a cron job and re-queues next occurrence', async () => {
    const received: QueueJob[] = []
    q.process('cron', async (job) => { received.push(job) })

    await q.add('cron', { n: 1 }, { schedule: '* * * * *' })
    q.run()

    // Manually bump the job score to now so the poller picks it up immediately
    const r = new Redis(REDIS_URL)
    const raw = await r.zrange('testq:jobs', 0, 0)
    assert.ok(raw.length > 0, 'cron job should be in the queue')
    await r.zadd('testq:jobs', Date.now(), raw[0])

    // Wait for poller (200ms interval)
    await new Promise(r2 => setTimeout(r2, 500))
    assert.equal(received.length, 1)
    assert.equal(received[0].payload.n, 1)
    assert.equal(received[0].schedule, '* * * * *')

    // Check the re-queued next occurrence exists
    const remaining = await r.zcard('testq:jobs')
    assert.equal(remaining, 1, 'next occurrence should be re-queued')
    await r.quit()

    q.stop()
  })

  it('injects ctx.queue via middleware', async () => {
    let captured: Queue | null = null
    const handler = q as unknown as (req: Request, ctx: any, next: any) => any
    await handler(
      new Request('http://localhost/'),
      { params: {}, query: {} } as any,
      (_req: any, ctx: any) => {
        captured = ctx.queue
        return new Response('ok')
      },
    )
    assert.ok(captured)
    assert.equal(typeof captured!.add, 'function')
    assert.equal(typeof captured!.process, 'function')
  })

  it('supports multiple job types independently', async () => {
    const emails: QueueJob[] = []
    const logs: QueueJob[] = []
    q.process('email', async (job) => { emails.push(job) })
    q.process('log', async (job) => { logs.push(job) })

    await q.add('email', { to: 'a@b.com' })
    await q.add('log', { level: 'info' })
    await q.add('email', { to: 'c@d.com' })
    q.run()

    await new Promise(r => setTimeout(r, 500))

    assert.equal(emails.length, 2)
    assert.equal(logs.length, 1)
    assert.equal(emails[0].payload.to, 'a@b.com')
    assert.equal(emails[1].payload.to, 'c@d.com')
    assert.equal(logs[0].payload.level, 'info')

    q.stop()
  })
})

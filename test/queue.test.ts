import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { Redis } from 'ioredis'
import { queue } from '../queue/index.ts'
import { postgres } from '../postgres/index.ts'
import type { Queue, QueueJob } from '../queue/types.ts'

// ── In-memory mode (no Redis required) ────────────────────────────────

describe('queue (memory)', () => {
  let q: Queue

  after(() => { if (q) q.stop() })

  it('processes an immediate job', async () => {
    q = queue()
    const received: QueueJob[] = []
    q.process('test', async (job) => { received.push(job) })
    await q.add('test', { msg: 'hello' })
    q.run()
    await new Promise(r => setTimeout(r, 300))
    assert.equal(received.length, 1)
    assert.equal(received[0].payload.msg, 'hello')
  })

  it('processes a delayed job', async () => {
    q = queue({ pollInterval: 50 })
    const received: QueueJob[] = []
    q.process('delayed', async (job) => { received.push(job) })
    const start = Date.now()
    await q.add('delayed', { x: 1 }, { delay: 100 })
    q.run()
    await new Promise(r => setTimeout(r, 50))
    assert.equal(received.length, 0)
    await new Promise(r => setTimeout(r, 150))
    assert.equal(received.length, 1)
    assert.ok(received[0].runAt - start >= 100)
  })

  it('schedules a cron job', async () => {
    q = queue()
    const received: QueueJob[] = []
    q.process('cron', async (job) => { received.push(job) })
    const now = new Date()
    const pattern = `${now.getMinutes()} ${now.getHours()} ${now.getDate()} ${now.getMonth() + 1} *`
    await q.add('cron', { n: 1 }, { schedule: pattern })
    q.run()
    await new Promise(r => setTimeout(r, 300))
    assert.equal(received.length, 1)
  })

  it('handles failed jobs and retry', async () => {
    q = queue()
    let fail = true
    q.process('flaky', async () => { if (fail) throw new Error('oops') })
    await q.add('flaky', { x: 1 })
    q.run()
    await new Promise(r => setTimeout(r, 300))
    const failed = await q.failedJobs()
    assert.equal(failed.length, 1)
    fail = false
    await q.retryFailed(failed[0].id)
    await new Promise(r => setTimeout(r, 300))
  })
})

// ── PostgreSQL mode (requires DATABASE_URL) ────────────────────────────

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

describe('queue (pg)', { skip: !DATABASE_URL }, () => {
  const pgConn = postgres({ connection: DATABASE_URL })
  let q: Queue

  before(async () => {
    await pgConn.sql.unsafe('DROP TABLE IF EXISTS "testpgq_jobs"')
  })

  after(async () => {
    if (q) q.stop()
    await pgConn.sql.unsafe('DROP TABLE IF EXISTS "testpgq_jobs"')
    await pgConn.close()
  })

  function freshQueue() {
    if (q) q.stop()
    q = queue({ pg: pgConn as any, prefix: 'testpgq', pollInterval: 50 })
    return q
  }

  it('processes an immediate job', async () => {
    const qq = freshQueue()
    await (qq as any).migrate()
    qq.run()
    const received: QueueJob[] = []
    qq.process('test', async (job) => { received.push(job) })
    await qq.add('test', { msg: 'hello' })
    await new Promise(r => setTimeout(r, 200))
    assert.equal(received.length, 1)
  })

  it('processes a delayed job', async () => {
    const qq = freshQueue()
    qq.run()
    const received: QueueJob[] = []
    qq.process('delayed', async (job) => { received.push(job) })
    await qq.add('delayed', { x: 1 }, { delay: 150 })
    await new Promise(r => setTimeout(r, 80))
    assert.equal(received.length, 0)
    await new Promise(r => setTimeout(r, 150))
    assert.equal(received.length, 1)
  })

  it('schedules a cron job', async () => {
    const qq = freshQueue()
    qq.run()
    const received: QueueJob[] = []
    qq.process('cron-pg', async (job) => { received.push(job) })
    const now = new Date()
    const pattern = `${now.getMinutes()} ${now.getHours()} ${now.getDate()} ${now.getMonth() + 1} *`
    await qq.add('cron-pg', { n: 1 }, { schedule: pattern })
    await new Promise(r => setTimeout(r, 200))
    assert.equal(received.length, 1)
  })

  it('handles failed jobs', async () => {
    const qq = freshQueue()
    qq.run()
    qq.process('flaky-pg', async () => { throw new Error('oops') })
    await qq.add('flaky-pg', { x: 1 })
    await new Promise(r => setTimeout(r, 200))
    const failed = await qq.failedJobs()
    assert.equal(failed.length, 1)
    assert.equal(failed[0].error, 'oops')
  })

  it('supports multiple job types', async () => {
    const qq = freshQueue()
    qq.run()
    const emails: QueueJob[] = []
    const logs: QueueJob[] = []
    qq.process('email', async (job) => { emails.push(job) })
    qq.process('log', async (job) => { logs.push(job) })
    await qq.add('email', { to: 'a@b.com' })
    await qq.add('log', { level: 'info' })
    await qq.add('email', { to: 'c@d.com' })
    await new Promise(r => setTimeout(r, 200))
    assert.equal(emails.length, 2)
    assert.equal(logs.length, 1)
  })
})

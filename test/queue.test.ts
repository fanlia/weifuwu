import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { queue } from '../queue/index.ts'
import { postgres } from '../postgres/index.ts'
import type { Queue, QueueJob } from '../queue/types.ts'

// ── Memory mode ─────────────────────────────────────────────────────

describe('queue (memory)', () => {
  let q: Queue
  function freshQ() {
    if (q) q.stop()
    q = queue({ store: 'memory', pollInterval: 50 })
    return q
  }

  after(() => {
    if (q) q.stop()
  })

  it('processes an immediate job', async () => {
    const qq = freshQ()
    const r: QueueJob[] = []
    qq.process('t', async (j) => {
      r.push(j)
    })
    await qq.add('t', { x: 1 })
    qq.run()
    await new Promise((r2) => setTimeout(r2, 100))
    assert.equal(r.length, 1)
  })

  it('processes a delayed job', async () => {
    const qq = freshQ()
    const r: QueueJob[] = []
    qq.process('t', async (j) => {
      r.push(j)
    })
    await qq.add('t', {}, { delay: 60 })
    qq.run()
    await new Promise((r2) => setTimeout(r2, 30))
    assert.equal(r.length, 0)
    await new Promise((r2) => setTimeout(r2, 80))
    assert.equal(r.length, 1)
  })

  it('cron registers and executes', async () => {
    const qq = freshQ()
    let called = false
    qq.cron('*/1 * * * *', () => {
      called = true
    })
    qq.run()
    await new Promise((r) => setTimeout(r, 100))
    assert.ok(called)
  })

  it('handles failed jobs and retry', async () => {
    const qq = freshQ()
    let fail = true
    qq.process('f', async () => {
      if (fail) throw new Error('oops')
    })
    await qq.add('f', {})
    qq.run()
    await new Promise((r) => setTimeout(r, 100))
    const failed = await qq.failedJobs()
    assert.equal(failed.length, 1)
    fail = false
    await qq.retryFailed(failed[0].id)
    await new Promise((r) => setTimeout(r, 100))
    assert.equal((await qq.failedJobs()).length, 0)
  })
})

// ── PostgreSQL mode ──────────────────────────────────────────────────

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

describe('queue (pg)', { skip: !DATABASE_URL }, () => {
  const pgConn = postgres({ connection: DATABASE_URL })
  let q: Queue

  before(async () => {
    await pgConn.sql.unsafe('DROP TABLE IF EXISTS "testq_jobs"')
  })

  after(async () => {
    if (q) q.stop()
    await pgConn.sql.unsafe('DROP TABLE IF EXISTS "testq_jobs"')
    await pgConn.close()
  })

  function freshQ() {
    if (q) q.stop()
    q = queue({ store: 'pg', pg: pgConn as any, prefix: 'testq', pollInterval: 30 })
    return q
  }

  it('processes an immediate job', async () => {
    const qq = freshQ()
    await (qq as any).migrate()
    qq.run()
    const r: QueueJob[] = []
    qq.process('t', async (j) => {
      r.push(j)
    })
    await qq.add('t', { x: 1 })
    await new Promise((r2) => setTimeout(r2, 100))
    assert.equal(r.length, 1)
  })

  it('cron registers and executes', async () => {
    const qq = freshQ()
    let called = false
    qq.cron('*/1 * * * *', () => {
      called = true
    })
    qq.run()
    await new Promise((r) => setTimeout(r, 100))
    assert.ok(called)
  })

  it('handles failed jobs', async () => {
    const qq = freshQ()
    qq.run()
    qq.process('f', async () => {
      throw new Error('oops')
    })
    await qq.add('f', {})
    await new Promise((r) => setTimeout(r, 100))
    const failed = await qq.failedJobs()
    assert.equal(failed.length, 1)
    assert.equal(failed[0].error, 'oops')
  })
})

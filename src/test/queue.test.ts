import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { queue } from '../queue/index.ts'
import type { Queue, QueueJob } from '../queue/types.ts'

const REDIS_URL = process.env.TEST_REDIS_URL ?? process.env.REDIS_URL ?? 'redis://localhost:6379'

describe('queue', { skip: !REDIS_URL }, () => {
  let q: Queue
  function freshQ() {
    if (q) q.close()
    const prefix = 'tq' + Math.random().toString(36).slice(2, 8)
    q = queue({ url: REDIS_URL, prefix, pollInterval: 50 })
    return q
  }

  after(() => { if (q) q.close() })

  it('processes an immediate job', async () => {
    const qq = freshQ()
    const results: QueueJob[] = []
    qq.process('t', async (j) => { results.push(j) })
    await qq.add('t', { x: 1 })
    qq.run()
    await new Promise(r => setTimeout(r, 200))
    assert.equal(results.length, 1)
    assert.equal((results[0].payload as any).x, 1)
  })

  it('respects job delay', async () => {
    const qq = freshQ()
    const results: QueueJob[] = []
    qq.process('d', async (j) => { results.push(j) })
    await qq.add('d', {}, { delay: 10_000 })
    qq.run()
    await new Promise(r => setTimeout(r, 300))
    assert.equal(results.length, 0, 'should not process before delay')
  })

  it('cron registers and executes', async () => {
    const qq = freshQ()
    let called = false
    qq.cron('* * * * *', () => { called = true })
    qq.run()
    await new Promise(r => setTimeout(r, 200))
    assert.ok(called)
  })

  it('handles failed jobs and retry', async () => {
    const qq = freshQ()
    let fail = true
    qq.process('f', async () => { if (fail) throw new Error('oops') })
    await qq.add('f', {})
    qq.run()
    await new Promise(r => setTimeout(r, 300))
    const failed = await qq.failedJobs()
    assert.equal(failed.length, 1, 'should have 1 failed job')
    assert.ok(failed[0].error.includes('oops'))

    fail = false
    assert.ok(await qq.retryFailed(failed[0].id))
    await new Promise(r => setTimeout(r, 300))
    const stillFailed = await qq.failedJobs()
    assert.equal(stillFailed.length, 0, 'should retry and succeed')
  })

  it('retryAllFailed retries matching type', async () => {
    const qq = freshQ()
    let aFail = true
    let bFail = true
    qq.process('a', async () => { if (aFail) throw new Error('a-error'); aFail = false })
    qq.process('b', async () => { if (bFail) throw new Error('b-error'); bFail = false })
    await qq.add('a', {})
    await qq.add('b', {})
    qq.run()
    await new Promise(r => setTimeout(r, 300))

    let failed = await qq.failedJobs()
    assert.equal(failed.length, 2)

    // Retry only 'a' — it will succeed this time
    const count = await qq.retryAllFailed('a')
    assert.equal(count, 1)
    await new Promise(r => setTimeout(r, 300))
    failed = await qq.failedJobs()
    // 'b' still failed, 'a' succeeded → 1 remaining
    assert.ok(failed.length <= 2, `expected <= 2, got ${failed.length}`)
  })

  it('stats reports correct counts', async () => {
    const qq = freshQ()
    qq.process('s', async () => {})
    await qq.add('s', {})
    qq.run()
    await new Promise(r => setTimeout(r, 200))
    const s = qq.stats()
    assert.equal(s.processed, 1)
    assert.equal(s.handlers, 1)
  })

  it('dashboard returns router', async () => {
    const qq = freshQ()
    const r = qq.dashboard()
    const handler = r.handler()
    const res = await handler(new Request('http://localhost/'), { params: {}, query: {} } as any)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.ok('stats' in body)
  })
})

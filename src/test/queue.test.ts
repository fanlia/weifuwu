import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { queue } from '../queue/index.ts'

const prefix = 'tq' + Math.random().toString(36).slice(2, 6)

describe('queue', () => {
  const q = queue({ prefix, pollInterval: 50 })

  after(async () => { await q.close() })

  it('processes an immediate job', async () => {
    const results: any[] = []
    q.process('t', async (j) => { results.push(j) })
    await q.add('t', { x: 1 })
    q.run()
    await new Promise(r => setTimeout(r, 200))
    assert.equal(results.length, 1)
    assert.equal(results[0].payload.x, 1)
  })

  it('handles failed jobs', async () => {
    q.process('f', async () => { throw new Error('oops') })
    await q.add('f', {})
    q.run()
    await new Promise(r => setTimeout(r, 200))
    const failed = await q.failedJobs()
    assert.ok(failed.length >= 1)
    assert.ok(failed.some(j => j.error?.includes('oops')))
  })

  it('cron registers and executes', async () => {
    let called = false
    q.cron('* * * * *', () => { called = true })
    q.run()
    await new Promise(r => setTimeout(r, 200))
    assert.ok(called)
  })

  it('stats returns counts', () => {
    const s = q.stats()
    assert.ok('running' in s)
    assert.ok('handlers' in s)
  })

  it('dashboard returns router', async () => {
    const r = q.dashboard()
    const res = await r.handler()(new Request('http://localhost/'), { params: {}, query: {} } as any)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.ok('stats' in body)
  })
})

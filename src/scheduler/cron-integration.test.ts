/**
 * scheduler cron 集成测试（CS-04：真库）
 *
 * cron 粒度分钟级——测试需等分钟边界（≤60s），单独文件 + 大 timeout：
 *   timeout 70 node --env-file=.env --test --test-timeout=65000 src/scheduler/cron-integration.test.ts
 */
import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { queue } from '../queue/index.ts'
import { scheduler } from './index.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const qname = () => `t-${randomUUID().toString().slice(0, 8)}`

async function waitFor(cond: () => boolean, timeout: number, label: string) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await cond()) return
    await sleep(50)
  }
  throw new Error(`waitFor timeout: ${label}`)
}

describe('scheduler cron tasks (real redis)', () => {
  const q = queue()
  const sched = scheduler({ queue: q, tickMs: 100 })

  after(async () => {
    await sched.close()
    await q.close()
  })

  it('cron 每分钟任务：注册后到分钟边界触发入队（worker 消费）', async () => {
    const name = qname()
    const received: unknown[] = []
    const worker = q.queue.worker<any>(name, async (job) => { received.push(job.data) }, { blockMs: 50 })
    await worker.start()

    await sched.cron('* * * * *', name, { scope: 'health' })
    const t0 = Date.now()
    await waitFor(() => received.length >= 1, 65_000, 'cron 触发')
    assert.ok(Date.now() - t0 >= 1000, '应在分钟边界后触发（非立即）')
    assert.deepEqual(received[0], { scope: 'health' })
    await worker.stop()
  })

  it('非法 cron 表达式注册立即抛错（不静默）', async () => {
    await assert.rejects(sched.cron('60 * * * *', qname()), /out of range/)
    await assert.rejects(sched.cron('* * * *', qname()), /expected 5 fields/)
  })

  it('多实例不重复触发：两个 scheduler 同注册，cron 触发一次', async () => {
    const name = qname()
    const received: unknown[] = []
    const worker = q.queue.worker<any>(name, async (job) => { received.push(job.data) }, { blockMs: 50 })
    await worker.start()

    const q2 = queue()
    const sched2 = scheduler({ queue: q2, tickMs: 100 })
    try {
      await sched.cron('* * * * *', name, { multi: true })
      await sched2.cron('* * * * *', name, { multi: true })
      await waitFor(() => received.length >= 1, 65_000, 'cron 触发')
      await sleep(1200)
      assert.equal(received.length, 1, `多实例应只触发一次（实际 ${received.length}）`)
    } finally {
      await sched2.close()
      await q2.close()
    }
    await worker.stop()
  })
})

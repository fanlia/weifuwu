/**
 * scheduler cron 集成测试（CS-04：真库）
 *
 * 触发加速：注册后直接 HSET nextRunAt 为过去（模拟"到点"）——不等分钟边界
 * （nextRun 的分钟计算已由解析器测试覆盖；此处验证注册→到期→触发→入队链路）
 */
import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { RedisConnection } from '../db/redis/connection.ts'
import { queue } from '../queue/index.ts'
import { scheduler } from './index.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const qname = () => `t-${randomUUID().toString().slice(0, 8)}`
const CRONS = 'wf:sched:crons'

async function waitFor(cond: () => boolean, timeout: number, label: string) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await cond()) return
    await sleep(50)
  }
  throw new Error(`waitFor timeout: ${label}`)
}

/** 把 cron 的 nextRunAt 改为过去——立即触发（模拟到点） */
async function expireNow(field: string) {
  const conn = new RedisConnection({ host: 'localhost', port: 6379 })
  await conn.connect()
  const raw = await conn.command('HGET', CRONS, field)
  if (raw !== null) {
    const def = JSON.parse(String(raw))
    await conn.command('HSET', CRONS, field, JSON.stringify({ ...def, nextRunAt: Date.now() - 1000 }))
  }
  await conn.close()
}

describe('scheduler cron tasks (real redis)', () => {
  const q = queue()
  const sched = scheduler({ queue: q, tickMs: 100 })

  after(async () => {
    await sched.close()
    await q.close()
  })

  it('cron 注册后到点触发入队（worker 消费），nextRunAt 推进', async () => {
    const name = qname()
    const received: unknown[] = []
    const worker = q.queue.worker<any>(name, async (job) => { received.push(job.data) }, { blockMs: 50 })
    await worker.start()

    await sched.cron('* * * * *', name, { scope: 'health' })
    const field = `${name}:* * * * *`
    await expireNow(field)
    await waitFor(() => received.length >= 1, 5000, 'cron 到期触发')
    assert.deepEqual(received[0], { scope: 'health' })
    // nextRunAt 已推进到下一次（HASH 里不再 <= now）
    const conn = new RedisConnection({ host: 'localhost', port: 6379 })
    await conn.connect()
    const raw = await conn.command('HGET', CRONS, field)
    const def = JSON.parse(String(raw))
    assert.ok(def.nextRunAt > Date.now(), 'nextRunAt 应推进到未来')
    await conn.close()
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
      await expireNow(`${name}:* * * * *`)
      await waitFor(() => received.length >= 1, 5000, 'cron 触发')
      await sleep(500)
      assert.equal(received.length, 1, `多实例应只触发一次（实际 ${received.length}）`)
    } finally {
      await sched2.close()
      await q2.close()
    }
    await worker.stop()
  })
})

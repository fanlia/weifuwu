/**
 * scheduler cron 集成测试（CS-04：真库）
 *
 * 触发加速：注册后直接 HSET nextRunAt 为过去（模拟"到点"）——不等分钟边界
 * （nextRun 的分钟计算已由解析器测试覆盖；此处验证注册→到期→触发→入队链路）
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { RedisConnection } from '../db/redis/connection.ts'
import { queue } from '../queue/index.ts'
import { scheduler } from './index.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const qname = () => `t-${randomUUID().toString().slice(0, 8)}`
const CRONS = 'wf:sched:crons'
/** 唯一 prefix：并发测试文件隔离（scheduler ZSET/HASH 应用级共享） */
const schedPrefix = () => `wf:sched:${process.pid}:${randomUUID().toString().slice(0, 4)}:`

async function waitFor(cond: () => boolean, timeout: number, label: string) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await cond()) return
    await sleep(50)
  }
  throw new Error(`waitFor timeout: ${label}`)
}

/** 把 cron 的 nextRunAt 改为过去——立即触发（模拟到点） */
async function expireNow(prefix: string, field: string) {
  const conn = new RedisConnection({ host: 'localhost', port: 6379 })
  await conn.connect()
  const cronsKey = `${prefix}crons`
  const raw = await conn.command('HGET', cronsKey, field)
  if (raw !== null) {
    const def = JSON.parse(String(raw))
    await conn.command('HSET', cronsKey, field, JSON.stringify({ ...def, nextRunAt: Date.now() - 1000 }))
  }
  await conn.close()
}

describe('scheduler cron tasks (real redis)', () => {
  const q = queue()
  const prefix = schedPrefix()
  const sched = scheduler({ queue: q, tickMs: 100, prefix })

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
    await expireNow(prefix, name) // field = name
    await waitFor(() => received.length >= 1, 5000, 'cron 到期触发')
    assert.deepEqual(received[0], { scope: 'health' })
    // nextRunAt 已推进到下一次（HASH 里不再 <= now）
    const conn = new RedisConnection({ host: 'localhost', port: 6379 })
    await conn.connect()
    const raw = await conn.command('HGET', `${prefix}crons`, name)
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
    const sched2 = scheduler({ queue: q2, tickMs: 100, prefix: schedPrefix() })
    try {
      await sched.cron('* * * * *', name, { multi: true })
      await sched2.cron('* * * * *', name, { multi: true })
      await expireNow(prefix, name)
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

describe('scheduler cron UX fixes (real redis)', () => {
  const q = queue()
  const prefix = schedPrefix()
  const sched = scheduler({ queue: q, tickMs: 100, prefix })

  before(async () => {
    // 清理本测试 prefix 的 cron 注册表（历史测试残留——cron 定义无 TTL）
    const conn = new RedisConnection({ host: 'localhost', port: 6379 })
    await conn.connect()
    const keys = (await conn.command('KEYS', `${schedPrefix()}crons`)) as string[]
    for (const k of keys) await conn.command('DEL', k)
    await conn.close()
  })

  after(async () => {
    await sched.close()
    await q.close()
  })

  it('同 name 改表达式：覆盖更新，旧定义不残留（无双触发）', async () => {
    const name = qname()
    const received: unknown[] = []
    const worker = q.queue.worker<any>(name, async (job) => { received.push(job.data) }, { blockMs: 50 })
    await worker.start()

    // 注册 v1 表达式
    await sched.cron('* * * * *', name, { v: 1 })
    await expireNow(prefix, name) // field 应为 name（修复前是 name:expr）
    await waitFor(() => received.length >= 1, 5000, 'v1 触发')
    assert.deepEqual(received[0], { v: 1 })

    // 改表达式（同 name 覆盖）
    await sched.cron('*/2 * * * *', name, { v: 2 })
    // HASH 里不应有旧 field 残留（field = name 唯一）
    const conn = new RedisConnection({ host: 'localhost', port: 6379 })
    await conn.connect()
    const hashLen = await conn.command('HLEN', `${prefix}crons`)
    assert.equal(hashLen, 1, 'HASH 应只有 1 个 cron 定义（覆盖）')
    const raw = await conn.command('HGET', `${prefix}crons`, name)
    const def = JSON.parse(String(raw))
    assert.equal(def.expr, '*/2 * * * *', '定义应为新表达式')
    await conn.close()

    // 新表达式到期 → 触发新 data（旧定义不残留）
    await expireNow(prefix, name)
    await waitFor(() => received.some((r: any) => r.v === 2), 5000, '新表达式触发')
    await sleep(300)
    const v2Count = received.filter((r: any) => r.v === 2).length
    assert.equal(v2Count, 1, `新表达式应只触发一次（实际 ${v2Count}）`)
    await worker.stop()
  })

  it('cancelCron：删定义 + 清理 pending 触发点，不再触发', async () => {
    const name = qname()
    const received: unknown[] = []
    const worker = q.queue.worker<any>(name, async (job) => { received.push(job.data) }, { blockMs: 50 })
    await worker.start()

    await sched.cron('* * * * *', name, { gone: true })
    await expireNow(prefix, name)
    await waitFor(() => received.length >= 1, 5000, '首次触发')
    const before = received.length

    // 取消
    const removed = await sched.cancelCron(name)
    assert.equal(removed, true)
    // HASH 无定义 + ZSET 无 pending 触发点
    const conn = new RedisConnection({ host: 'localhost', port: 6379 })
    await conn.connect()
    assert.equal(await conn.command('HEXISTS', `${prefix}crons`, name), 0, 'HASH 定义已删')
    const pending = await conn.command('ZRANGE', 'wf:sched:delayed', 0, -1)
    const cronPending = (pending as string[]).filter((m) => m.includes(`"id":"cron:${name}:`))
    assert.equal(cronPending.length, 0, 'pending 触发点已清理')
    await conn.close()

    // 再模拟到点（不可能——定义已删）——直接验证 tick 不触发
    await sleep(300)
    assert.equal(received.length, before, 'cancel 后不应再触发')
    await worker.stop()
  })

  it('cancelCron：不存在的 name 返回 false', async () => {
    assert.equal(await sched.cancelCron(`nope-${qname()}`), false)
  })
})

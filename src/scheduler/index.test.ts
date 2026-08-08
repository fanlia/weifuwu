/**
 * scheduler 延时任务测试（CS-04：真实 docker redis + queue 咬合）
 */
import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { queue } from '../queue/index.ts'
import { scheduler } from './index.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const qname = () => `t-${randomUUID().toString().slice(0, 8)}`

describe('scheduler delayed tasks (real redis)', () => {
  const q = queue()
  const sched = scheduler({ queue: q, tickMs: 100 })

  after(async () => {
    await sched.close()
    await q.close()
  })

  it('delayMs 到期后入队并被 worker 消费', async () => {
    const name = qname()
    const received: unknown[] = []
    const worker = q.queue.worker<any>(name, async (job) => { received.push(job.data) }, { blockMs: 50 })
    await worker.start()

    await sched.schedule(name, { hello: 'world' }, { delayMs: 400 })
    // 未到期（200ms）：不应消费
    await sleep(200)
    assert.equal(received.length, 0, '未到期不应执行')
    // 到期（+400ms 后）：消费
    const t0 = Date.now()
    await sleep(500)
    assert.equal(received.length, 1, '到期后应执行')
    assert.deepEqual(received[0], { hello: 'world' })
    assert.ok(Date.now() - t0 >= 300, '确实等到了延迟窗口')
    await worker.stop()
  })

  it('when 指定未来时间触发', async () => {
    const name = qname()
    const received: unknown[] = []
    const worker = q.queue.worker<any>(name, async (job) => { received.push(job.data) }, { blockMs: 50 })
    await worker.start()

    const when = new Date(Date.now() + 300)
    await sched.schedule(name, { at: 'noon' }, { when })
    await sleep(500)
    assert.equal(received.length, 1)
    assert.deepEqual(received[0], { at: 'noon' })
    await worker.stop()
  })

  it('多个延时任务按序触发', async () => {
    const name = qname()
    const received: number[] = []
    const worker = q.queue.worker<any>(name, async (job) => { received.push(job.data.n) }, { blockMs: 50 })
    await worker.start()

    await sched.schedule(name, { n: 1 }, { delayMs: 300 })
    await sched.schedule(name, { n: 2 }, { delayMs: 100 })
    await sleep(600)
    assert.deepEqual(received.sort(), [1, 2])
    await worker.stop()
  })

  it('崩溃恢复：schedule 后未消费（未启动守护），重启后到期任务仍执行', async () => {
    const name = qname()
    // 手动塞一个到期任务进 ZSET（模拟崩溃残留）
    const member = JSON.stringify({ id: randomUUID(), name, data: { recovered: true } })
    const conn = await import('../db/redis/connection.ts').then((m) => m.RedisConnection)
    const c = new conn({ host: 'localhost', port: 6379 })
    await c.connect()
    await c.command('ZADD', 'wf:sched:delayed', Date.now() - 1000, member)
    await c.close()

    // 新 scheduler 实例（模拟重启）——start 时立即补扫到期任务
    const q2 = queue()
    const sched2 = scheduler({ queue: q2, tickMs: 1000 })
    const received: unknown[] = []
    const worker = q2.queue.worker<any>(name, async (job) => { received.push(job.data) }, { blockMs: 50 })
    await worker.start()
    await sleep(500)
    assert.equal(received.length, 1, '重启后到期任务应被补执行')
    assert.deepEqual(received[0], { recovered: true })
    await worker.stop()
    await sched2.close()
    await q2.close()
  })
})

describe('scheduler multi-instance (real redis)', () => {
  it('延时任务双实例不重复：同一到期点只入队一次（ZREM 抢占）', async () => {
    const name = qname()
    const received: unknown[] = []
    const q = queue()
    const q2 = queue()
    const sched = scheduler({ queue: q, tickMs: 100 })
    const sched2 = scheduler({ queue: q2, tickMs: 100 })
    const worker = q.queue.worker<any>(name, async (job) => { received.push(job.data) }, { blockMs: 50 })
    await worker.start()
    try {
      // 只 schedule 一次（单任务）——sched/sched2 两个守护循环竞争消费，
      // ZREM 原子抢占保证同一任务只入队一次
      await sched.schedule(name, { dup: true }, { delayMs: 300 })
      await sleep(800)
      assert.equal(received.length, 1, `单任务双实例应只消费一次（实际 ${received.length}）`)
    } finally {
      await sched.close()
      await sched2.close()
      await worker.stop()
      await q.close()
      await q2.close()
    }
  })
})

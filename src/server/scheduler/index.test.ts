/**
 * scheduler 延时任务测试（CS-04：真实 docker redis + queue 咬合）
 */
import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { RedisPool } from '../db/redis/pool.ts'
import { MemoryRedis } from '../db/memory-redis.ts'
import { queue } from '../queue/index.ts'
import { scheduler } from './index.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** deadline 轮询（S9——SERVER-PERF-PLAN：替代固定 sleep 的正向断言——5s 上限，条件满足即过） */
const waitFor = async (cond: () => boolean, timeoutMs = 5000, message = ''): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(message || `waitFor timeout (${timeoutMs}ms)`)
    await sleep(50)
  }
}
const qname = () => `t-${randomUUID().toString().slice(0, 8)}`
/** 唯一 prefix：scheduler ZSET/HASH 是应用级共享的——并发测试文件必须隔离（多应用共享 redis 时同此语义） */
const schedPrefix = () => `wf:sched:${process.pid}:${randomUUID().toString().slice(0, 4)}:`

describe('scheduler delayed tasks (real redis)', () => {
  const r = new RedisPool({ host: 'localhost', port: 6379 })
  const q = queue({ redis: r })
  const sched = scheduler({ redis: r, queue: q, tickMs: 100, prefix: schedPrefix() })

  after(async () => {
    await sched.close()
    await q.close()
    await r.close()
  })

  it('delayMs 到期后入队并被 worker 消费', async () => {
    const name = qname()
    const received: unknown[] = []
    const worker = q.queue.worker<any>(name, async (job) => { received.push(job.data) }, { blockMs: 50 })
    await worker.start()

    const t0 = Date.now()
    await sched.schedule(name, { hello: 'world' }, { delayMs: 400 })
    // 未到期（200ms）：不应消费
    await sleep(200)
    assert.equal(received.length, 0, '未到期不应执行')
    // 到期（+400ms 后）：消费——deadline 轮询（负载下 tick 抖动不误报）
    await waitFor(() => received.length === 1)
    assert.deepEqual(received[0], { hello: 'world' })
    assert.ok(Date.now() - t0 >= 350, `消费发生在延迟窗口之后（实际 ${Date.now() - t0}ms）`)
    await worker.stop()
  })

  it('when 指定未来时间触发', async () => {
    const name = qname()
    const received: unknown[] = []
    const worker = q.queue.worker<any>(name, async (job) => { received.push(job.data) }, { blockMs: 50 })
    await worker.start()

    const when = new Date(Date.now() + 300)
    await sched.schedule(name, { at: 'noon' }, { when })
    await waitFor(() => received.length === 1)
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
    await waitFor(() => received.length === 2)
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
    const r2 = new RedisPool({ host: 'localhost', port: 6379 })
    const q2 = queue({ redis: r2 })
    const sched2 = scheduler({ redis: r2, queue: q2, tickMs: 1000 })
    const received: unknown[] = []
    const worker = q2.queue.worker<any>(name, async (job) => { received.push(job.data) }, { blockMs: 50 })
    await worker.start()
    await waitFor(() => received.length === 1)
    assert.deepEqual(received[0], { recovered: true })
    await worker.stop()
    await sched2.close()
    await q2.close()
    await r2.close()
  })
})

describe('scheduler multi-instance (real redis)', () => {
  it('延时任务双实例不重复：同一到期点只入队一次（ZREM 抢占）', async () => {
    const name = qname()
    const received: unknown[] = []
    const r = new RedisPool({ host: 'localhost', port: 6379 })
    const r2 = new RedisPool({ host: 'localhost', port: 6379 })
    const q = queue({ redis: r })
    const q2 = queue({ redis: r2 })
    // 双实例共享同一 prefix（多实例部署语义）——协作消费同一 ZSET
    const prefix = schedPrefix()
    const sched = scheduler({ redis: r, queue: q, tickMs: 100, prefix })
    const sched2 = scheduler({ redis: r2, queue: q2, tickMs: 100, prefix })
    const worker = q.queue.worker<any>(name, async (job) => { received.push(job.data) }, { blockMs: 50 })
    await worker.start()
    try {
      // 只 schedule 一次（单任务）——sched/sched2 两个守护循环竞争消费，
      // ZREM 原子抢占保证同一任务只入队一次
      await sched.schedule(name, { dup: true }, { delayMs: 300 })
      // 双实例 ZREM 抢占：等到首消费后再停 500ms 观察无重复（正负向分段——不盲等固定时长）
      await waitFor(() => received.length === 1)
      await sleep(500)
      assert.equal(received.length, 1, `单任务双实例应只消费一次（实际 ${received.length}）`)
    } finally {
      await sched.close()
      await sched2.close()
      await worker.stop()
      await q.close()
      await q2.close()
      await r.close()
      await r2.close()
    }
  })
})

describe('scheduler cancelSchedule (real redis)', () => {
  const r = new RedisPool({ host: 'localhost', port: 6379 })
  const q = queue({ redis: r })
  const sched = scheduler({ redis: r, queue: q, tickMs: 100, prefix: schedPrefix() })

  after(async () => {
    await sched.close()
    await q.close()
    await r.close()
  })

  it('取消未到期任务：不再触发', async () => {
    const name = qname()
    const received: unknown[] = []
    const worker = q.queue.worker<any>(name, async (job) => { received.push(job.data) }, { blockMs: 50 })
    await worker.start()

    const { id } = await sched.schedule(name, { n: 1 }, { delayMs: 500 })
    const removed = await sched.cancelSchedule(id)
    assert.equal(removed, true)
    await sleep(800)
    assert.equal(received.length, 0, '取消后不应触发')
    await worker.stop()
  })

  it('取消后同数据重新 schedule：作为新任务正常触发', async () => {
    const name = qname()
    const received: unknown[] = []
    const worker = q.queue.worker<any>(name, async (job) => { received.push(job.data) }, { blockMs: 50 })
    await worker.start()

    const { id } = await sched.schedule(name, { n: 2 }, { delayMs: 300 })
    await sched.cancelSchedule(id)
    await sched.schedule(name, { n: 3 }, { delayMs: 200 }) // 重新调度
    await waitFor(() => received.length === 1)
    assert.deepEqual(received, [{ n: 3 }], '重新调度的新任务应触发，取消的旧任务不触发')
    await worker.stop()
  })

  it('cancelSchedule 不存在的 id 返回 false', async () => {
    assert.equal(await sched.cancelSchedule('nope-nope'), false)
  })
})

describe('scheduler 韧性（S9/S13——stub 故障注入）', () => {
  it('S9 Redis 启动时不可用：connPromise 失败复位——恢复后 schedule 正常（原永久缓存拒绝）', async () => {
    let createAttempts = 0
    let conn: any = null
    const flakyRedis = {
      createConnection: async () => {
        createAttempts++
        if (createAttempts === 1) throw new Error('redis down at boot')
        conn = {
          command: async (cmd: string) => (cmd === 'ZADD' ? 1 : []),
          close: async () => {},
        }
        return conn
      },
      command: async () => 1,
      close: async () => {},
    }
    const q = queue({ redis: flakyRedis as any })
    const s = scheduler({ redis: flakyRedis as any, queue: q, tickMs: 60_000 })
    await sleep(30) // 等 init start() 失败 + 复位（微任务链）
    // 修复前：第一次 createConnection 拒绝被永久缓存 → schedule 永远抛（红）
    const r = await s.schedule('s9-test', { ok: true }, { delayMs: 0 })
    assert.ok(r.id, 'S9：启动失败后 connPromise 复位——恢复即正常')
    await s.close()
    await q.close()
  })

  it('S13 enqueue 失败恢复：queue.add 失败 → member 回写 ZSET（下 tick 重试成功——不丢失）', async () => {
    const mem = new MemoryRedis()
    let addCalls = 0
    const stubQueue = {
      queue: {
        add: async () => {
          addCalls++
          if (addCalls === 1) throw new Error('redis add boom')
          return { id: 'x' }
        },
      },
    }
    const s = scheduler({ redis: mem as any, queue: stubQueue as any, tickMs: 50 })
    await s.schedule('s13', { v: 1 }, { delayMs: 0 })
    // 修复前：第一次 add 失败即丢（ZREM 已移除）→ addCalls 永远 1（超时红）
    await waitFor(() => addCalls >= 2, 5000, 'S13：回写后第二次 add 成功')
    await s.close()
  })
})

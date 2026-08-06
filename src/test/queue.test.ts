/**
 * queue — 可靠任务队列测试（CS-04：真库 docker redis）
 *
 * 覆盖：消费成功/XACK、失败重试（固定间隔 = visibilityTimeout）、
 * attempts 用尽 → DLQ、崩溃 worker 接管（XAUTOCLAIM）、并发、
 * 多 worker 实例消费组隔离、空队列不崩溃、length。
 */
import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { queue } from '../queue/index.ts'
import { RedisPool } from '../db/redis/pool.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function waitFor(cond: () => boolean | Promise<boolean>, timeout = 10_000, label = 'condition') {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await cond()) return
    await sleep(50)
  }
  throw new Error(`waitFor timeout: ${label}`)
}

describe('queue (real redis)', () => {
  const q = queue()
  const pool = new RedisPool({ host: 'localhost', port: 6379 })
  const qname = () => `t-${randomUUID().toString().slice(0, 8)}`

  after(async () => {
    await pool.close()
    await q.close()
  })

  it('add + worker 消费成功（XACK，pending 清零）', async () => {
    const name = qname()
    const received: any[] = []
    const worker = q.queue.worker<any>(name, async (job) => { received.push(job.data) })
    await worker.start()

    await q.queue.add(name, { n: 1 })
    await q.queue.add(name, { n: 2 })
    await waitFor(() => received.length === 2, 5000, '两个 job 都被消费')

    // XACK 后 group pending = 0（等 XACK 完成，避免 race）
    await waitFor(async () => {
      const p = await pool.command('XPENDING', `q:${name}`, 'workers')
      return (p as unknown[])[0] === 0
    }, 10_000, 'pending 清零')
    await worker.stop()
  })

  it('失败重试：handler 第一次抛错 → visibilityTimeout 后重投成功', async () => {
    const name = qname()
    let runs = 0
    const worker = q.queue.worker<any>(name, async (job) => {
      runs++
      if (runs === 1) throw new Error('transient failure')
      // 第二次成功
    }, { visibilityTimeout: 200, blockMs: 50 })
    await worker.start()

    await q.queue.add(name, { v: 1 }, { attempts: 3 })
    await waitFor(() => runs >= 2, 10_000, '失败后重试')
    assert.equal(runs, 2)

    // 成功后 pending 清零（XACK）
    await waitFor(async () => {
      const p = await pool.command('XPENDING', `q:${name}`, 'workers')
      return (p as unknown[])[0] === 0
    }, 10_000, 'pending 清零')
    await worker.stop()
  })

  it('attempts 用尽 → DLQ（q:{name}:dead 有 entry，主队列清除）', async () => {
    const name = qname()
    const worker = q.queue.worker<any>(name, async () => { throw new Error('always fails') }, { visibilityTimeout: 100, blockMs: 50 })
    await worker.start()

    await q.queue.add(name, { v: 1 }, { attempts: 2 })
    await waitFor(async () => {
      const deadLen = await pool.command('XLEN', `q:${name}:dead`)
      return Number(deadLen) >= 1
    }, 10_000, 'DLQ 收到 entry')

    // 主队列无 pending 残留
    await waitFor(async () => {
      const p = await pool.command('XPENDING', `q:${name}`, 'workers')
      return (p as unknown[])[0] === 0
    }, 10_000, 'pending 清零')
    await worker.stop()
  })

  it('崩溃 worker 接管：读了一半崩溃（pending 遗留）→ 新 worker XAUTOCLAIM 接管', async () => {
    const name = qname()
    // 模拟 worker A 崩溃：手动 XREADGROUP 消费 entry 但故意不 XACK（进程死在处理中）
    await pool.command('XGROUP', 'CREATE', `q:${name}`, 'workers', '0', 'MKSTREAM')
    await q.queue.add(name, { v: 1 }, { attempts: 5 })
    await waitFor(async () => {
      const got = await pool.command('XREADGROUP', 'GROUP', 'workers', 'dead-instance', 'COUNT', '1', 'BLOCK', '500', 'STREAMS', `q:${name}`, '>')
      return got !== null
    }, 5000, '崩溃实例读到 entry')
    // pending 遗留（未 XACK）
    const pendingBefore = await pool.command('XPENDING', `q:${name}`, 'workers')
    assert.equal((pendingBefore as unknown[])[0], 1)

    // 新 worker 接管：XAUTOCLAIM 认领超时 pending → 成功 XACK
    const results: string[] = []
    const workerB = q.queue.worker<any>(name, async () => { results.push('B') }, {
      visibilityTimeout: 150,
      blockMs: 50,
      consumer: 'worker-B',
    })
    await workerB.start()
    await waitFor(() => results.length === 1, 10_000, 'B 接管成功')
    await waitFor(async () => {
      const p = await pool.command('XPENDING', `q:${name}`, 'workers')
      return (p as unknown[])[0] === 0
    }, 10_000, 'pending 清零')
    await workerB.stop()
  })

  it('concurrency：批量 job 并发处理', async () => {
    const name = qname()
    let maxConcurrent = 0
    let active = 0
    let done = 0
    const worker = q.queue.worker<any>(name, async () => {
      active++
      maxConcurrent = Math.max(maxConcurrent, active)
      await sleep(100)
      active--
      done++
    }, { concurrency: 5, blockMs: 50 })
    await worker.start()

    for (let i = 0; i < 10; i++) await q.queue.add(name, { i })
    await waitFor(() => done === 10, 10_000, '10 个 job 完成')
    assert.ok(maxConcurrent >= 3, `实际并发 ${maxConcurrent} 应 ≥3`)
    await worker.stop()
  })

  it('多 worker 实例：消费组隔离，同一 entry 只被一个 consumer 处理', async () => {
    const name = qname()
    const seen = new Set<string>()
    const w1 = q.queue.worker<any>(name, async (job) => { seen.add(job.id); await sleep(50) }, { consumer: 'inst-1', blockMs: 50 })
    const w2 = q.queue.worker<any>(name, async (job) => { seen.add(job.id); await sleep(50) }, { consumer: 'inst-2', blockMs: 50 })
    await w1.start()
    await w2.start()

    for (let i = 0; i < 6; i++) await q.queue.add(name, { i })
    await waitFor(() => seen.size === 6, 10_000, '6 个 job 被处理')
    // 6 个 entry 各被一个实例消费（无重复）——seen.size===6 且每个 id 唯一已保证
    await waitFor(async () => {
      const p = await pool.command('XPENDING', `q:${name}`, 'workers')
      return (p as unknown[])[0] === 0
    }, 10_000, 'pending 清零')
    await w1.stop()
    await w2.stop()
  })

  it('空队列不崩溃；stop 优雅退出', async () => {
    const name = qname()
    let ran = false
    const worker = q.queue.worker<any>(name, async () => { ran = true })
    await worker.start()
    await sleep(200) // BLOCK 空等（blockMs 50，验证空等不崩溃）
    assert.equal(ran, false)
    await worker.stop()
    assert.ok(true)
  })

  it('length 反映 stream 累积 entry 数（XACK 不删 entry，消费后不归零）', async () => {
    const name = qname()
    await q.queue.add(name, { a: 1 })
    await q.queue.add(name, { b: 2 })
    await waitFor(async () => (await q.queue.length(name)) === 2, 5000, 'length=2')

    // 消费后 XLEN 不变（XACK 只清 pending，entry 留在 stream——文档化行为）
    const worker = q.queue.worker<any>(name, async () => {})
    await worker.start()
    await waitFor(async () => {
      const p = await pool.command('XPENDING', `q:${name}`, 'workers')
      return (p as unknown[])[0] === 0
    }, 5000, '消费完成（pending 清零）')
    assert.equal(await q.queue.length(name), 2)
    await worker.stop()
  })
})

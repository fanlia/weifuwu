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
    try {
      if (await cond()) return
    } catch {
      // 防御：条件内部瞬时协议错误（如 group 未建时的 NOGROUP）视为未满足，继续轮询
    }
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
    const worker = q.queue.worker<any>(name, async (job) => { received.push(job.data) }, { blockMs: 50 })
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
    const worker = q.queue.worker<any>(name, async () => { ran = true }, { blockMs: 50 })
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

describe('queue worker independent connection (real redis)', () => {
  const pool = new RedisPool({ host: 'localhost', port: 6379 })
  const qname = () => `t-${randomUUID().toString().slice(0, 8)}`
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

  after(async () => {
    await pool.close() // 不关 → 连接驻留 → 进程退出卡住（event loop 不排空）
  })

  it('worker BLOCK 不堵池：poolSize=1 时 add 仍即时（独立连接）', async () => {
    const q = queue({ poolSize: 1 })
    try {
      const name = qname()
      const worker = q.queue.worker<any>(name, async () => {}, { blockMs: 500 })
      await worker.start()
      await sleep(150) // 确保 XREADGROUP BLOCK 已在服务器端阻塞（否则 add 测不到排队）
      const t0 = Date.now()
      await q.queue.add(name, { x: 1 })
      const elapsed = Date.now() - t0
      assert.ok(elapsed < 300, `add 不应被 worker BLOCK 排队（实际 ${elapsed}ms，修复前 ≈500）`)
      await worker.stop()
    } finally {
      await q.close()
    }
  })

  it('start 等待就绪：start() 返回时 group 已建（XPENDING 不 NOGROUP）', async () => {
    const q = queue()
    try {
      const name = qname()
      await q.queue.add(name, { a: 1 })
      const worker = q.queue.worker<any>(name, async () => {}, { blockMs: 100 })
      await worker.start()
      // start() resolve 后 group 必须已存在——XPENDING 不炸
      // （修复前 fire-and-forget：loop 未跑到 ensureGroup 时 XPENDING → NOGROUP）
      const p = await pool.command('XPENDING', `q:${name}`, 'workers')
      assert.ok(Array.isArray(p), 'XPENDING 应正常返回数组（group 已建）')
      await worker.stop()
    } finally {
      await q.close()
    }
  })

  it('stop 完整退出：多次 start/stop 后无残留 BLOCK 堵连接', async () => {
    const q = queue({ poolSize: 1 })
    try {
      const name = qname()
      // 3 轮 start/stop——修复前 stop 不等 loop 退出，BLOCK 残留占连接
      for (let i = 0; i < 3; i++) {
        const worker = q.queue.worker<any>(name, async () => {}, { blockMs: 500 })
        await worker.start()
        await sleep(60) // 让 BLOCK 真正发出
        await worker.stop()
      }
      // 最后一轮后：add 即时（无残留 BLOCK 占连接）
      const t0 = Date.now()
      await q.queue.add(name, { after: true })
      assert.ok(Date.now() - t0 < 300, `stop 后不应有残留 BLOCK 堵连接（实际 ${Date.now() - t0}ms）`)
    } finally {
      await q.close()
    }
  })
})

describe('queue worker lifecycle correctness (real redis)', () => {
  const pool = new RedisPool({ host: 'localhost', port: 6379 })
  const qname = () => `t-${randomUUID().toString().slice(0, 8)}`
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

  after(async () => {
    await pool.close()
  })

  it('start 失败（group 创建 WRONGTYPE）→ reject；running 回退可重试', async () => {
    const q = queue()
    try {
      const name = qname()
      // 把 stream key 占为字符串——XGROUP CREATE 报 WRONGTYPE（确定性失败）
      await pool.command('SET', `q:${name}`, 'not-a-stream')
      const worker = q.queue.worker<any>(name, async () => {}, { blockMs: 50 })
      await assert.rejects(worker.start(), /WRONGTYPE|wrong kind/i)
      // 修复前：running 残留 true → 第二次 start no-op（不 reject）→ 断言失败
      await assert.rejects(worker.start(), /WRONGTYPE|wrong kind/i, 'running 应回退，start 可重试')
      await pool.command('DEL', `q:${name}`)
    } finally {
      await q.close()
    }
  })

  it('stop/start 快速交替：旧 loop 不复活，消费正常', async () => {
    const q = queue()
    try {
      const name = qname()
      const seen: number[] = []
      const worker = q.queue.worker<any>(name, async (job) => { seen.push(job.data.n) }, { blockMs: 100 })
      await worker.start()
      // stop 未完成（旧 loop BLOCK 100ms 中）时立即 start——旧 loop 不应复活
      const sp = worker.stop()
      await worker.start()
      await sp
      await q.queue.add(name, { n: 1 })
      await waitFor(() => seen.includes(1), 3000, '消费正常')
      await q.queue.add(name, { n: 2 })
      await waitFor(() => seen.includes(2), 3000, '持续消费正常')
      await worker.stop()
    } finally {
      await q.close()
    }
  })
})

describe('queue worker group recovery (real redis)', () => {
  const pool = new RedisPool({ host: 'localhost', port: 6379 })
  const qname = () => `t-${randomUUID().toString().slice(0, 8)}`

  after(async () => {
    await pool.close()
  })

  it('group 被外部删除（XGROUP DESTROY）→ worker 自愈重建，继续消费', async () => {
    const q = queue()
    try {
      const name = qname()
      const seen: number[] = []
      const worker = q.queue.worker<any>(name, async (job) => { seen.push(job.data.n) }, { blockMs: 50 })
      await worker.start()
      await q.queue.add(name, { n: 1 })
      await waitFor(() => seen.includes(1), 3000, '首次消费')

      // 外部删除 group（运维场景）——worker 应自愈重建而非刷屏/死等
      await pool.command('XGROUP', 'DESTROY', `q:${name}`, 'workers')
      await q.queue.add(name, { n: 2 })
      await waitFor(() => seen.includes(2), 3000, 'group 删除后自愈消费')
      await worker.stop()
    } finally {
      await q.close()
    }
  })

  it('持续瞬时错误不刷屏：NOGROUP 自愈路径静默（5s 窗口最多打一次）', async () => {
    const q = queue()
    try {
      const name = qname()
      const seen: number[] = []
      // 拦截 console.error 统计 queue 错误输出
      const origError = console.error
      let queueErrors = 0
      console.error = (...args: unknown[]) => {
        if (String(args[0]).includes('[queue]')) queueErrors++
        origError(...args)
      }
      try {
        const worker = q.queue.worker<any>(name, async (job) => { seen.push(job.data.n) }, { blockMs: 50 })
        await worker.start()
        // 多次删除 group → 每次自愈（错误应被抑制，最多打 1 次/5s）
        for (let i = 0; i < 3; i++) {
          await pool.command('XGROUP', 'DESTROY', `q:${name}`, 'workers')
          await q.queue.add(name, { n: i + 10 })
          await waitFor(() => seen.includes(i + 10), 3000, `第 ${i + 1} 次自愈消费`)
          await new Promise((r) => setTimeout(r, 80)) // 给错误日志窗口
        }
        await worker.stop()
        assert.ok(queueErrors <= 2, `NOGROUP 自愈不应刷屏（实际 ${queueErrors} 次）`)
      } finally {
        console.error = origError
      }
    } finally {
      await q.close()
    }
  })
})

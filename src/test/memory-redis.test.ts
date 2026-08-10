/**
 * MemoryRedis — 内存版 Redis（契约 Redis 接口）测试
 *
 * 验证：与真实 Redis 语义对齐（惰性 TTL、stream 消费组投递/pending、
 * XAUTOCLAIM 认领、pubsub 模式匹配）——queue / rateLimit 可无缝替换。
 */
import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { MemoryRedis } from '../db/memory-redis.ts'
import { queue } from '../queue/index.ts'
import { rateLimit } from '../middleware/rate-limit.ts'
import { ProtocolError } from '../db/errors.ts'
import { randomUUID } from 'node:crypto'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function waitFor(cond: () => boolean | Promise<boolean>, timeout = 5000, label = 'condition') {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      if (await cond()) return
    } catch {
      // NOGROUP 等瞬时协议错误视为未满足
    }
    await sleep(20)
  }
  throw new Error(`waitFor timeout: ${label}`)
}

describe('MemoryRedis', () => {
  // 共享内存实例（node:test after 钩子时序在单跑模式不稳定——内存实例由进程回收，无需显式 close）
  const r = new MemoryRedis()

  it('string + TTL 惰性过期', async () => {
    await r.set('k', 'v', 1)
    assert.equal(await r.get('k'), 'v')
    await sleep(1100)
    assert.equal(await r.get('k'), null, 'TTL 过期后读取为 null（惰性删除）')
    assert.equal(await r.ttl('k'), -2, '已删除 key TTL = -2')
  })

  it('incr / exists / setnx / del', async () => {
    assert.equal(await r.incr('c'), 1)
    assert.equal(await r.incr('c'), 2)
    assert.equal(await r.exists('c'), 1)
    assert.equal(await r.setnx('c', 'x'), 0, '已存在 setnx = 0')
    assert.equal(await r.del('c'), 1)
  })

  it('hash / list / set / zset', async () => {
    await r.hset('h', 'a', '1')
    assert.equal(await r.hget('h', 'a'), '1')
    assert.deepEqual(await r.hgetall('h'), { a: '1' })
    await r.rpush('l', 'a', 'b')
    assert.equal(await r.lpop('l'), 'a')
    await r.sadd('s', 'x', 'y')
    assert.deepEqual((await r.smembers('s')).sort(), ['x', 'y'])
    await r.zadd('z', 10, 'm1')
    await r.zadd('z', 5, 'm2')
    assert.deepEqual(await r.zrange('z', 0, -1), ['m2', 'm1'], '按 score 升序')
  })

  it('jsonSet/jsonGet/cache', async () => {
    await r.jsonSet('j', { a: 1 })
    assert.deepEqual(await r.jsonGet('j'), { a: 1 })
    let calls = 0
    const v = await r.cache('c1', async () => { calls++; return { n: 42 } }, 60)
    assert.deepEqual(v, { n: 42 })
    await r.cache('c1', async () => { calls++; return null }, 60)
    assert.equal(calls, 1, '缓存命中不调 fn')
  })

  it('stream：XADD/XREADGROUP/XACK 消费', async () => {
    const qname = `m-${randomUUID().toString().slice(0, 8)}`
    const q = queue({ redis: r })
    const received: unknown[] = []
    const worker = q.queue.worker<{ a: number }>(qname, async (job) => { received.push(job.data) }, { blockMs: 20 })
    await worker.start()
    await q.queue.add(qname, { a: 1 })
    await waitFor(() => received.length === 1, 3000, 'worker 消费')
    assert.deepEqual(received, [{ a: 1 }])
    assert.equal(await q.queue.length(qname), 1, 'XACK 不清 stream entry（length 仍 1）')
    await worker.stop()
    await q.close()
  })

  it('queue：失败重试（ZSET 延迟）→ attempts 用尽 DLQ', async () => {
    const qname = `d-${randomUUID().toString().slice(0, 8)}`
    const q = queue({ redis: r })
    const attempts: number[] = []
    const worker = q.queue.worker(qname, async (job) => {
      attempts.push(job.attempts)
      throw new Error('boom')
    }, { blockMs: 20, visibilityTimeout: 60 })
    await worker.start()
    await q.queue.add(qname, { x: 1 }, { attempts: 2 })
    await waitFor(() => attempts.length >= 2, 3000, '重试 2 次')
    await sleep(200) // 等待确定不再投递（负向断言用固定 sleep）
    assert.equal(attempts.length, 2, 'maxAttempts=2 → 首投 + 1 次重试（不超投）')
    const dead = await r.command('XLEN', `q:${qname}:dead`)
    assert.equal(Number(dead), 1, 'DLQ 有一条')
    await worker.stop()
    await q.close()
  })

  it('queue：崩溃 worker 接管（XAUTOCLAIM）', async () => {
    const qname = `x-${randomUUID().toString().slice(0, 8)}`
    const q = queue({ redis: r })
    const received: unknown[] = []
    // 模拟崩溃：手动 XREADGROUP 读 entry 但不 XACK（进程死在处理中 → pending 遗留）
    await r.command('XGROUP', 'CREATE', `q:${qname}`, 'workers', '0', 'MKSTREAM')
    await q.queue.add(qname, { job: 1 })
    await waitFor(async () => {
      const got = await r.command('XREADGROUP', 'GROUP', 'workers', 'dead-instance', 'COUNT', '1', 'BLOCK', '100', 'STREAMS', `q:${qname}`, '>')
      return got !== null
    }, 2000, '崩溃实例读到 entry')
    const pendingBefore = await r.command('XPENDING', `q:${qname}`, 'workers')
    assert.equal((pendingBefore as unknown[])[0], 1, 'pending 遗留（未 XACK）')

    // 新 worker 接管：XAUTOCLAIM 认领超时 pending → 成功 XACK
    const w2 = q.queue.worker(qname, async (job) => { received.push(job.data) }, { blockMs: 20, visibilityTimeout: 50 })
    await w2.start()
    await waitFor(() => received.length === 1, 3000, 'XAUTOCLAIM 接管消费')
    await w2.stop()
    await q.close()
  })

  it('pubsub：psubscribe 模式匹配 + publish 派发', async () => {
    const r2 = new MemoryRedis()
    const sub = r2.createSubscriber()
    const got: string[] = []
    await sub.connect()
    await sub.psubscribe('wf:*', (channel, message) => { got.push(`${channel}=${message}`) })
    await r2.publish('wf:room1', 'hello')
    assert.deepEqual(got, ['wf:room1=hello'])
    await r2.publish('other', 'no')
    assert.deepEqual(got, ['wf:room1=hello'], '不匹配模式不派发')
    await sub.close()
    await r2.close()
  })

  it('command 未实现命令 → ProtocolError(unsupported)（诚实裁剪）', async () => {
    await assert.rejects(() => r.command('BGRPOP', 'k'), ProtocolError)
  })

  it('queue 多 worker 消费组隔离（共享游标投递不重复）', async () => {
    const qname = `m-${randomUUID().toString().slice(0, 8)}`
    const q = queue({ redis: r })
    const got1: unknown[] = []
    const got2: unknown[] = []
    const w1 = q.queue.worker(qname, async (j) => got1.push(j.data), { blockMs: 15 })
    const w2 = q.queue.worker(qname, async (j) => got2.push(j.data), { blockMs: 15 })
    await w1.start()
    await w2.start()
    for (let i = 0; i < 6; i++) await q.queue.add(qname, { i })
    await waitFor(() => got1.length + got2.length === 6, 3000, '6 条全消费')
    assert.deepEqual([...got1, ...got2].sort((a, b) => (a as { i: number }).i - (b as { i: number }).i), [0, 1, 2, 3, 4, 5].map((i) => ({ i })), '每条只消费一次')
    await w1.stop()
    await w2.stop()
    await q.close()
  })

  it('rateLimit 换 MemoryRedis：fixed 窗口限流', async () => {
    const pool = new MemoryRedis()
    const mw = rateLimit({ redis: pool, windowMs: 60_000, max: 2 }) as any
    const call = (ip: string) =>
      mw(new Request('http://x/', { headers: { 'x-forwarded-for': ip } }), { params: {}, query: {} }, async () => new Response('ok'))
    assert.equal((await call('1.1.1.1')).status, 200)
    assert.equal((await call('1.1.1.1')).status, 200)
    assert.equal((await call('1.1.1.1')).status, 429, '第 3 次超限')
  })

  it('rateLimit sliding 窗口（ZSET）', async () => {
    const pool = new MemoryRedis()
    const mw = rateLimit({ redis: pool, algorithm: 'sliding', windowMs: 60_000, max: 2 }) as any
    const call = (ip: string) =>
      mw(new Request('http://x/', { headers: { 'x-forwarded-for': ip } }), { params: {}, query: {} }, async () => new Response('ok'))
    assert.equal((await call('2.2.2.2')).status, 200)
    assert.equal((await call('2.2.2.2')).status, 200)
    assert.equal((await call('2.2.2.2')).status, 429)
  })

  it('pipeline：批量执行顺序返回', async () => {
    const p = await r.pipeline()
    p.set('p1', 'a').get('p1').incr('p2')
    const res = await p.exec()
    assert.equal(res[0], 'OK')
    assert.equal(res[1], 'a')
    assert.equal(res[2], 1)
  })

  it('createConnection 返回独立视图（close 不关底层）', async () => {
    const conn = await r.createConnection()
    assert.equal(conn.connected, true, '视图 connected = 底层未关闭')
    await conn.close()
    assert.equal(await r.get('alive'), null, '视图 close 后底层仍可用（所有权在外）')
  })
})

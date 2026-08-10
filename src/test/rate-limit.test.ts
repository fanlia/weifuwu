/**
 * rateLimit — 限流中间件测试（CS-04：真库 docker redis）
 *
 * 覆盖：fixed/sliding 算法、窗口过期重置、响应头、ctx.limit 手动限流、
 * 池共享计数、自定义 key、HttpError 状态码。
 * （引擎协议层测试见 src/db/redis/*.test.ts——CS-04 真库）
 */
import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { rateLimit } from '../middleware/rate-limit.ts'
import { MemoryRedis } from '../db/memory-redis.ts'
import { HttpError } from '../types.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 唯一 key：跨运行 + 跨并行测试不碰撞（CS-04 真库纪律：真库是持久的） */
let seq = 0
const makeReq = (ip = `10.${randomUUID().split('-')[0]}.${++seq}.1`) =>
  new Request('http://localhost/', { headers: { 'x-forwarded-for': ip } })

/** 直接调中间件（绕过 serve），注入 redis pool 到 ctx */
async function callMw(mw: any, req: Request, redisPool?: any) {
  const ctx: any = { redis: redisPool }
  try {
    const res = await mw(req, ctx, async () => new Response('ok'))
    return { res, ctx, error: undefined }
  } catch (e) {
    return { res: undefined, ctx, error: e }
  }
}

describe('rateLimit', () => {
  const pool: any = new MemoryRedis()

  after(async () => {
    await pool.close()
  })

  describe('fixed window (redis)', () => {
    it('窗口内 max 次通过，第 max+1 次 429', async () => {
      const mw = rateLimit({ windowMs: 60_000, max: 2, redis: pool })
      const req = makeReq()
      assert.equal((await callMw(mw, req, pool)).res!.status, 200)
      assert.equal((await callMw(mw, req, pool)).res!.status, 200)
      const third = await callMw(mw, req, pool)
      assert.equal(third.res!.status, 429)
      assert.equal(JSON.parse(await third.res!.text()).error, 'Too Many Requests')
    })

    it('不同 key（IP）独立计数', async () => {
      const mw = rateLimit({ windowMs: 60_000, max: 1, redis: pool })
      const reqA = makeReq()
      const reqB = makeReq()
      assert.equal((await callMw(mw, reqA, pool)).res!.status, 200)
      assert.equal((await callMw(mw, reqB, pool)).res!.status, 200)
      assert.equal((await callMw(mw, reqA, pool)).res!.status, 429)
    })

    it('窗口过期后自动重置', async () => {
      const mw = rateLimit({ windowMs: 500, max: 1, redis: pool })
      const req = makeReq()
      assert.equal((await callMw(mw, req, pool)).res!.status, 200)
      assert.equal((await callMw(mw, req, pool)).res!.status, 429)
      await sleep(600)
      assert.equal((await callMw(mw, req, pool)).res!.status, 200)
    })

    it('响应头 RateLimit-* 与 429 Retry-After', async () => {
      const mw = rateLimit({ windowMs: 60_000, max: 1, redis: pool })
      const req = makeReq()
      const ok = await callMw(mw, req, pool)
      assert.equal(ok.res!.headers.get('RateLimit-Limit'), '1')
      assert.equal(ok.res!.headers.get('RateLimit-Remaining'), '0')
      assert.ok(Number(ok.res!.headers.get('RateLimit-Reset')) > 0)

      const blocked = await callMw(mw, req, pool)
      assert.equal(blocked.res!.headers.get('Retry-After'), blocked.res!.headers.get('RateLimit-Reset'))
    })

    it('自定义 key 函数', async () => {
      const mw = rateLimit({
        redis: pool,
        windowMs: 60_000,
        max: 1,
        key: (req) => req.headers.get('x-tenant') ?? 'anon',
      })
      const t1 = `t-${randomUUID()}`
      const t2 = `t-${randomUUID()}`
      const req = new Request('http://localhost/', { headers: { 'x-tenant': t1 } })
      assert.equal((await callMw(mw, req, pool)).res!.status, 200)
      assert.equal((await callMw(mw, req, pool)).res!.status, 429)
      const req2 = new Request('http://localhost/', { headers: { 'x-tenant': t2 } })
      assert.equal((await callMw(mw, req2, pool)).res!.status, 200)
    })

    it('同一池多限流实例计数共享（INCR 原子）', async () => {
      // 两个独立限流中间件共享同一 redis 池 → 同一 key 计数共享（原子 INCR）
      const req = makeReq()
      const mw1 = rateLimit({ windowMs: 60_000, max: 2, redis: pool })
      const mw2 = rateLimit({ windowMs: 60_000, max: 2, redis: pool })
      assert.equal((await callMw(mw1, req, pool)).res!.status, 200)
      assert.equal((await callMw(mw2, req, pool)).res!.status, 200)
      assert.equal((await callMw(mw1, req, pool)).res!.status, 429)
    })
  })

  describe('sliding window (redis)', () => {
    it('窗口内 max 次通过，第 max+1 次 429', async () => {
      const mw = rateLimit({ algorithm: 'sliding', windowMs: 60_000, max: 3, redis: pool })
      const req = makeReq()
      assert.equal((await callMw(mw, req, pool)).res!.status, 200)
      assert.equal((await callMw(mw, req, pool)).res!.status, 200)
      assert.equal((await callMw(mw, req, pool)).res!.status, 200)
      assert.equal((await callMw(mw, req, pool)).res!.status, 429)
    })

    it('窗口过期后重置', async () => {
      const mw = rateLimit({ algorithm: 'sliding', windowMs: 500, max: 1, redis: pool })
      const req = makeReq()
      assert.equal((await callMw(mw, req, pool)).res!.status, 200)
      assert.equal((await callMw(mw, req, pool)).res!.status, 429)
      await sleep(600)
      assert.equal((await callMw(mw, req, pool)).res!.status, 200)
    })
  })

  describe('ctx.limit 手动限流', () => {
    it('超限抛 HttpError 429（带 retryAfter）', async () => {
      const mw = rateLimit({ windowMs: 60_000, max: 10, redis: pool })
      const name = `search-${randomUUID()}`
      const { ctx } = await callMw(mw, makeReq(), pool)
      await ctx.limit(name, { max: 1, windowMs: 60_000 })
      await assert.rejects(
        () => ctx.limit(name, { max: 1, windowMs: 60_000 }),
        (e: unknown) => e instanceof HttpError && (e as HttpError).status === 429,
      )
    })

    it('不同名称独立计数', async () => {
      const mw = rateLimit({ windowMs: 60_000, max: 10, redis: pool })
      const nameA = `a-${randomUUID()}`
      const nameB = `b-${randomUUID()}`
      const { ctx } = await callMw(mw, makeReq(), pool)
      await ctx.limit(nameA, { max: 1, windowMs: 60_000 })
      await ctx.limit(nameB, { max: 1, windowMs: 60_000 })
      await assert.rejects(() => ctx.limit(nameA, { max: 1, windowMs: 60_000 }))
    })
  })

  describe('ctx.limit scope（IP 维度）', () => {
    it('默认按 IP 维度：不同 IP 独立计数（agent-platform register 场景）', async () => {
      const mw = rateLimit({ windowMs: 60_000, max: 10, redis: pool })
      const name = `reg-${randomUUID()}`
      const { ctx: ctxA } = await callMw(mw, makeReq('10.1.1.1'), pool)
      const { ctx: ctxB } = await callMw(mw, makeReq('10.2.2.2'), pool)
      // A 两次 + B 一次（max 2）
      await ctxA.limit(name, { max: 2, windowMs: 60_000 })
      await ctxA.limit(name, { max: 2, windowMs: 60_000 })
      await ctxB.limit(name, { max: 2, windowMs: 60_000 })
      // A 第三次 429；B 仍可再 1 次（独立维度）
      await assert.rejects(() => ctxA.limit(name, { max: 2, windowMs: 60_000 }))
      await ctxB.limit(name, { max: 2, windowMs: 60_000 })
      await assert.rejects(() => ctxB.limit(name, { max: 2, windowMs: 60_000 }))
    })

    it("scope: 'global' 保持全局维度（现有语义）", async () => {
      const mw = rateLimit({ windowMs: 60_000, max: 10, redis: pool })
      const name = `g-${randomUUID()}`
      const { ctx: ctxA } = await callMw(mw, makeReq('10.3.3.3'), pool)
      const { ctx: ctxB } = await callMw(mw, makeReq('10.4.4.4'), pool)
      await ctxA.limit(name, { max: 1, windowMs: 60_000, scope: 'global' })
      await assert.rejects(() => ctxB.limit(name, { max: 1, windowMs: 60_000, scope: 'global' }))
    })
  })


})

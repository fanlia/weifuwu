/**
 * rateLimit — 限流中间件测试（CS-04：真库 docker redis）
 *
 * 覆盖：fixed/sliding 算法、窗口过期重置、响应头、ctx.limit 手动限流、
 * memory store、多实例共享计数、自定义 key、HttpError 状态码。
 *
 * 注意：每个测试用唯一 key（IP 后缀），不使用 flushdb——node --test 并行
 * 时 flushdb 会干扰同库的 redis.test.ts。同一测试内复用同一 req（同一 key）。
 */
import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { rateLimit } from '../middleware/rate-limit.ts'
import { redis } from '../redis/index.ts'
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
  const r = redis()
  const pool: any = r.redis

  after(async () => {
    await r.close()
  })

  describe('fixed window (redis)', () => {
    it('窗口内 max 次通过，第 max+1 次 429', async () => {
      const mw = rateLimit({ store: 'redis', windowMs: 60_000, max: 2 })
      const req = makeReq()
      assert.equal((await callMw(mw, req, pool)).res!.status, 200)
      assert.equal((await callMw(mw, req, pool)).res!.status, 200)
      const third = await callMw(mw, req, pool)
      assert.equal(third.res!.status, 429)
      assert.equal(JSON.parse(await third.res!.text()).error, 'Too Many Requests')
    })

    it('不同 key（IP）独立计数', async () => {
      const mw = rateLimit({ store: 'redis', windowMs: 60_000, max: 1 })
      const reqA = makeReq()
      const reqB = makeReq()
      assert.equal((await callMw(mw, reqA, pool)).res!.status, 200)
      assert.equal((await callMw(mw, reqB, pool)).res!.status, 200)
      assert.equal((await callMw(mw, reqA, pool)).res!.status, 429)
    })

    it('窗口过期后自动重置', async () => {
      const mw = rateLimit({ store: 'redis', windowMs: 500, max: 1 })
      const req = makeReq()
      assert.equal((await callMw(mw, req, pool)).res!.status, 200)
      assert.equal((await callMw(mw, req, pool)).res!.status, 429)
      await sleep(600)
      assert.equal((await callMw(mw, req, pool)).res!.status, 200)
    })

    it('响应头 RateLimit-* 与 429 Retry-After', async () => {
      const mw = rateLimit({ store: 'redis', windowMs: 60_000, max: 1 })
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
        store: 'redis',
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

    it('多实例共享计数（redis 原子性，CS-04 真库验证）', async () => {
      // 两个独立限流实例 + 两个独立 redis 池 → 同一 key 计数共享
      const r2 = redis()
      const pool2: any = r2.redis
      try {
        const req = makeReq() // 同一 req 供两个实例共享
        const mw1 = rateLimit({ store: 'redis', windowMs: 60_000, max: 2 })
        const mw2 = rateLimit({ store: 'redis', windowMs: 60_000, max: 2 })
        assert.equal((await callMw(mw1, req, pool)).res!.status, 200)
        assert.equal((await callMw(mw2, req, pool2)).res!.status, 200)
        assert.equal((await callMw(mw1, req, pool)).res!.status, 429)
      } finally {
        await r2.close()
      }
    })
  })

  describe('sliding window (redis)', () => {
    it('窗口内 max 次通过，第 max+1 次 429', async () => {
      const mw = rateLimit({ store: 'redis', algorithm: 'sliding', windowMs: 60_000, max: 3 })
      const req = makeReq()
      assert.equal((await callMw(mw, req, pool)).res!.status, 200)
      assert.equal((await callMw(mw, req, pool)).res!.status, 200)
      assert.equal((await callMw(mw, req, pool)).res!.status, 200)
      assert.equal((await callMw(mw, req, pool)).res!.status, 429)
    })

    it('窗口过期后重置', async () => {
      const mw = rateLimit({ store: 'redis', algorithm: 'sliding', windowMs: 500, max: 1 })
      const req = makeReq()
      assert.equal((await callMw(mw, req, pool)).res!.status, 200)
      assert.equal((await callMw(mw, req, pool)).res!.status, 429)
      await sleep(600)
      assert.equal((await callMw(mw, req, pool)).res!.status, 200)
    })
  })

  describe('ctx.limit 手动限流', () => {
    it('超限抛 HttpError 429（带 retryAfter）', async () => {
      const mw = rateLimit({ store: 'redis', windowMs: 60_000, max: 10 })
      const name = `search-${randomUUID()}`
      const { ctx } = await callMw(mw, makeReq(), pool)
      await ctx.limit(name, { max: 1, windowMs: 60_000 })
      await assert.rejects(
        () => ctx.limit(name, { max: 1, windowMs: 60_000 }),
        (e: unknown) => e instanceof HttpError && (e as HttpError).status === 429,
      )
    })

    it('不同名称独立计数', async () => {
      const mw = rateLimit({ store: 'redis', windowMs: 60_000, max: 10 })
      const nameA = `a-${randomUUID()}`
      const nameB = `b-${randomUUID()}`
      const { ctx } = await callMw(mw, makeReq(), pool)
      await ctx.limit(nameA, { max: 1, windowMs: 60_000 })
      await ctx.limit(nameB, { max: 1, windowMs: 60_000 })
      await assert.rejects(() => ctx.limit(nameA, { max: 1, windowMs: 60_000 }))
    })
  })

  describe('memory store（单实例/开发）', () => {
    it('fixed 语义生效', async () => {
      const mw = rateLimit({ store: 'memory', windowMs: 60_000, max: 2 })
      const req = makeReq()
      assert.equal((await callMw(mw, req, undefined)).res!.status, 200)
      assert.equal((await callMw(mw, req, undefined)).res!.status, 200)
      assert.equal((await callMw(mw, req, undefined)).res!.status, 429)
    })

    it('窗口重置', async () => {
      const mw = rateLimit({ store: 'memory', windowMs: 500, max: 1 })
      const req = makeReq()
      assert.equal((await callMw(mw, req, undefined)).res!.status, 200)
      assert.equal((await callMw(mw, req, undefined)).res!.status, 429)
      await sleep(600)
      assert.equal((await callMw(mw, req, undefined)).res!.status, 200)
    })
  })

  describe('配置约束（诚实裁剪）', () => {
    it('sliding + memory 明确抛错', () => {
      assert.throws(() => rateLimit({ store: 'memory', algorithm: 'sliding' }), /sliding.*redis/)
    })

    it('redis store 但未注册 redis() → 明确抛错', async () => {
      const mw = rateLimit({ store: 'redis' })
      const { error } = await callMw(mw, makeReq(), undefined)
      assert.ok(error instanceof Error && /redis\(\)/.test(error.message))
    })
  })
})

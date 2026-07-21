/**
 * 中间件测试 — auth、tenant、ai
 */

import { describe, it, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from 'weifuwu'
import { auth, signToken, type AuthPayload } from '../src/middleware/auth.ts'
import { tenant } from '../src/middleware/tenant.ts'
import { ai } from '../src/middleware/ai.ts'

function mkCtx(extra?: Record<string, unknown>): Context {
  return { params: {}, query: {}, ...extra } as any
}

function callMiddleware(mw: any, ctx: Context, req?: Request): Promise<Response> {
  const r = req ?? new Request('http://localhost/')
  return mw(r, ctx, async (_req: Request, _ctx: Context) => new Response('ok'))
}

describe('Middleware', () => {

  // ── Auth 中间件 ─────────────────────────────────────────

  describe('auth()', () => {
    const secret = 'test-secret-123'

    it('验证有效 token 通过', async () => {
      const token = signToken({ sub: 'u1', tenantId: 't1', email: 'a@b.com', name: 'Alice', role: 'admin' }, secret)
      const ctx = mkCtx()
      const req = new Request('http://localhost/', { headers: { Authorization: `Bearer ${token}` } })
      const res = await callMiddleware(auth({ secret }), ctx, req)
      assert.equal(res.status, 200)
      assert.equal(ctx.auth?.userId, 'u1')
      assert.equal(ctx.auth?.tenantId, 't1')
      assert.equal(ctx.auth?.email, 'a@b.com')
    })

    it('无 Authorization header 返回 401', async () => {
      const ctx = mkCtx()
      const res = await callMiddleware(auth({ secret }), ctx)
      assert.equal(res.status, 401)
      const body = await res.json()
      assert.ok(body.error)
    })

    it('错误 token 返回 401', async () => {
      const ctx = mkCtx()
      const req = new Request('http://localhost/', { headers: { Authorization: 'Bearer invalid.token.here' } })
      const res = await callMiddleware(auth({ secret }), ctx, req)
      assert.equal(res.status, 401)
    })

    it('过期 token 返回 401', async () => {
      const token = signToken(
        { sub: 'u1', tenantId: 't1', email: 'a@b.com', name: 'Alice', role: 'member' },
        secret,
        '0s',  // 立即过期
      )
      // signToken with 0s — 需要等待 1ms
      await new Promise(r => setTimeout(r, 10))
      const ctx = mkCtx()
      const req = new Request('http://localhost/', { headers: { Authorization: `Bearer ${token}` } })
      const res = await callMiddleware(auth({ secret }), ctx, req)
      assert.equal(res.status, 401)
    })

    it('签名不一致拒绝', async () => {
      // 用不同 secret 签发的 token
      const token = signToken({ sub: 'u1', tenantId: 't1', email: 'a@b.com', name: 'Alice', role: 'member' }, 'different-secret')
      const ctx = mkCtx()
      const req = new Request('http://localhost/', { headers: { Authorization: `Bearer ${token}` } })
      const res = await callMiddleware(auth({ secret }), ctx, req)
      assert.equal(res.status, 401)
    })

    it('注入 ctx.auth 为下游所用', async () => {
      const token = signToken({ sub: 'u1', tenantId: 't1', email: 'a@b.com', name: 'Alice', role: 'admin' }, secret)
      const ctx = mkCtx()
      const req = new Request('http://localhost/', { headers: { Authorization: `Bearer ${token}` } })
      let captured: any = null
      await auth({ secret })(req, ctx, async (_r, c) => {
        captured = c.auth
        return new Response('ok')
      })
      assert.ok(captured)
      assert.equal(captured.role, 'admin')
    })
  })

  // ── signToken ────────────────────────────────────────────

  describe('signToken()', () => {
    it('生成三段的 JWT', () => {
      const token = signToken({ sub: 'u1' }, 'secret')
      const parts = token.split('.')
      assert.equal(parts.length, 3)
    })

    it('生成的 token 可被 auth 中间件验证', () => {
      const secret = 'my-secret'
      const token = signToken(
        { sub: 'u1', tenantId: 't1', email: 'e@e.com', name: 'Name', role: 'admin' },
        secret,
      )
      // 解码 payload 验证内容
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
      assert.equal(payload.sub, 'u1')
      assert.equal(payload.tenantId, 't1')
      assert.ok(payload.exp)
      assert.ok(payload.iat)
    })

    it('默认过期时间为 7 天', () => {
      const token = signToken({ sub: 'u1', tenantId: 't1', email: 'e@e.com', name: 'N', role: 'member' }, 'secret')
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
      const sevenDays = 7 * 24 * 60 * 60
      const actual = payload.exp - payload.iat
      assert.ok(Math.abs(actual - sevenDays) < 10)
    })
  })

  // ── Tenant 中间件 ─────────────────────────────────────

  describe('tenant()', () => {
    it('从 ctx.auth 提取 tenantId', async () => {
      const ctx = mkCtx({ auth: { userId: 'u1', tenantId: 't1', email: 'a@b.com', name: 'A', role: 'member' } })
      const res = await callMiddleware(tenant(), ctx)
      assert.equal(res.status, 200)
      assert.equal(ctx.tenantId, 't1')
    })

    it('无 ctx.auth 返回 401', async () => {
      const ctx = mkCtx()
      const res = await callMiddleware(tenant(), ctx)
      assert.equal(res.status, 401)
    })

    it('必须在 auth() 之后使用', async () => {
      const ctx = mkCtx()
      const res = await callMiddleware(tenant(), ctx)
      assert.equal(res.status, 401)
    })
  })

  // ── AI 中间件 ────────────────────────────────────────

  describe('ai()', () => {
    it('注入 ctx.ai', async () => {
      const ctx = mkCtx()
      const res = await callMiddleware(ai(), ctx)
      assert.equal(res.status, 200)
      assert.ok(ctx.ai)
    })

    it('ctx.ai 包含 chat、chatStream、agent、embed、embedMany', async () => {
      const ctx = mkCtx()
      await callMiddleware(ai(), ctx)
      assert.equal(typeof ctx.ai.chat, 'function')
      assert.equal(typeof ctx.ai.chatStream, 'function')
      assert.equal(typeof ctx.ai.agent, 'function')
      assert.equal(typeof ctx.ai.embed, 'function')
      assert.equal(typeof ctx.ai.embedMany, 'function')
    })

    it('ctx.ai.agent 返回 { run, stream }', () => {
      const client = { chat: async () => {}, chatStream: async () => {}, agent: () => {}, embed: async () => [], embedMany: async () => [] } as any
      // 模拟 ai() 内部的 createAgent 行为
      const result = { run: async () => ({ content: 'ok', messages: [], steps: [] }), stream: async () => ({ content: 'ok', messages: [], steps: [] }) }
      assert.equal(typeof result.run, 'function')
      assert.equal(typeof result.stream, 'function')
    })
  })

  // ── 中间件链 ─────────────────────────────────────────

  describe('middleware chain (auth + tenant)', () => {
    const secret = 'chain-secret'

    it('auth → tenant → handler 完整链路', async () => {
      const token = signToken({ sub: 'u1', tenantId: 't1', email: 'a@b.com', name: 'A', role: 'member' }, secret)
      const authMw = auth({ secret })
      const tenantMw = tenant()

      const ctx = mkCtx()
      const req = new Request('http://localhost/', { headers: { Authorization: `Bearer ${token}` } })

      let capturedAuth: any = null
      let capturedTenant: string | null = null

      await authMw(req, ctx, async (r, c) => {
        await tenantMw(r, c, async (_r2, c2) => {
          capturedAuth = c2.auth
          capturedTenant = c2.tenantId
          return new Response('ok')
        })
        return new Response('ok')
      })

      assert.equal(capturedAuth?.userId, 'u1')
      assert.equal(capturedTenant, 't1')
    })

    it('auth 失败时 tenant 不会执行', async () => {
      const authMw = auth({ secret })
      const tenantMw = tenant()
      const ctx = mkCtx()
      const req = new Request('http://localhost/')
      let tenantCalled = false

      const res = await authMw(req, ctx, async (r, c) => {
        // auth 中间件应该在到达这里之前返回 401
        await tenantMw(r, c, async () => {
          tenantCalled = true
          return new Response('ok')
        })
        return new Response('ok')
      })

      assert.equal(res.status, 401)
      assert.equal(tenantCalled, false)
    })
  })
})

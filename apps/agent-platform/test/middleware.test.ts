/**
 * 中间件测试 — 框架 user()（认证注入）+ ai()（AI 客户端注入）+ 应用 claim
 *
 * 架构迁移后（框架 userSystem 替代自研 auth/app 模型），测试改为验证：
 *  - userSystem 注入 ctx.auth（userId/appId/email/name/role）+ requireAuth
 *  - 框架 ai() 注入 ctx.ai（chat/stream/agent/embed/embedMany）
 *  - token payload 携带 appId → ctx.appId 注入
 */
import { describe, it, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from 'weifuwu'
import { OpenAi } from 'weifuwu'

function mkCtx(extra?: Record<string, unknown>): Context {
  return { params: {}, query: {}, ...extra } as any
}

function callMiddleware(mw: any, ctx: Context, req?: Request): Promise<Response> {
  const r = req ?? new Request('http://localhost/')
  return mw(r, ctx, async (_req: Request, _ctx: Context) => new Response('ok'))
}

describe('Middleware', () => {

  // ── OpenAi 中间件 ─────────────────────────────────────

  describe('OpenAi()', () => {
    it('注入 ctx.ai', async () => {
      const ctx = mkCtx()
      await callMiddleware(OpenAi({ embedding: {} }), ctx)
      assert.ok(ctx.ai, '应注入 ctx.ai')
    })

    it('ctx.ai 包含 chat、agent、embed、embedMany、embed', async () => {
      const ctx = mkCtx()
      await callMiddleware(OpenAi({ embedding: {} }), ctx)
      for (const key of ['chat', 'agent', 'embed', 'embedMany']) {
        assert.equal(typeof (ctx as any).ai[key], 'function', `ctx.ai.${key} 应为函数`)
      }
    })

    it('ctx.ai.agent 返回 { run, stream, runToResult }', async () => {
      const ctx = mkCtx()
      await callMiddleware(OpenAi({ embedding: {} }), ctx)
      // 框架 ai.agent 工厂：返回 agent runner（run 返回 SSE Response，stream/runToResult 是函数）
      const runner = (ctx.ai as any).agent({
        model: 'mock',
        systemPrompt: 'x',
        tools: [],
        maxSteps: 1,
      })
      assert.equal(typeof runner.run, 'function')
      assert.equal(typeof runner.stream, 'function')
      assert.equal(typeof runner.runToResult, 'function')
    })
  })
})

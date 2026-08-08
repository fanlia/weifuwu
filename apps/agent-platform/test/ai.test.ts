/**
 * AI 模块测试 — 框架 ai() SSE 协议 + agent runner 结构
 *
 * 架构迁移后（框架 ai() 替代自研 DeepSeek/DashScope/agent 模块），测试改为验证：
 *  - ai() 中间件注入 ctx.ai（chat/stream/agent/embed/embedMany）
 *  - ctx.ai.agent 返回 { run, stream, runToResult }（SSE + 事件流 + 结构化结果）
 *  - agent 引擎工具循环：带工具配置时不崩溃
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ai } from 'weifuwu'
import { sseResponse } from '../../../src/ai/sse.ts'

describe('AI Core Module', () => {

  // ── SSE 协议（sseResponse） ───────────────────────────

  describe('sseResponse', () => {
    it('把 wf:* 事件编码为 text/event-stream', async () => {
      const res = sseResponse(async (emit) => {
        emit('wf:token', { text: '你好' })
        emit('wf:done', { content: '你好' })
      })
      assert.equal(res.status, 200)
      assert.match(res.headers.get('content-type') || '', /text\/event-stream/)
      const text = await res.text()
      assert.match(text, /event: wf:token/)
      assert.match(text, /data: .*你好/)
      assert.match(text, /event: wf:done/)
    })
  })

  // ── ai() 中间件 ───────────────────────────────────────

  describe('ai() middleware', () => {
    it('注入 ctx.ai 且包含 chat/stream/agent/embed/embedMany', async () => {
      const ctx: any = { params: {}, query: {} }
      await ai({ embedding: {} })(new Request('http://localhost/'), ctx, async () => new Response('ok'))
      assert.ok(ctx.ai, '应注入 ctx.ai')
      for (const key of ['chat', 'stream', 'agent', 'embed', 'embedMany']) {
        assert.equal(typeof ctx.ai[key], 'function', `ctx.ai.${key} 应为函数`)
      }
    })

    it('agent runner 提供 run/stream/runToResult', async () => {
      const ctx: any = { params: {}, query: {} }
      await ai({ embedding: {} })(new Request('http://localhost/'), ctx, async () => new Response('ok'))
      const runner = ctx.ai.agent({ model: 'mock', systemPrompt: 'x', tools: [], maxSteps: 1 })
      assert.equal(typeof runner.run, 'function')
      assert.equal(typeof runner.stream, 'function')
      assert.equal(typeof runner.runToResult, 'function')
    })

    it('agent 引擎支持工具配置（不崩溃）', async () => {
      const ctx: any = { params: {}, query: {} }
      await ai({ embedding: {} })(new Request('http://localhost/'), ctx, async () => new Response('ok'))
      const runner = ctx.ai.agent({
        model: 'mock',
        systemPrompt: '使用工具',
        tools: [{ type: 'function', function: { name: 'get_info', description: 'Get info', parameters: {} } }],
        maxSteps: 2,
      })
      assert.ok(runner)
    })
  })
})

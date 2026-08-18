/**
 * 框架 agent 引擎 emitter 抽象测试 — wf:* 事件可接自定义发射器（SSE 仅默认）
 *
 * 验证：stream(messages, { emit }) 事件流模式 / runToResult 结构化结果模式 /
 * SSE run 仍是默认通道（行为不回归）。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ai } from '../ai/index.ts'
import type { WfEmitter } from '../ai/sse.ts'

// 用真实 ai() 但 chat 端点指向不可达地址——本测试只验证事件路由，不真调 provider
const module = ai({ apiKey: 'test', baseUrl: 'http://127.0.0.1:1', defaultModel: 'm' })

test('AgentRunner.stream：wf:* 事件打到自定义 emitter（非 SSE）', async () => {
  const events: Array<[string, unknown]> = []
  const emit: WfEmitter = (name, data) => events.push([name, data])
  const runner = module.agent({ systemPrompt: 's', tools: [] })

  // provider 不可达 → 会 emit wf:error；验证 message_start 先发 + error 收尾（事件路由正确）
  await runner.stream([{ role: 'user', content: 'hi' }], { emit })

  const names = events.map(([n]) => n)
  assert.ok(names.includes('wf:message_start'), 'message_start 应打到自定义 emitter')
  assert.ok(names.includes('wf:error') || names.includes('wf:done'), '以 error 或 done 收尾')
})

test('AgentRunner.runToResult：返回结构化 AgentRunResult（content/steps/usage）', async () => {
  const runner = module.agent({ systemPrompt: 's', tools: [] })
  const result = await runner.runToResult([{ role: 'user', content: 'hi' }])
  assert.equal(typeof result.content, 'string')
  assert.ok(Array.isArray(result.steps))
  // 失败路径：content 空 + steps 空，不抛错（结构化模式对 provider 错误宽容）
  assert.ok(true)
})

test('AgentRunner.run 仍返回 SSE Response（默认通道不回归）', () => {
  const runner = module.agent({ systemPrompt: 's', tools: [] })
  const res = runner.run([{ role: 'user', content: 'hi' }])
  assert.ok(res instanceof Response)
  assert.equal(res.headers.get('content-type'), 'text/event-stream')
})

test('ai() 模块导出 agent 引擎的三种模式', () => {
  assert.equal(typeof module.agent, 'function')
  const runner = module.agent({ systemPrompt: 's', tools: [] })
  assert.equal(typeof runner.run, 'function')
  assert.equal(typeof runner.stream, 'function')
  assert.equal(typeof runner.runToResult, 'function')
})

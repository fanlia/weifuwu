/**
 * AI 模块类型流测试（编译期验证）——协议契约的类型安全由 tsc --noEmit 保证。
 *
 * 运行方式：类型断言写错 → tsc 失败（git hook + typecheck 脚本兜底）。
 * 运行时测试仅验证模块接线不抛错。
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// ── 类型层面的验证（以下类型如果写错，tsc 会失败）─────────────

import { ai, type AiClientModule, type AgentTool, type AiInjected } from '../ai/index.ts'
import type { WfStreamEvent, WfApprovalDecision, WfErrorCode, ChatMessage, ToolCall } from '../ai/index.ts'
import { aiStream, type AiStreamCallbacks } from '../client/ai.ts'

// ① ctx.ai 注入类型：app.use(ai()) 后 ctx 上是完整模块（含 agent/approve）
const aiMw: AiClientModule = ai({ apiKey: 'k' })
const handlerCtx: AiInjected = { ai: aiMw }
handlerCtx.ai.stream({ messages: [] })
handlerCtx.ai.approve({ id: 'x', decision: 'approved' })
handlerCtx.ai.agent({ systemPrompt: 'p', tools: [] })

// ② WfStreamEvent 联合类型按 name 收窄（前端 switch 的编译期保证）
const ev: WfStreamEvent = { name: 'wf:token', data: { text: 'hi' } }
switch (ev.name) {
  case 'wf:token':
    ev.data.text // text 存在
    // @ts-expect-error token 没有 usage 字段
    void ev.data.usage
    break
  case 'wf:tool_call':
    ev.data.name // 存在
    break
  case 'wf:error':
    ev.data.code // 存在
    break
  default:
    break
}

// ③ WfErrorCode / WfApprovalDecision 是字符串字面量联合（非法值编译期报错）
const code: WfErrorCode = 'rate_limited'
void code
// @ts-expect-error 非法错误码
const badCode: WfErrorCode = 'not_a_code'
void badCode
const decision: WfApprovalDecision = 'modified'
void decision
// @ts-expect-error 非法审批决策
const badDecision: WfApprovalDecision = 'maybe'
void badDecision

// ④ AgentTool：run 签名 (args, { emit, signal })，args 未类型化（LLM JSON）
const tool: AgentTool = {
  name: 'query',
  description: '查询',
  parameters: { type: 'object', properties: { q: { type: 'string' } } },
  run: (args, toolCtx) => {
    toolCtx.emit('wf:tool_progress', { toolCallId: 'x', step: 1, total: 1, status: 'running' })
    toolCtx.emit('x:custom', { anything: true })
    return args.q
  },
}
void tool

// ⑤ ChatMessage / ToolCall：消息往返形状（thinking 模式 reasoning_content 可选）
const assistantMsg: ChatMessage = {
  role: 'assistant',
  content: '',
  reasoning_content: '思考…',
  tool_calls: [{ id: 'c1', type: 'function', function: { name: 'f', arguments: '{}' } }] satisfies ToolCall[],
}
void assistantMsg

// ⑥ aiStream 回调签名
const callbacks: AiStreamCallbacks = {
  onApproval: (req) => {
    req.id
    // @ts-expect-error 下行审批请求没有 decision（那是上行响应的字段）
    void req.decision
  },
  onEvent: (name, data) => {
    name
    data
  },
}
void callbacks

// ── 运行时验证（模块接线）────────────────────────────────────

describe('AI 模块类型接线', () => {
  it('ai() 工厂返回的模块具备 agent / approve / stream', () => {
    const a = ai({ apiKey: 'k' })
    assert.equal(typeof a.agent, 'function')
    assert.equal(typeof a.approve, 'function')
    assert.equal(typeof a.stream, 'function')
    assert.equal(typeof a.chat, 'function')
    assert.equal(typeof a.sse, 'function')
  })

  it('aiStream 导出存在（类型形状由编译期 + 真实 HTTP 测试覆盖）', () => {
    assert.equal(typeof aiStream, 'function')
  })
})

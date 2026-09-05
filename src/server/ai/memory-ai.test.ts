/**
 * MemoryAi 契约测试（参考 MemorySql 的 memory-semantics.test.ts 定位）
 *
 * 覆盖：echo 默认 / onChat 决策注入 / streamStep 事件序列 / agent 单轮工具循环
 * （工具真执行） / 多模态（占位+注入） / embed 确定性 / approve 三路收尾。
 * 全部确定性——零网络零真实 LLM。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryAi, MemoryAi } from './memory.ts'
import { createAgent } from './agent.ts'
import type { ChatMessage, ToolCall } from './types.ts'

function tc(id: string, name: string, args: string): ToolCall {
  return { id, type: 'function', function: { name, arguments: args } }
}

test('new MemoryAi 构造 = 模块（同 ai() 形态——app.use 注入 ctx.ai——三种入口等价）', async () => {
  const m = (MemoryAi as unknown as () => ReturnType<typeof MemoryAi>)() // W1: 工厂函数非 class
  // 模块形态：中间件 + 全能力（非裸 provider）
  assert.equal(typeof m.chat, 'function')
  assert.equal(typeof m.agent, 'function')
  assert.equal(typeof m.generateImage, 'function')
  const r = await m.chat({ messages: [{ role: 'user', content: '你好' }] })
  assert.equal(r.choices[0].message.content, 'MemoryAI: 你好')
  // createMemoryAi 别名等价（同一函数）
  assert.equal(createMemoryAi, MemoryAi)
})

test('chat 默认 echo：末条 user 消息回显（不编造 tool_calls）', async () => {
  const ai = createMemoryAi()
  const r = await ai.chat({ messages: [{ role: 'user', content: '你好' }] })
  assert.equal(r.choices[0].message.content, 'MemoryAI: 你好')
  assert.equal(r.choices[0].finish_reason, 'stop')
  assert.equal(r.model, 'memory-ai')
})

test('chat 默认 echo：无 user 消息 → 空回显（不崩）', async () => {
  const ai = createMemoryAi()
  const r = await ai.chat({ messages: [{ role: 'system', content: 'sys' }] })
  assert.equal(r.choices[0].message.content, 'MemoryAI: ')
})

test('onChat 决策注入：tool_calls 透传（决策层——LLM 替身）', async () => {
  const ai = createMemoryAi({
    onChat: (params) => ({ content: '', toolCalls: [tc('tc-1', 'create_workflow', '{"name":"x"}')] }),
  })
  const r = await ai.chat({ messages: [{ role: 'user', content: '创建' }] })
  assert.equal(r.choices[0].finish_reason, 'tool_calls')
  assert.deepEqual(r.choices[0].message.tool_calls?.[0].function.name, 'create_workflow')
})

test('streamStep：token/tool_call/usage 事件序列 + onFinish 聚合', async () => {
  const ai = createMemoryAi({
    onChat: () => ({
      content: '结果',
      toolCalls: [tc('tc-1', 'echo', '{"m":1}')],
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
    }),
  })
  const events: Array<{ name: string; data: any }> = []
  let finish: any = null
  await ai.streamStep(
    { messages: [{ role: 'user', content: 'x' }] },
    { emit: (name, data) => events.push({ name, data }), onFinish: (r) => { finish = r } },
  )
  assert.equal(events[0].name, 'wf:token')
  assert.equal(events[0].data.text, '结果')
  assert.equal(events[1].name, 'wf:tool_call')
  assert.equal(events[1].data.name, 'echo')
  assert.deepEqual(events[1].data.args, { m: 1 })
  assert.equal(events[2].name, 'wf:usage')
  assert.equal(events[2].data.total_tokens, 5)
  assert.equal(finish.content, '结果')
  assert.equal(finish.toolCalls.length, 1)
})

test('agent 单轮工具循环：工具真执行（onChat 两轮——tool_calls → 结果回传 → 文本）', async () => {
  let round = 0
  const ai = createMemoryAi({
    onChat: (params) => {
      round += 1
      const hasToolResult = params.messages.some((m) => m.role === 'tool')
      if (!hasToolResult) return { content: '', toolCalls: [tc('tc-1', 'echo', '{"msg":"hi"}')] }
      return { content: `工具结果已收到: ${String(params.messages[params.messages.length - 1]?.content ?? '')}` }
    },
  })
  const called: string[] = []
  const agent = createAgent(ai, {
    systemPrompt: 't',
    tools: [{ name: 'echo', description: '回显', parameters: { type: 'object' }, run: (args) => { called.push(String(args.msg)); return `echo:${args.msg}` } }],
  })
  const result = await agent.runToResult([{ role: 'user', content: 'hi' }])
  assert.equal(round, 2, `两轮 LLM 决策（tool_calls + 结果回传收尾）——实际 ${round}`)
  assert.deepEqual(called, ['hi'], '工具 handler 真执行')
  assert.ok(result.content.includes('echo:hi'), `最终文本含工具结果——实际: ${result.content}`)
  // 引擎语义：wf:tool_result 把前一个 tool_call 步骤替换为 tool_result（含 toolCall 引用）
  const tr = result.steps.find((s) => s.type === 'tool_result' && s.toolCall?.name === 'echo')
  assert.ok(tr, `工具结果步骤存在（echo）——实际: ${result.steps.map((s) => s.type).join(',')}`)
})

test('多模态：占位图/立即 done/onImage 注入', async () => {
  const ai = createMemoryAi({
    onImage: (req) => ({ dataUrl: `memory://img/${req.prompt}`, mime: 'image/png' }),
  })
  const img = await ai.generateImage({ prompt: '猫' })
  assert.equal(img.dataUrl, 'memory://img/猫') // 注入优先
  const t = await ai.createVideoTask({ prompt: '夕阳' })
  assert.equal(t.taskId, 'memory-task-夕阳') // 确定性 taskId
  const st = await ai.videoStatus(t.taskId)
  assert.equal(st.status, 'done')
  assert.equal(st.url, `memory://video/${t.taskId}`)
})

test('多模态：无注入 → 占位 1×1 PNG（生成面可调用）', async () => {
  const ai = createMemoryAi()
  const img = await ai.generateImage({ prompt: 'x' })
  assert.ok(img.dataUrl?.startsWith('data:image/png;base64,'), '占位 PNG data URL')
  assert.equal(img.mime, 'image/png')
})

test('embed 确定性：同文本同向量 · 不同文本不同（哈希）', async () => {
  const ai = createMemoryAi()
  const a = await ai.embed('库存告警')
  const b = await ai.embed('库存告警')
  assert.deepEqual(a, b)
  const c = await ai.embed('视频生成')
  assert.notDeepEqual(a, c)
})

test('approve：waitApproval 挂起 → approve 响应（三路收尾——批准路径）', async () => {
  const ai = createMemoryAi()
  const events: Array<{ name: string; data: any }> = []
  const pending = ai.waitApproval(
    { id: 'ap-1', toolCallId: 'tc-1', name: 'echo', args: {} },
    (name, data) => events.push({ name, data }),
    5000,
  )
  assert.equal(events[0].name, 'wf:approval_request')
  assert.equal(ai.approve({ id: 'ap-1', decision: 'approved' }), true)
  const resp = await pending
  assert.equal(resp.decision, 'approved')
  // 用后即焚：二次 approve 返回 false
  assert.equal(ai.approve({ id: 'ap-1', decision: 'approved' }), false)
})

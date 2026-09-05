/**
 * agent 引擎测试 — 工具循环 + HITL 审批（协议 §4.5 / §5）
 *
 * wire-fake：真 HTTP + 真 SSE，按脚本分轮返回（第一轮 tool_call → 第二轮最终文本）。
 * 不 mock fetch、不 mock 网络层（CS-04 精神）。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { OpenAi } from '../ai/index.ts'
import { createAgent } from '../ai/agent.ts'
import { createMemoryAiServer, type MemoryAiRequest } from '../ai/memory-server.ts'
import type { WfStreamEvent } from '../ai/types.ts'

// ── MemoryAiServer 轮次脚本（respond 按请求次数注入 SSE——替代自建 fake） ──

/** 脚本：每轮请求按序返回一组 chunk（OpenAI 兼容 SSE）——闭包计数 */
function scriptedServer(script: Array<Array<string>>): Promise<Awaited<ReturnType<typeof createMemoryAiServer>>> {
  let i = 0
  return createMemoryAiServer({
    respond: () => ({ sse: script[Math.min(i++, script.length - 1)] }),
  })
}

const chunk = (delta: Record<string, unknown>, finish: string | null = null, extra: Record<string, unknown> = {}) =>
  `data: ${JSON.stringify({ id: 'a', model: 'm', choices: [{ index: 0, delta, finish_reason: finish }], ...extra })}\n\n`

/** 一轮：纯文本回复 */
const textRound = (text: string, usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }): string[] => [
  chunk({ role: 'assistant', content: text }),
  chunk({}, 'stop', { usage }),
  'data: [DONE]\n\n',
]

/** 一轮：单个 tool_call（id 分片，DeepSeek 行为） */
const toolRound = (name: string, args: string, usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }): string[] => [
  chunk({ role: 'assistant', tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name, arguments: '' } }] }),
  chunk({ tool_calls: [{ index: 0, function: { arguments: args } }] }),
  chunk({}, 'tool_calls', { usage }),
  'data: [DONE]\n\n',
]

async function collectEvents(res: Response): Promise<WfStreamEvent[]> {
  const events: WfStreamEvent[] = []
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''
    for (const block of blocks) {
      const evLine = block.split('\n').find((l) => l.startsWith('event: '))
      const dataLine = block.split('\n').find((l) => l.startsWith('data: '))
      if (!evLine || !dataLine) continue
      events.push({ name: evLine.slice(7), data: JSON.parse(dataLine.slice(6)) } as WfStreamEvent)
    }
  }
  return events
}

/** 从已部分读取的流继续收集剩余事件（A4 测试用——buffer 可能含半块） */
async function collectStream(reader: ReadableStreamDefaultReader<Uint8Array>, decoder: TextDecoder, buffer: string): Promise<WfStreamEvent[]> {
  const events: WfStreamEvent[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''
    for (const block of blocks) {
      const evLine = block.split('\n').find((l) => l.startsWith('event: '))
      const dataLine = block.split('\n').find((l) => l.startsWith('data: '))
      if (!evLine || !dataLine) continue
      events.push({ name: evLine.slice(7), data: JSON.parse(dataLine.slice(6)) } as WfStreamEvent)
    }
  }
  return events
}

// ── 测试 ──────────────────────────────────────────────────

test('agent：一轮无工具调用 → step llm + done', async () => {
  const fake = await scriptedServer([textRound('你好')])
  const a = OpenAi({ apiKey: 'k', baseUrl: `${fake.url}/v1`, defaultModel: 'test-model' })
  const agent = a.agent({ systemPrompt: '助手', tools: [] })
  try {
    const events = await collectEvents(agent.run([{ role: 'user', content: 'hi' }]))
    const names = events.map((e) => String(e.name))
    assert.deepEqual(names, ['wf:message_start', 'wf:step', 'wf:token', 'wf:usage', 'wf:done'])
    assert.equal((events[1].data as { type: string }).type, 'llm')
    assert.equal((events[4].data as { content: string }).content, '你好')
  } finally {
    await fake.close()
  }
})

test('agent：工具循环 → tool_call → 工具执行 emit progress → tool_result → 第二轮 → done', async () => {
  const fake = await scriptedServer([
    toolRound('query_weather', '{"city":"北京"}'),
    textRound('北京晴，25 度'),
  ])
  const a = OpenAi({ apiKey: 'k', baseUrl: `${fake.url}/v1`, defaultModel: 'test-model' })

  const progress: string[] = []
  const agent = a.agent({
    systemPrompt: '助手',
    tools: [{
      name: 'query_weather',
      description: '查询天气',
      parameters: { type: 'object', properties: { city: { type: 'string' } } },
      run: async (args: Record<string, unknown>, tool) => {
        const city = args.city as string // W1: String 构造器被环境遮蔽（tsconfig.test 面）
        tool.emit('wf:tool_progress', { toolCallId: 'call_1', step: 1, total: 2, message: `查询 ${city}…`, status: 'running' })
        progress.push(city)
        tool.emit('x:weather_source', { source: 'fake-meteo' }) // W1: 自定义事件名（协议外——工具自作主张场景）
        return { city, temp: 25, desc: '晴' }
      },
    }],
  })
  try {
    const events = await collectEvents(agent.run([{ role: 'user', content: '北京天气?' }]))
    const names = events.map((e) => String(e.name))
    // message_start → step(llm) → token* → tool_call → step(tool) → tool_progress → x: → tool_result → step(llm) → token → usage → done
    assert.equal(names[0], 'wf:message_start')
    assert.ok(names.includes('wf:tool_call'))
    assert.ok(names.includes('wf:tool_progress'))
    assert.ok(names.includes('x:weather_source'))
    assert.ok(names.includes('wf:tool_result'))
    assert.equal(names[names.length - 1], 'wf:done')

    const tc = events.find((e) => e.name === 'wf:tool_call')!.data as unknown as { name: string; args: { city: string } }
    assert.equal(tc.name, 'query_weather')
    assert.equal(tc.args.city, '北京')
    const tr = events.find((e) => e.name === 'wf:tool_result')!.data as { ok: boolean; output: { temp: number } }
    assert.equal(tr.ok, true)
    assert.equal(tr.output.temp, 25)
    assert.deepEqual(progress, ['北京'])
    assert.equal(fake.requests.length, 2, '两轮 LLM 调用')
  } finally {
    await fake.close()
  }
})

test('O13 并行工具：parallelTools 开启——双 tool_call 并发执行（并发证据）', async () => {
  // 双 tool_call 一轮（两个独立工具）+ 第二轮文本
  const fake = await scriptedServer([
    [
      chunk({ role: 'assistant', tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'slow_tool', arguments: '' } }, { index: 1, id: 'call_2', type: 'function', function: { name: 'fast_tool', arguments: '' } }] }),
      chunk({ tool_calls: [{ index: 0, function: { arguments: '{"slow":1}' } }, { index: 1, function: { arguments: '{"fast":2}' } }] }),
      chunk({}, 'tool_calls', { usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }),
      'data: [DONE]\n\n',
    ],
    textRound('两工具结果已合并'),
  ])
  const a = OpenAi({ apiKey: 'k', baseUrl: `${fake.url}/v1`, defaultModel: 'test-model' })
  // 并发证据（确定性——不依赖计时）：两工具 run 重叠（同时 in-flight）
  let inFlight = 0
  let maxInFlight = 0
  // A1 回归（T2）：工具必须收到**各自完整**的参数（旧代码同 index 参数错拼——盲区歼灭）
  const seen: Array<[string, Record<string, unknown>]> = []
  const agent = a.agent({
    systemPrompt: '助手',
    parallelTools: true, // O13：显式开启并行
    tools: [
      {
        name: 'slow_tool',
        description: '慢工具',
        run: async (args) => { inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); seen.push(['slow_tool', args]); await new Promise((r) => setTimeout(r, 120)); inFlight--; return 'slow-ok' },
      },
      {
        name: 'fast_tool',
        description: '快工具',
        run: async (args) => { inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); seen.push(['fast_tool', args]); await new Promise((r) => setTimeout(r, 30)); inFlight--; return 'fast-ok' },
      },
    ],
  })
  try {
    const result = await agent.runToResult([{ role: 'user', content: '并行测试' }])
    assert.equal(maxInFlight, 2, '双工具并发执行（同时 in-flight = 2——串行为 1）')
    assert.equal(fake.requests.length, 2, '两轮 LLM 调用')
    assert.equal(result.content, '两工具结果已合并', '第二轮文本为最终内容')
    // T2：各工具收到各自完整参数（旧代码 slow_tool 收 {}——参数丢失）
    assert.deepEqual(seen.find(([n]) => n === 'slow_tool')?.[1], { slow: 1 }, 'slow_tool 参数完整')
    assert.deepEqual(seen.find(([n]) => n === 'fast_tool')?.[1], { fast: 2 }, 'fast_tool 参数完整')
  } finally {
    await fake.close()
  }
})

test('toolContext 透传：AgentConfig.toolContext → ToolContext.context（会话上下文单一注入面）', async () => {
  const fake = await scriptedServer([
    toolRound('ctx_probe', '{}'),
    textRound('ok'),
  ])
  const a = OpenAi({ apiKey: 'k', baseUrl: `${fake.url}/v1`, defaultModel: 'test-model' })
  let seen: Record<string, unknown> | undefined
  const agent = a.agent({
    systemPrompt: '助手',
    // 业务上下文（应用层：departmentId/appId/requestId——此前闭包注入+
    // ctx 属性（_toolDepartmentId）导致注入顺序 bug——框架面透传）
    toolContext: { departmentId: 'dept-7', appId: 'app-3', requestId: 'rq-1' },
    tools: [{
      name: 'ctx_probe',
      description: '上下文探针',
      parameters: { type: 'object', properties: {} },
      run: async (_args, tool) => {
        seen = tool.context
        return 'probed'
      },
    }],
  })
  try {
    await collectEvents(agent.run([{ role: 'user', content: 'probe?' }]))
  } finally {
    await fake.close()
  }
  assert.deepEqual(seen, { departmentId: 'dept-7', appId: 'app-3', requestId: 'rq-1' }, 'ToolContext.context 应含 toolContext 全量透传')
})

test('agent：工具不存在 → tool_result ok:false，循环继续', async () => {
  const fake = await scriptedServer([
    toolRound('missing_tool', '{}'),
    textRound('抱歉，没有这个工具'),
  ])
  const a = OpenAi({ apiKey: 'k', baseUrl: `${fake.url}/v1`, defaultModel: 'test-model' })
  const agent = a.agent({ systemPrompt: '助手', tools: [] })
  try {
    const events = await collectEvents(agent.run([{ role: 'user', content: 'x' }]))
    const tr = events.find((e) => e.name === 'wf:tool_result')!.data as { ok: boolean; error: { code: string } }
    assert.equal(tr.ok, false)
    assert.equal(tr.error.code, 'tool_error')
    assert.equal((events[events.length - 1].data as { content: string }).content, '抱歉，没有这个工具')
  } finally {
    await fake.close()
  }
})

test('C2 条件审批：函数返回 false 的工具自动执行（不发 approval_request）', async () => {
  const fake = await scriptedServer([
    toolRound('read_file', '{"path":"a.txt"}'),
    textRound('内容正常'),
  ])
  const a = OpenAi({ apiKey: 'k', baseUrl: `${fake.url}/v1`, defaultModel: 'test-model' })
  let executed = false
  const agent = a.agent({
    systemPrompt: '助手',
    // 函数模式：read_file 返回 false（自动执行），其它返回 true（审批）
    humanInTheLoop: (call: any) => call.name !== 'read_file',
    tools: [{ name: 'read_file', description: '读文件', run: async () => { executed = true; return { content: 'x' } } }],
  })
  try {
    const res = agent.run([{ role: 'user', content: '读文件' }])
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let sawApproval = false
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      if (buffer.includes('wf:approval_request')) { sawApproval = true; break }
    }
    reader.cancel().catch(() => {})
    assert.equal(sawApproval, false, '函数返回 false → 自动执行不审批')
    assert.equal(executed, true, '工具已执行')
  } finally {
    await fake.close()
  }
})

test('C2 条件审批：函数返回 true 的工具走审批（approval_request 发出）', async () => {
  const fake = await scriptedServer([
    toolRound('delete_file', '{"path":"a.txt"}'),
    textRound('已删除'),
  ])
  const a = OpenAi({ apiKey: 'k', baseUrl: `${fake.url}/v1`, defaultModel: 'test-model' })
  const agent = a.agent({
    systemPrompt: '助手',
    humanInTheLoop: (call: any) => call.name === 'delete_file',
    tools: [{ name: 'delete_file', description: '删文件', run: async () => ({ ok: true }) }],
  })
  try {
    const res = agent.run([{ role: 'user', content: '删文件' }])
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let approvalId = ''
    while (!approvalId) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const m = buffer.match(/"id":"([^"]+)","toolCallId"[^}]*"name":"delete_file"/)
      if (m) approvalId = m[1]
    }
    if (approvalId) a.approve({ id: approvalId, decision: 'rejected' }) // 响应审批释放 waitApproval
    reader.cancel().catch(() => {})
    assert.ok(approvalId.length > 0, 'delete_file 应触发审批')
  } finally {
    await fake.close()
  }
})

test('agent：HITL 审批 approved → 执行工具', async () => {
  const fake = await scriptedServer([
    toolRound('send_email', '{"to":"a@x.com"}'),
    textRound('已发送'),
  ])
  const a = OpenAi({ apiKey: 'k', baseUrl: `${fake.url}/v1`, defaultModel: 'test-model' })
  let executed = false
  const agent = a.agent({
    systemPrompt: '助手',
    humanInTheLoop: true,
    tools: [{ name: 'send_email', description: '发邮件', run: async () => { executed = true; return { sent: true } } }],
  })
  try {
    const res = agent.run([{ role: 'user', content: '发邮件' }])
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    // 读取到 approval_request 事件
    let buffer = ''
    let approvalId = ''
    while (!approvalId) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() ?? ''
      for (const block of blocks) {
        const evLine = block.split('\n').find((l) => l.startsWith('event: '))
        const dataLine = block.split('\n').find((l) => l.startsWith('data: '))
        if (evLine?.includes('approval_request') && dataLine) {
          approvalId = (JSON.parse(dataLine.slice(6)) as { id: string }).id
        }
      }
    }
    assert.ok(approvalId.length > 0, '应发出 approval_request')

    // 前端/管理员响应：允许
    const accepted = a.approve({ id: approvalId, decision: 'approved' })
    assert.equal(accepted, true)

    // 继续读取剩余事件
    const rest: WfStreamEvent[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() ?? ''
      for (const block of blocks) {
        const evLine = block.split('\n').find((l) => l.startsWith('event: '))
        const dataLine = block.split('\n').find((l) => l.startsWith('data: '))
        if (evLine && dataLine) rest.push({ name: evLine.slice(7), data: JSON.parse(dataLine.slice(6)) } as WfStreamEvent)
      }
    }
    const tr = rest.find((e) => e.name === 'wf:tool_result') as { data: { ok: boolean } }
    assert.equal(tr.data.ok, true)
    assert.equal(executed, true, '审批通过后工具应执行')
  } finally {
    await fake.close()
  }
})

test('agent：HITL 审批 rejected → tool_result ok:false，agent 换方案（不终止）', async () => {
  const fake = await scriptedServer([
    toolRound('send_email', '{"to":"all@x.com"}'),
    textRound('好的，不群发。需要发给谁？'),
  ])
  const a = OpenAi({ apiKey: 'k', baseUrl: `${fake.url}/v1`, defaultModel: 'test-model' })
  let executed = false
  const agent = a.agent({
    systemPrompt: '助手',
    humanInTheLoop: true,
    tools: [{ name: 'send_email', description: '发邮件', run: async () => { executed = true; return { sent: true } } }],
  })
  try {
    const res = agent.run([{ role: 'user', content: '群发' }])
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let approvalId = ''
    while (!approvalId) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() ?? ''
      for (const block of blocks) {
        const evLine = block.split('\n').find((l) => l.startsWith('event: '))
        const dataLine = block.split('\n').find((l) => l.startsWith('data: '))
        if (evLine?.includes('approval_request') && dataLine) {
          approvalId = (JSON.parse(dataLine.slice(6)) as { id: string }).id
        }
      }
    }

    // 管理员拒绝（带备注 → 进 agent 上下文）
    a.approve({ id: approvalId, decision: 'rejected', note: '预算不够，不要群发' })

    // 读取剩余事件
    const rest: WfStreamEvent[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() ?? ''
      for (const block of blocks) {
        const evLine = block.split('\n').find((l) => l.startsWith('event: '))
        const dataLine = block.split('\n').find((l) => l.startsWith('data: '))
        if (evLine && dataLine) rest.push({ name: evLine.slice(7), data: JSON.parse(dataLine.slice(6)) } as WfStreamEvent)
      }
    }

    const tr = rest.find((e) => e.name === 'wf:tool_result') as { data: { ok: boolean; error: { code: string; message: string } } }
    assert.equal(tr.data.ok, false)
    assert.equal(tr.data.error.code, 'rejected')
    assert.equal(tr.data.error.message, '预算不够，不要群发')
    assert.equal(executed, false, '拒绝后工具不执行')
    // agent 换方案：第二轮继续（不终止）
    const done = rest.find((e) => e.name === 'wf:done')!
    assert.ok(done, '拒绝后 agent 应继续并完成')
    assert.equal(fake.requests.length, 2, '两轮 LLM 调用')
  } finally {
    await fake.close()
  }
})

test('agent：审批超时（approvalTimeoutMs=100）→ 自动按 rejected 处理，工具不执行', async () => {
  const fake = await scriptedServer([
    toolRound('send_email', '{}'),
    textRound('未获得批准，跳过。'),
  ])
  const a = OpenAi({ apiKey: 'k', baseUrl: `${fake.url}/v1`, defaultModel: 'test-model' })
  let executed = false
  const agent = a.agent({
    systemPrompt: '助手',
    humanInTheLoop: true,
    approvalTimeoutMs: 100,
    tools: [{ name: 'send_email', description: '发邮件', run: async () => { executed = true; return { sent: true } } }],
  })
  try {
    const events = await collectEvents(agent.run([{ role: 'user', content: '发' }]))
    const tr = events.find((e) => e.name === 'wf:tool_result')!.data as { ok: boolean; error: { code: string } }
    assert.equal(tr.ok, false)
    assert.equal(tr.error.code, 'rejected')
    assert.equal(executed, false, '拒绝后工具不执行')
    // agent 换方案：第二轮文本
    assert.equal((events[events.length - 1].data as { content: string }).content, '未获得批准，跳过。')
    assert.ok(events.some((e) => e.name === 'wf:approval_request'))
  } finally {
    await fake.close()
  }
})

test('agent：maxSteps 耗尽 → done 返回', async () => {
  // 脚本永远返回 tool_call（每轮都要求调用工具）→ 循环到 maxSteps
  const fake = await scriptedServer([toolRound('loop_tool', '{}')])
  const a = OpenAi({ apiKey: 'k', baseUrl: `${fake.url}/v1`, defaultModel: 'test-model' })
  const agent = a.agent({
    systemPrompt: '助手',
    maxSteps: 3,
    tools: [{ name: 'loop_tool', description: 't', run: async () => ({ ok: true }) }],
  })
  try {
    const events = await collectEvents(agent.run([{ role: 'user', content: 'x' }]))
    const done = events.find((e) => e.name === 'wf:done')!
    assert.ok(done)
    assert.equal(fake.requests.length, 3, 'maxSteps 次 LLM 调用')
    assert.ok((done.data as { usage?: { total_tokens: number } }).usage, 'done 带累积 usage')
  } finally {
    await fake.close()
  }
})

test('agent：多轮文本 → done.content 跨轮累积（A3——旧代码只含最后一轮）', async () => {
  // 首轮带 tool_call 前文本「先分析」+ 尾轮「最终答案」——token 流两段都到前端，
  // done.content 必须双段累积（协议 §3.4 完整内容；旧代码只发尾轮——实证）
  const roundWithText = (content: string, name: string): string[] => [
    chunk({ role: 'assistant', content, tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name, arguments: '' } }] }),
    chunk({ tool_calls: [{ index: 0, function: { arguments: '{}' } }] }),
    chunk({}, 'tool_calls', { usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }),
    'data: [DONE]\n\n',
  ]
  const fake = await scriptedServer([
    roundWithText('先分析', 'loop_tool'),
    textRound('最终答案'),
  ])
  const a = OpenAi({ apiKey: 'k', baseUrl: `${fake.url}/v1`, defaultModel: 'test-model' })
  const agent = a.agent({
    systemPrompt: '助手',
    maxSteps: 5,
    tools: [{ name: 'loop_tool', description: 't', run: async () => ({ ok: true }) }],
  })
  try {
    const events = await collectEvents(agent.run([{ role: 'user', content: 'x' }]))
    const done = events.find((e) => e.name === 'wf:done')!
    assert.equal((done.data as { content: string }).content, '先分析最终答案', 'done.content = 跨轮文本累积')
  } finally {
    await fake.close()
  }
})

test('agent：maxSteps 耗尽 → done.content 带累积文本（A3——旧代码 content:"" 丢失）', async () => {
  // 脚本永远返回带文本 + tool_call → 循环到 maxSteps——累积内容不丢
  const roundWithText = (content: string): string[] => [
    chunk({ role: 'assistant', content, tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'loop_tool', arguments: '' } }] }),
    chunk({ tool_calls: [{ index: 0, function: { arguments: '{}' } }] }),
    chunk({}, 'tool_calls', { usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }),
    'data: [DONE]\n\n',
  ]
  const fake = await scriptedServer([roundWithText('第')])
  const a = OpenAi({ apiKey: 'k', baseUrl: `${fake.url}/v1`, defaultModel: 'test-model' })
  const agent = a.agent({
    systemPrompt: '助手',
    maxSteps: 2,
    tools: [{ name: 'loop_tool', description: 't', run: async () => ({ ok: true }) }],
  })
  try {
    const events = await collectEvents(agent.run([{ role: 'user', content: 'x' }]))
    const done = events.find((e) => e.name === 'wf:done')!
    assert.equal(fake.requests.length, 2, 'maxSteps 次 LLM 调用')
    assert.equal((done.data as { content: string }).content, '第第', 'maxSteps 耗尽：累积文本不丢（旧代码 ""）')
  } finally {
    await fake.close()
  }
})

test('A4：审批挂起中取消 → 快速收尾 + 条目回收（approve 返回 false）', async () => {
  const fake = await scriptedServer([toolRound('needs_approval', '{}')])
  const a = OpenAi({ apiKey: 'k', baseUrl: `${fake.url}/v1`, defaultModel: 'test-model' })
  const agent = a.agent({
    systemPrompt: '助手',
    humanInTheLoop: true,
    tools: [{ name: 'needs_approval', description: 't', run: async () => ({ ok: true }) }],
  })
  try {
    const controller = new AbortController()
    const res = agent.run([{ role: 'user', content: 'x' }], { signal: controller.signal })
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let approvalId = ''
    // 读到 approval_request（挂起点）——按块解析（args 含嵌套 {}——不能用 [^}]* 贪心）
    while (!approvalId) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      for (const block of buffer.split('\n\n')) {
        if (!block.startsWith('event: wf:approval_request')) continue
        const dataLine = block.split('\n').find((l) => l.startsWith('data: '))
        if (dataLine) approvalId = JSON.parse(dataLine.slice(6)).id
      }
    }
    assert.ok(approvalId, 'approval_request 已发出（挂起中）')
    // 模拟取消（等价客户端断开 → SSE cancel → onAbort → controller.abort）
    controller.abort()
    // 决定性断言：条目已回收——事后 approve 返回 false（旧代码返回 true 且工具被错误执行）
    assert.equal(a.approve({ id: approvalId, decision: 'approved' }), false, '取消后审批条目已回收（用后即焚）')
    // 流正常收尾（旧代码挂满默认 5 分钟 approvalTimeoutMs）
    const rest = await collectStream(reader, decoder, buffer)
    assert.ok(rest.some((e) => e.name === 'wf:tool_result' && (e.data as { ok: boolean }).ok === false), '取消 → tool_result(rejected) 收尾')
  } finally {
    await fake.close()
  }
})

test('A5：长生命周期 signal 复用——多次 runToResult 无交叉污染（监听器清理哨兵）', async () => {
  const fake = await scriptedServer([textRound('hi')])
  const a = OpenAi({ apiKey: 'k', baseUrl: `${fake.url}/v1`, defaultModel: 'test-model' })
  const agent = a.agent({ systemPrompt: 's', tools: [] })
  try {
    // 同一外部 signal 连续复用（worker 场景）——每次 run 的监听器清理不残留
    const controller = new AbortController()
    for (let i = 0; i < 3; i++) {
      const result = await agent.runToResult([{ role: 'user', content: 'x' }], { signal: controller.signal })
      assert.equal(result.content, 'hi', `第 ${i + 1} 次复用正常`)
    }
    // 全部完成后 abort——无副作用（无残留监听器触发已完成 run 的重入）
    controller.abort()
    await agent.runToResult([{ role: 'user', content: 'x' }], { signal: controller.signal })
    assert.ok(true)
  } finally {
    await fake.close()
  }
})

test('agent 流式 wf:step(tool) 事件携带工具参数（前端工具卡片展示）', async () => {
  const fake = await scriptedServer([
    toolRound('send_email', '{"to":"a@x.com","subject":"你好"}'),
    textRound('已发送'),
  ])
  const a = OpenAi({ apiKey: 'k', baseUrl: `${fake.url}/v1`, defaultModel: 'test-model' })
  try {
    const agent = a.agent({
      systemPrompt: '助手',
      tools: [{ name: 'send_email', description: '发邮件', run: async () => ({ sent: true }) }],
    })
    const res = agent.run([{ role: 'user', content: '发邮件' }])
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let sawArgs = false
    let argsOk = false
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const m = buffer.match(/event: wf:step[\s\S]*?data: (\{[^}]*"type":"tool"[^}]*\})/)
      if (m) {
        sawArgs = true
        if (m[1].includes('a@x.com')) argsOk = true
        break
      }
    }
    reader.cancel().catch(() => {})
    assert.ok(sawArgs, 'wf:step tool 事件存在')
    assert.ok(argsOk, 'wf:step tool 事件必须携带 args（含参数内容）')
  } finally {
    await fake.close()
  }
})

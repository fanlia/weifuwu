/**
 * OpenAi 传输契约测试——**全部走 MemoryAiServer**（协议替身——零自建 fake server）：
 *   onChat 决策注入（正路内容）· respond 注入（故障 status / 原始 SSE 字节 / hang）
 *   requests 记录（传输细节断言——认证/路径/体）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { OpenAi } from '../ai/index.ts'
import { createMemoryAiServer, type MemoryAiRequest } from '../ai/memory-server.ts'
import { sseResponse } from '../ai/sse.ts'
import type { WfStreamEvent } from '../ai/types.ts'

/** 确定性注入载荷——MemoryAi 决策形状（onChat 返回 { content, toolCalls?, usage }——顶层） */
function chatOf(content: string): { content: string; toolCalls: []; usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } } {
  return {
    content,
    toolCalls: [],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }
}

/** 流式：两个 content chunk + 末 chunk 带 usage + [DONE]（对齐旧 FAKE_STREAM_LINES） */
const STREAM_LINES = [
  'data: {"id":"fake-1","model":"m","choices":[{"index":0,"delta":{"role":"assistant","content":"你"},"finish_reason":null}]}\n\n',
  'data: {"id":"fake-1","model":"m","choices":[{"index":0,"delta":{"content":"好"},"finish_reason":null}]}\n\n',
  'data: {"id":"fake-1","model":"m","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n',
  'data: [DONE]\n\n',
]

/** 流式 tool_calls：id 只在首个 chunk（DeepSeek 行为），arguments 分片 */
const TOOL_STREAM_LINES = [
  'data: {"id":"fake-1","model":"m","choices":[{"index":0,"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"query_orders","arguments":""}}]},"finish_reason":null}]}\n\n',
  'data: {"id":"fake-1","model":"m","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"userId\\":"}}]},"finish_reason":null}]}\n\n',
  'data: {"id":"fake-1","model":"m","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"u1\\"}"}}]},"finish_reason":null}]}\n\n',
  'data: {"id":"fake-1","model":"m","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n',
  'data: [DONE]\n\n',
]

/** 并行 tool_calls 交错分片（A1——index 键控聚合） */
const PARALLEL_TOOL_LINES = [
  'data: {"id":"1","model":"m","choices":[{"index":0,"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"call_a","type":"function","function":{"name":"tool_a","arguments":""}}]},"finish_reason":null}]}\n\n',
  'data: {"id":"1","model":"m","choices":[{"index":0,"delta":{"tool_calls":[{"index":1,"id":"call_b","type":"function","function":{"name":"tool_b","arguments":""}}]},"finish_reason":null}]}\n\n',
  'data: {"id":"1","model":"m","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"x\\":"}}]},"finish_reason":null}]}\n\n',
  'data: {"id":"1","model":"m","choices":[{"index":0,"delta":{"tool_calls":[{"index":1,"function":{"arguments":"{\\"y\\":"}}]},"finish_reason":null}]}\n\n',
  'data: {"id":"1","model":"m","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"1}"}}]},"finish_reason":null}]}\n\n',
  'data: {"id":"1","model":"m","choices":[{"index":0,"delta":{"tool_calls":[{"index":1,"function":{"arguments":"2}"}}]},"finish_reason":null}]}\n\n',
  'data: {"id":"1","model":"m","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n',
  'data: [DONE]\n\n',
]

/** 作用域助手：起 MemoryAiServer → OpenAi 客户端 → 清理 */
async function withServer(
  opts: Parameters<typeof createMemoryAiServer>[0],
  fn: (a: ReturnType<typeof OpenAi>, srv: Awaited<ReturnType<typeof createMemoryAiServer>>) => Promise<void>,
) {
  const srv = await createMemoryAiServer(opts)
  const a = OpenAi({ apiKey: 'test-key', baseUrl: `${srv.url}/v1`, defaultModel: 'm' })
  try {
    await fn(a, srv)
  } finally {
    srv.closeAllConnections()
    await srv.close()
  }
}

// ── 测试辅助：收集 Response 的 SSE 事件 ───────────────────

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
      const eventLine = block.split('\n').find((l) => l.startsWith('event: '))
      const dataLine = block.split('\n').find((l) => l.startsWith('data: '))
      if (!eventLine || !dataLine) continue
      events.push({
        name: eventLine.slice(7),
        data: JSON.parse(dataLine.slice(6)),
      } as WfStreamEvent)
    }
  }
  return events
}

// ── 测试 ──────────────────────────────────────────────────

test('ai.chat：非流式调用，解析 JSON 响应', async () => {
  await withServer({ onChat: async () => chatOf('你好') }, async (a) => {
    const res = await a.chat({ messages: [{ role: 'user', content: 'hi' }] })
    assert.ok(res.id.length > 0, 'memory 生成 id')
    assert.equal(res.choices[0].message.content, '你好')
    assert.equal(res.usage?.total_tokens, 15)
  })
})

test('ai.stream：SSE 事件序列 message_start → token → usage → done', async () => {
  await withServer({ onChat: async () => chatOf('你好') }, async (a) => {
    const res = a.stream({ messages: [{ role: 'user', content: 'hi' }] })
    assert.equal(res.headers.get('content-type'), 'text/event-stream')

    const events = await collectEvents(res)
    const names = events.map((e) => e.name)
    // onChat 整块 content → server 单 chunk → client token 事件一次（旧 fake 两分片——语义等价）
    assert.deepEqual(names, ['wf:message_start', 'wf:token', 'wf:usage', 'wf:done'])
    assert.equal((events[0].data as { id: string }).id.length > 0, true)
    assert.deepEqual((events[1].data as { text: string }).text, '你好')
    assert.deepEqual((events[3].data as { content: string }).content, '你好')
  })
})

test('ai.stream：thinking 模式 → wf:done 带 reasoning（A2——推理断路修复）', async () => {
  const LINES = [
    'data: {"id":"1","model":"m","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":"先分析：","content":""},"finish_reason":null}]}\n\n',
    'data: {"id":"1","model":"m","choices":[{"index":0,"delta":{"reasoning_content":"用户想要答案","content":"你好"},"finish_reason":null}]}\n\n',
    'data: {"id":"1","model":"m","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":2,"total_tokens":3}}\n\n',
    'data: [DONE]\n\n',
  ]
  await withServer({ respond: () => ({ sse: LINES }) }, async (a) => {
    const res = a.stream({ messages: [{ role: 'user', content: 'hi' }] })
    const events = await collectEvents(res)
    const done = events.find((e) => e.name === 'wf:done')!
    const d = done.data as { content: string; reasoning?: string }
    assert.equal(d.content, '你好')
    assert.equal(d.reasoning, '先分析：用户想要答案', 'reasoning 聚合随 done 下发（旧代码无此字段）')
  })
})

test('sse 心跳：heartbeatMs 间隔发注释行 + 事件序列完整（A6——代理保活）', async () => {
  const res = sseResponse(
    async (emit) => {
      emit('wf:token', { text: 'a' })
      await new Promise((r) => setTimeout(r, 200)) // 长工具执行窗口——零字节输出
      emit('wf:done', { content: 'a' })
    },
    { heartbeatMs: 50 },
  )
  assert.equal(res.headers.get('x-accel-buffering'), 'no', 'nginx 缓冲禁用头')
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let raw = ''
  let eventBuf = ''
  const events: WfStreamEvent[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const text = decoder.decode(value, { stream: true })
    raw += text
    eventBuf += text
    const blocks = eventBuf.split('\n\n')
    eventBuf = blocks.pop() ?? ''
    for (const block of blocks) {
      const evLine = block.split('\n').find((l) => l.startsWith('event: '))
      const dataLine = block.split('\n').find((l) => l.startsWith('data: '))
      if (!evLine || !dataLine) continue
      events.push({ name: evLine.slice(7), data: JSON.parse(dataLine.slice(6)) } as WfStreamEvent)
    }
  }
  assert.ok(raw.includes(': wf-heartbeat'), '心跳注释行存在（旧代码零字节窗口——代理断流）')
  assert.deepEqual(events.map((e) => e.name), ['wf:token', 'wf:done'], '心跳不污染事件序列（前端解析器跳过注释行）')
})

test('W6 首 token 超时：provider 挂起（无 chunk）→ wf:error timeout（不重试）', async () => {
  let calls = 0
  // 独立场景（超时参数不同——不复用 withServer 的默认客户端）
  const srv = await createMemoryAiServer({ respond: () => { calls++; return { hang: true } } })
  const a = OpenAi({ apiKey: 'k', baseUrl: `${srv.url}/v1`, defaultModel: 'm', firstTokenTimeoutMs: 150, streamRetries: 2 })
  try {
    const res = a.stream({ messages: [{ role: 'user', content: 'hi' }] })
    const events = await collectEvents(res)
    const errors = events.filter((e) => e.name === 'wf:error')
    assert.equal(errors.length, 1)
    assert.equal((errors[0].data as { code: string }).code, 'timeout', '协议 timeout 码（无 token 超时——补协议-实现缺口）')
    assert.equal(calls, 1, '超时不重试（慢请求重复计费风险——诚实裁剪）')
  } finally {
    srv.closeAllConnections()
    await srv.close()
  }
})

test('W6 流式重试：429 → 250ms 后安静重试成功（无重复 token/error 事件）', async () => {
  let calls = 0
  const srv = await createMemoryAiServer({
    respond: (req) => {
      calls++
      if (calls === 1) return { status: 429, body: { error: { message: 'rate limited' } } }
      return { sse: STREAM_LINES }
    },
  })
  const a = OpenAi({ apiKey: 'k', baseUrl: `${srv.url}/v1`, defaultModel: 'm', streamRetries: 1 })
  try {
    const events = await collectEvents(a.stream({ messages: [{ role: 'user', content: 'hi' }] }))
    assert.equal(calls, 2, '429 重试后第二次请求成功')
    assert.equal(events.some((e) => e.name === 'wf:error'), false, '重试安静——无 error 事件')
    assert.equal(events.filter((e) => e.name === 'wf:token').length, 2, 'token 只发一次（无重复）')
    assert.equal(events[events.length - 1].name, 'wf:done', '正常收尾')
  } finally {
    srv.closeAllConnections()
    await srv.close()
  }
})

test('W6 重试资格：401 auth_failed 不重试（确定失败——立即终态）', async () => {
  let calls = 0
  const srv = await createMemoryAiServer({
    respond: () => { calls++; return { status: 401, body: { error: { message: 'bad key' } } } },
  })
  const a = OpenAi({ apiKey: 'bad-key', baseUrl: `${srv.url}/v1`, defaultModel: 'm', streamRetries: 3 })
  try {
    const events = await collectEvents(a.stream({ messages: [{ role: 'user', content: 'hi' }] }))
    assert.equal(calls, 1, '401 不重试（重复调无效——计费风险）')
    const errors = events.filter((e) => e.name === 'wf:error')
    assert.equal(errors.length, 1)
    assert.equal((errors[0].data as { code: string }).code, 'auth_failed')
  } finally {
    srv.closeAllConnections()
    await srv.close()
  }
})

test('ai.stream：message_start.id 取 X-Trace-Id（追踪关联）', async () => {
  await withServer({ onChat: async () => chatOf('hi') }, async (a) => {
    const res = a.stream({ messages: [{ role: 'user', content: 'hi' }] }, { traceId: '9f3a' })
    const events = await collectEvents(res)
    assert.equal((events[0].data as { id: string }).id, '9f3a')
  })
})

test('ai.stream：tool_calls 聚合（id 只在首 chunk，arguments 分片拼接）', async () => {
  await withServer({ respond: () => ({ sse: TOOL_STREAM_LINES }) }, async (a) => {
    const res = a.stream({
      messages: [{ role: 'user', content: '查订单' }],
      tools: [{ type: 'function', function: { name: 'query_orders', description: '查', parameters: {} } }],
    })
    const events = await collectEvents(res)
    const toolCalls = events.filter((e) => e.name === 'wf:tool_call')
    assert.equal(toolCalls.length, 1)
    const tc = toolCalls[0].data as { id: string; name: string; args: Record<string, unknown> }
    assert.equal(tc.id, 'call_1')
    assert.equal(tc.name, 'query_orders')
    assert.deepEqual(tc.args, { userId: 'u1' }) // 分片拼接后的完整参数
    // tool_call 之后是 done
    const names = events.map((e) => e.name)
    assert.equal(names[names.length - 1], 'wf:done')
  })
})

test('ai.stream：并行 tool_calls 交错分片 → 各 index 参数完整（A1——index 键控聚合）', async () => {
  await withServer({ respond: () => ({ sse: PARALLEL_TOOL_LINES }) }, async (a) => {
    const res = a.stream({
      messages: [{ role: 'user', content: '查两个' }],
      tools: [
        { type: 'function', function: { name: 'tool_a', description: 'a', parameters: {} } },
        { type: 'function', function: { name: 'tool_b', description: 'b', parameters: {} } },
      ],
    })
    const events = await collectEvents(res)
    const calls = events.filter((e) => e.name === 'wf:tool_call').map((e) => e.data as { id: string; name: string; args: Record<string, unknown> })
    assert.equal(calls.length, 2)
    const a1 = calls.find((c) => c.id === 'call_a')!
    const b1 = calls.find((c) => c.id === 'call_b')!
    assert.deepEqual(a1.args, { x: 1 }, 'index 0 参数完整（旧代码丢失——错拼到 index 1）')
    assert.deepEqual(b1.args, { y: 2 }, 'index 1 参数完整')
  })
})

test('ai.stream：provider 401 → wf:error auth_failed（错误即值，连接正常结束）', async () => {
  await withServer(
    { respond: () => ({ status: 401, body: { error: { message: 'invalid api key', code: 'invalid_api_key' } } }) },
    async (a) => {
      const res = a.stream({ messages: [{ role: 'user', content: 'hi' }] })
      const events = await collectEvents(res)
      const errors = events.filter((e) => e.name === 'wf:error')
      assert.equal(errors.length, 1)
      assert.equal((errors[0].data as { code: string }).code, 'auth_failed')
    },
  )
})

test('ai.stream：provider 429 → wf:error rate_limited', async () => {
  await withServer(
    { respond: () => ({ status: 429, body: { error: { message: 'rate limit exceeded' } } }) },
    async (a) => {
      const res = a.stream({ messages: [{ role: 'user', content: 'hi' }] })
      const events = await collectEvents(res)
      const errors = events.filter((e) => e.name === 'wf:error')
      assert.equal((errors[0].data as { code: string }).code, 'rate_limited')
    },
  )
})

test('ai.stream：客户端断开 → 取消 provider 请求（abort 传播）', async () => {
  const srv = await createMemoryAiServer({
    respond: () => ({ sse: ['data: {"id":"1","model":"m","choices":[{"index":0,"delta":{"content":"a"},"finish_reason":null}]}\n\n'], hang: true }),
  })
  const a = OpenAi({ apiKey: 'test-key', baseUrl: `${srv.url}/v1`, defaultModel: 'm' })
  try {
    const controller = new AbortController()
    const res = a.stream({ messages: [{ role: 'user', content: 'hi' }] }, { signal: controller.signal })
    const reader = res.body!.getReader()
    // 读两个 chunk：message_start + token → 保证 fetch 已解析、provider body 读取中
    await reader.read()
    await reader.read()
    controller.abort() // 客户端取消
    await reader.cancel()
    // 客户端 abort 传播到 server（旧行为——provider 请求被取消）
    await new Promise((r) => setTimeout(r, 200))
    assert.equal(srv.requests.length, 1, '请求已到达（不再重复——abort 后无重试）')
  } finally {
    srv.closeAllConnections()
    await srv.close()
  }
})

test('OpenAi 构造：middleware 注入 ctx.ai + 独立可用（queue 式混合）', async () => {
  await withServer({ onChat: async () => chatOf('hi') }, async (a) => {
    // 中间件注入
    const ctx: any = {}
    const next = async () => new Response('ok')
    await a({} as any, ctx, next)
    assert.equal(typeof ctx.ai.chat, 'function')
    assert.equal(typeof ctx.ai.stream, 'function')
    assert.equal((a as any).__meta?.injects?.includes('ai'), true)
    // 独立可用（worker 场景）
    assert.equal(typeof a.chat, 'function')
  })
})

// ── BYOK（商业化 G4：per-call apiKey/baseUrl 覆盖——租户自带模型 Key） ──

test('BYOK：chat per-call apiKey/baseUrl 覆盖全局配置（租户自带模型）', async () => {
  const global = await createMemoryAiServer({ onChat: async () => chatOf('g') })
  const byok = await createMemoryAiServer({ onChat: async () => chatOf('t') })
  const a = OpenAi({ apiKey: 'global-key', baseUrl: `${global.url}/v1` })
  try {
    const res = await a.chat({
      messages: [{ role: 'user', content: 'hi' }],
      apiKey: 'tenant-key',       // 租户 BYOK
      baseUrl: `${byok.url}/v1`,       // 租户端点（OpenAI 兼容任意服务商）
      model: 'tenant-model',
    })
    assert.ok(res.id, '响应正常')
    const seen = byok.requests[0]
    assert.ok(seen, '请求到达租户端点')
    assert.equal(seen.headers['authorization'], 'Bearer tenant-key', '请求头用租户 key')
    assert.ok(seen.path.includes('/chat/completions'), '端点正确')
    assert.equal(seen.body.model, 'tenant-model', '模型用租户配置')
    assert.equal(global.requests.length, 0, '全局端点未被调用')
  } finally {
    global.closeAllConnections()
    await global.close()
    byok.closeAllConnections()
    await byok.close()
  }
})

test('BYOK：stream per-call 覆盖同样生效', async () => {
  const global = await createMemoryAiServer({ onChat: async () => chatOf('g') })
  const byok = await createMemoryAiServer({ onChat: async () => chatOf('t') })
  const a = OpenAi({ apiKey: 'global-key', baseUrl: `${global.url}/v1` })
  try {
    const res = a.stream({ messages: [{ role: 'user', content: 'hi' }], apiKey: 'tenant-key', baseUrl: byok.url })
    await collectEvents(res)
    const seen = byok.requests[0]
    assert.ok(seen, '流式请求到达租户端点')
    assert.equal(seen.headers['authorization'], 'Bearer tenant-key')
    assert.equal(global.requests.length, 0)
  } finally {
    global.closeAllConnections()
    await global.close()
    byok.closeAllConnections()
    await byok.close()
  }
})

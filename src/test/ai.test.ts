/**
 * AI 模块测试 — wire-fake：真 HTTP + 真 SSE over loopback，确定性事件流
 *
 * CS-04 精神：不 mock 网络层（不 mock fetch），起真实 HTTP 服务器验证线协议。
 * LLM 真 API 付费且不确定，故用 wire-fake 保证 CI 确定性；
 * 真实厂商行为由 DEEPSEEK_API_KEY 门控的 live 测试验证（可选）。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { ai } from '../ai/index.ts'
import type { WfStreamEvent } from '../ai/types.ts'

// ── wire-fake：OpenAI 兼容协议的真实 HTTP 服务器 ──────────

interface FakeRequest {
  method: string
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

function startFakeProvider(handler: (req: FakeRequest) => void): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw || '{}')
    handler({ method: req.method ?? 'GET', url: req.url ?? '/', headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v)])), body })

    const isStream = body.stream === true
    if (isStream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      for (const line of FAKE_STREAM_LINES) res.write(line)
      res.end()
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(FAKE_CHAT_RESPONSE))
    }
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      resolve({
        url: `http://127.0.0.1:${port}/v1`,
        close: () => new Promise((r) => server.close(() => r())),
      })
    })
  })
}

function startErrorProvider(status: number, body: unknown): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = createServer(async (_req, res) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      resolve({
        url: `http://127.0.0.1:${port}/v1`,
        close: () => new Promise((r) => server.close(() => r())),
      })
    })
  })
}

// ── 确定性 fake 载荷 ─────────────────────────────────────

const FAKE_CHAT_RESPONSE = {
  id: 'fake-1',
  model: 'deepseek-v4-flash',
  choices: [{ index: 0, message: { role: 'assistant', content: '你好' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
}

/** 流式：两个 content chunk + 末 chunk 带 usage + [DONE] */
const FAKE_STREAM_LINES = [
  'data: {"id":"fake-1","model":"m","choices":[{"index":0,"delta":{"role":"assistant","content":"你"},"finish_reason":null}]}\n\n',
  'data: {"id":"fake-1","model":"m","choices":[{"index":0,"delta":{"content":"好"},"finish_reason":null}]}\n\n',
  'data: {"id":"fake-1","model":"m","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n',
  'data: [DONE]\n\n',
]

/** 流式 tool_calls：id 只在首个 chunk（DeepSeek 行为），arguments 分片 */
const FAKE_TOOL_STREAM_LINES = [
  'data: {"id":"fake-1","model":"m","choices":[{"index":0,"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"query_orders","arguments":""}}]},"finish_reason":null}]}\n\n',
  'data: {"id":"fake-1","model":"m","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"userId\\":"}}]},"finish_reason":null}]}\n\n',
  'data: {"id":"fake-1","model":"m","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"u1\\"}"}}]},"finish_reason":null}]}\n\n',
  'data: {"id":"fake-1","model":"m","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n',
  'data: [DONE]\n\n',
]

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
  const fake = await startFakeProvider(() => {})
  const a = ai({ apiKey: 'test-key', baseUrl: fake.url })
  try {
    const res = await a.chat({ messages: [{ role: 'user', content: 'hi' }] })
    assert.equal(res.id, 'fake-1')
    assert.equal(res.choices[0].message.content, '你好')
    assert.equal(res.usage?.total_tokens, 15)
  } finally {
    await fake.close()
  }
})

test('ai.stream：SSE 事件序列 message_start → token → usage → done', async () => {
  const fake = await startFakeProvider(() => {})
  const a = ai({ apiKey: 'test-key', baseUrl: fake.url })
  try {
    const res = a.stream({ messages: [{ role: 'user', content: 'hi' }] })
    assert.equal(res.headers.get('content-type'), 'text/event-stream')

    const events = await collectEvents(res)
    const names = events.map((e) => e.name)
    assert.deepEqual(names, ['wf:message_start', 'wf:token', 'wf:token', 'wf:usage', 'wf:done'])
    assert.equal((events[0].data as { id: string }).id.length > 0, true)
    assert.deepEqual((events[1].data as { text: string }).text, '你')
    assert.deepEqual((events[2].data as { text: string }).text, '好')
    assert.deepEqual((events[4].data as { content: string }).content, '你好')
  } finally {
    await fake.close()
  }
})

test('ai.stream：message_start.id 取 X-Trace-Id（追踪关联）', async () => {
  const fake = await startFakeProvider(() => {})
  const a = ai({ apiKey: 'test-key', baseUrl: fake.url })
  try {
    const res = a.stream({ messages: [{ role: 'user', content: 'hi' }] }, { traceId: '9f3a' })
    const events = await collectEvents(res)
    assert.equal((events[0].data as { id: string }).id, '9f3a')
  } finally {
    await fake.close()
  }
})

test('ai.stream：tool_calls 聚合（id 只在首 chunk，arguments 分片拼接）', async () => {
  // 工具流 fake（id 只在首 chunk，DeepSeek 行为）
  const server = createServer(async (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    for (const line of FAKE_TOOL_STREAM_LINES) res.write(line)
    res.end()
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address() as { port: number }
  const a = ai({ apiKey: 'test-key', baseUrl: `http://127.0.0.1:${port}/v1`, defaultModel: 'm' })
  try {
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
  } finally {
    await new Promise<void>((r) => server.close(() => r()))
  }
})

test('ai.stream：provider 401 → wf:error auth_failed（错误即值，连接正常结束）', async () => {
  const fake = await startErrorProvider(401, { error: { message: 'invalid api key', code: 'invalid_api_key' } })
  const a = ai({ apiKey: 'bad-key', baseUrl: fake.url })
  try {
    const res = a.stream({ messages: [{ role: 'user', content: 'hi' }] })
    const events = await collectEvents(res)
    const errors = events.filter((e) => e.name === 'wf:error')
    assert.equal(errors.length, 1)
    assert.equal((errors[0].data as { code: string }).code, 'auth_failed')
  } finally {
    await fake.close()
  }
})

test('ai.stream：provider 429 → wf:error rate_limited', async () => {
  const fake = await startErrorProvider(429, { error: { message: 'rate limit exceeded' } })
  const a = ai({ apiKey: 'test-key', baseUrl: fake.url })
  try {
    const res = a.stream({ messages: [{ role: 'user', content: 'hi' }] })
    const events = await collectEvents(res)
    const errors = events.filter((e) => e.name === 'wf:error')
    assert.equal((errors[0].data as { code: string }).code, 'rate_limited')
  } finally {
    await fake.close()
  }
})

test('ai.stream：客户端断开 → 取消 provider 请求（abort 传播）', async () => {
  let aborted = false
  const server = createServer(async (req, res) => {
    req.on('aborted', () => { aborted = true })
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.write('data: {"id":"1","model":"m","choices":[{"index":0,"delta":{"content":"a"},"finish_reason":null}]}\n\n')
    // 故意不结束，等待客户端断开
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address() as { port: number }
  const a = ai({ apiKey: 'test-key', baseUrl: `http://127.0.0.1:${port}/v1` })
  try {
    const controller = new AbortController()
    const res = a.stream({ messages: [{ role: 'user', content: 'hi' }] }, { signal: controller.signal })
    const reader = res.body!.getReader()
    // 读两个 chunk：message_start + token → 保证 fetch 已解析、provider body 读取中
    await reader.read()
    await reader.read()
    controller.abort() // 客户端取消
    await reader.cancel()
    // 给服务器一点时间感知断开
    await new Promise((r) => setTimeout(r, 200))
    assert.equal(aborted, true, 'provider 请求应被取消')
  } finally {
    server.closeAllConnections()
    await new Promise((r) => server.close(r))
  }
})

test('ai() 工厂：middleware 注入 ctx.ai + 独立可用（queue 式混合）', async () => {
  const fake = await startFakeProvider(() => {})
  const a = ai({ apiKey: 'test-key', baseUrl: fake.url })
  try {
    // 中间件注入
    const ctx: any = {}
    const next = async () => new Response('ok')
    await a({} as any, ctx, next)
    assert.equal(typeof ctx.ai.chat, 'function')
    assert.equal(typeof ctx.ai.stream, 'function')
    assert.equal((a as any).__meta?.injects?.includes('ai'), true)
    // 独立可用（worker 场景）
    assert.equal(typeof a.chat, 'function')
  } finally {
    await fake.close()
  }
})

// ── BYOK（商业化 G4：per-call apiKey/baseUrl 覆盖——租户自带模型 Key） ──

test('BYOK：chat per-call apiKey/baseUrl 覆盖全局配置（租户自带模型）', async () => {
  let seen: FakeRequest | null = null
  const global = await startFakeProvider(() => {})
  const byok = await startFakeProvider((req) => { seen = req })
  const a = ai({ apiKey: 'global-key', baseUrl: global.url })
  try {
    const res = await a.chat({
      messages: [{ role: 'user', content: 'hi' }],
      apiKey: 'tenant-key',       // 租户 BYOK
      baseUrl: byok.url,          // 租户端点（OpenAI 兼容任意服务商）
      model: 'tenant-model',
    })
    assert.ok(res.id, '响应正常')
    assert.ok(seen, '请求到达租户端点')
    assert.equal(seen!.headers['authorization'], 'Bearer tenant-key', '请求头用租户 key')
    assert.ok(seen!.url.includes('/chat/completions'), '端点正确')
    assert.equal(seen!.body.model, 'tenant-model', '模型用租户配置')
  } finally {
    await global.close()
    await byok.close()
  }
})

test('BYOK：stream per-call 覆盖同样生效', async () => {
  let seen: FakeRequest | null = null
  const global = await startFakeProvider(() => {})
  const byok = await startFakeProvider((req) => { seen = req })
  const a = ai({ apiKey: 'global-key', baseUrl: global.url })
  try {
    const res = a.stream({ messages: [{ role: 'user', content: 'hi' }], apiKey: 'tenant-key', baseUrl: byok.url })
    await collectEvents(res)
    assert.ok(seen, '流式请求到达租户端点')
    assert.equal(seen!.headers['authorization'], 'Bearer tenant-key')
  } finally {
    await global.close()
    await byok.close()
  }
})

/**
 * AI 核心模块测试 — DeepSeek、DashScope、SSE 流解析、Agent Tool Loop
 */

import { describe, it, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import type { ChatMessage, ToolDefinition, AgentConfig } from '../src/ai/types.ts'
import { parseSSEStream } from '../src/ai/stream.ts'
import { DeepSeekClient } from '../src/ai/deepseek.ts'
import { DashScopeClient } from '../src/ai/dashscope.ts'
import { createAgent, registerTool } from '../src/ai/agent.ts'

// ── 模拟 fetch ───────────────────────────────────────────

function mockFetch(status: number, body: unknown): void {
  mock.method(globalThis, 'fetch', () =>
    Promise.resolve(new Response(JSON.stringify(body), { status }))
  )
}

function mockFetchStream(chunks: string[]): void {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
  mock.method(globalThis, 'fetch', () =>
    Promise.resolve(new Response(stream, { status: 200 }))
  )
}

describe('AI Core Module', () => {

  // ── SSE 流解析器 ─────────────────────────────────────────

  describe('parseSSEStream', () => {
    it('解析简单 SSE 数据', async () => {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"id":"1","model":"m","choices":[{"index":0,"delta":{"content":"hello"},"finish_reason":null}]}\n\n'))
          controller.enqueue(encoder.encode('data: {"id":"2","model":"m","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":"stop"}]}\n\n'))
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        },
      })

      const chunks = []
      for await (const chunk of parseSSEStream(stream)) {
        chunks.push(chunk)
      }
      assert.equal(chunks.length, 2)
      assert.equal(chunks[0].choices[0].delta.content, 'hello')
      assert.equal(chunks[1].choices[0].delta.content, ' world')
    })

    it('处理空流', async () => {
      const stream = new ReadableStream({
        start(controller) { controller.close() },
      })
      const chunks = []
      for await (const chunk of parseSSEStream(stream)) {
        chunks.push(chunk)
      }
      assert.equal(chunks.length, 0)
    })

    it('跳过注释行', async () => {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(':comment\n\ndata: {"id":"1","model":"m","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\n'))
          controller.close()
        },
      })
      const chunks = []
      for await (const chunk of parseSSEStream(stream)) {
        chunks.push(chunk)
      }
      assert.equal(chunks.length, 1)
      assert.equal(chunks[0].choices[0].delta.content, 'ok')
    })
  })

  // ── DeepSeek 客户端 ──────────────────────────────────────

  describe('DeepSeekClient', () => {
    afterEach(() => mock.restoreAll())

    it('chat 返回 ChatResponse', async () => {
      const mockResponse = {
        id: 'chat-1',
        model: 'deepseek-chat',
        choices: [
          { index: 0, message: { role: 'assistant', content: 'Hello!' }, finish_reason: 'stop' },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }
      mockFetch(200, mockResponse)

      const client = new DeepSeekClient({ apiKey: 'test-key' })
      const result = await client.chat({
        messages: [{ role: 'user', content: 'Hi' }],
      })
      assert.equal(result.choices[0].message.content, 'Hello!')
      assert.equal(result.usage?.total_tokens, 15)
    })

    it('chat 处理 API 错误', async () => {
      mockFetch(401, { error: 'unauthorized' })
      const client = new DeepSeekClient({ apiKey: 'bad-key' })
      await assert.rejects(
        () => client.chat({ messages: [{ role: 'user', content: 'Hi' }] }),
        /DeepSeek API error \(401\)/,
      )
    })

    it('chat 发送正确的请求体', async () => {
      let capturedBody: string | null = null
      mock.method(globalThis, 'fetch', (url: string, opts: any) => {
        capturedBody = opts.body
        return Promise.resolve(new Response(JSON.stringify({
          id: 'r', model: 'm', choices: [{ index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'stop' }],
        })))
      })

      const client = new DeepSeekClient({ apiKey: 'test-key', defaultModel: 'test-model' })
      await client.chat({
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.5,
        max_tokens: 100,
      })

      const body = JSON.parse(capturedBody!)
      assert.equal(body.model, 'test-model')
      assert.equal(body.temperature, 0.5)
      assert.equal(body.max_tokens, 100)
      assert.equal(body.stream, false)
      assert.equal(body.messages[0].content, 'Hello')
    })

    it('chatStream 触发 callbacks', async () => {
      const sseData = [
        'data: {"id":"1","model":"m","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
        'data: {"id":"2","model":"m","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ]
      mockFetchStream(sseData)

      const client = new DeepSeekClient({ apiKey: 'test-key' })
      const chunks: any[] = []
      let fullContent = ''

      await client.chatStream({
        messages: [{ role: 'user', content: 'Hi' }],
        onChunk: (chunk) => chunks.push(chunk),
        onFinish: (result) => { fullContent = result.content },
      })

      assert.equal(chunks.length, 2)
      assert.equal(fullContent, 'Hello world')
    })

    it('初始化时 apiKey 为空抛出错误', () => {
      const oldKey = process.env.DEEPSEEK_API_KEY
      delete process.env.DEEPSEEK_API_KEY
      assert.throws(() => new DeepSeekClient(), /DEEPSEEK_API_KEY/)
      if (oldKey) process.env.DEEPSEEK_API_KEY = oldKey
    })
  })

  // ── DashScope 客户端 ─────────────────────────────────────

  describe('DashScopeClient', () => {
    afterEach(() => mock.restoreAll())

    it('embed 返回向量', async () => {
      mockFetch(200, {
        model: 'text-embedding-v4',
        data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }],
        usage: { prompt_tokens: 5, total_tokens: 5 },
      })

      const client = new DashScopeClient({ apiKey: 'test-key' })
      const result = await client.embed('hello')
      assert.deepEqual(result, [0.1, 0.2, 0.3])
    })

    it('embedMany 返回多个向量', async () => {
      mockFetch(200, {
        model: 'text-embedding-v4',
        data: [
          { index: 0, embedding: [0.1, 0.2] },
          { index: 1, embedding: [0.3, 0.4] },
        ],
        usage: { prompt_tokens: 10, total_tokens: 10 },
      })

      const client = new DashScopeClient({ apiKey: 'test-key' })
      const results = await client.embedMany(['a', 'b'])
      assert.equal(results.length, 2)
      assert.deepEqual(results[0], [0.1, 0.2])
      assert.deepEqual(results[1], [0.3, 0.4])
    })

    it('embed 处理 API 错误', async () => {
      mockFetch(400, { error: 'bad request' })
      const client = new DashScopeClient({ apiKey: 'test-key' })
      await assert.rejects(
        () => client.embed('test'),
        /DashScope API error \(400\)/,
      )
    })

    it('初始化时 apiKey 为空抛出错误', () => {
      const oldKey = process.env.DASHSCOPE_API_KEY
      delete process.env.DASHSCOPE_API_KEY
      assert.throws(() => new DashScopeClient(), /DASHSCOPE_API_KEY/)
      if (oldKey) process.env.DASHSCOPE_API_KEY = oldKey
    })
  })

  // ── Agent Tool Loop ──────────────────────────────────────

  describe('createAgent', () => {
    afterEach(() => mock.restoreAll())

    // 创建一个模拟 AI 客户端
    function createMockAiClient(responses: Array<{
      content?: string
      tool_calls?: import('../src/ai/types.ts').ToolCall[]
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
    }>) {
      let callIndex = 0
      return {
        chat: async () => {
          const r = responses[callIndex] ?? responses[responses.length - 1]
          callIndex++
          return {
            id: 'test',
            model: 'test',
            choices: [{
              index: 0,
              message: { role: 'assistant', content: r.content ?? '', tool_calls: r.tool_calls },
              finish_reason: r.tool_calls ? 'tool_calls' : 'stop',
            }],
            usage: r.usage ?? { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }
        },
        chatStream: async () => {},
      }
    }

    it('简单对话 — 无 tool calling', async () => {
      registerTool('test_tool', async () => 'result')

      const mockAi = createMockAiClient([
        { content: 'Hello!', usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 } },
      ]) as any

      const agent = createAgent(mockAi, {
        systemPrompt: 'You are a helpful assistant.',
        tools: [],
        maxSteps: 5,
      })

      const result = await agent.run([{ role: 'user', content: 'Hi' }])
      assert.equal(result.content, 'Hello!')
      assert.equal(result.usage?.total_tokens, 8)
      assert.equal(result.steps.length, 1)
      assert.equal(result.steps[0].type, 'llm')
    })

    it('单轮 tool calling', async () => {
      registerTool('get_weather', async (args) => `Weather: ${args.city} is sunny`)

      const toolCall: import('../src/ai/types.ts').ToolCall = {
        id: 'call_1',
        type: 'function',
        function: { name: 'get_weather', arguments: '{"city":"Beijing"}' },
      }

      const mockAi = createMockAiClient([
        { content: '', tool_calls: [toolCall] },
        { content: 'Beijing is sunny today!' },
      ]) as any

      const agent = createAgent(mockAi, {
        systemPrompt: 'You are a helpful assistant.',
        tools: [{
          type: 'function',
          function: { name: 'get_weather', description: 'Get weather', parameters: { type: 'object', properties: { city: { type: 'string' } } } },
        }],
        maxSteps: 5,
      })

      const result = await agent.run([{ role: 'user', content: 'Weather in Beijing?' }])
      assert.ok(result.content.includes('sunny'))
      assert.equal(result.steps.length, 4) // llm(tool_call_1) → tool_call → tool_result → llm(response)
    })

    it('达到最大步数后返回', async () => {
      registerTool('loop', async () => 'again')

      const toolCall: import('../src/ai/types.ts').ToolCall = {
        id: 'call_loop',
        type: 'function',
        function: { name: 'loop', arguments: '{}' },
      }

      // 每次都返回 tool_call → 2 步后停止
      const mockAi = createMockAiClient([
        { content: '', tool_calls: [toolCall] },
        { content: '', tool_calls: [toolCall] },
      ]) as any

      const agent = createAgent(mockAi, {
        systemPrompt: 'test',
        tools: [{
          type: 'function',
          function: { name: 'loop', description: 'loop', parameters: {} },
        }],
        maxSteps: 2,
      })

      const result = await agent.run([{ role: 'user', content: 'go' }])
      assert.ok(result.content !== undefined)
    })

    it('tool handler 未注册返回错误', async () => {
      const toolCall: import('../src/ai/types.ts').ToolCall = {
        id: 'call_1',
        type: 'function',
        function: { name: 'unregistered_tool', arguments: '{}' },
      }

      const mockAi = createMockAiClient([
        { content: '', tool_calls: [toolCall] },
        { content: 'done' },
      ]) as any

      const agent = createAgent(mockAi, {
        systemPrompt: 'test',
        tools: [{
          type: 'function',
          function: { name: 'unregistered_tool', description: 'test', parameters: {} },
        }],
        maxSteps: 5,
      })

      const result = await agent.run([{ role: 'user', content: 'go' }])
      // 工具不存在应有错误消息
      const toolResults = result.messages.filter(m => m.role === 'tool')
      assert.ok(toolResults.some(m => m.content.includes('not registered')))
    })

    it('流式 stream() 返回内容', async () => {
      const mockAi = {
        chat: async () => ({
          id: 'r', model: 'm',
          choices: [{ index: 0, message: { role: 'assistant', content: 'Hello' }, finish_reason: 'stop' }],
        }),
        chatStream: async (params: any) => {
          params.onChunk({
            id: '1', model: 'm',
            choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: 'stop' }],
          })
          params.onFinish?.({ content: 'Hello', toolCalls: [] })
        },
      } as any

      const agent = createAgent(mockAi, {
        systemPrompt: 'test',
        tools: [],
        maxSteps: 5,
      })

      const chunks: any[] = []
      const result = await agent.stream(
        [{ role: 'user', content: 'Hi' }],
        { onChunk: (c) => chunks.push(c) },
      )
      assert.equal(result.content, 'Hello')
      assert.equal(chunks.length, 1)
    })
  })
})

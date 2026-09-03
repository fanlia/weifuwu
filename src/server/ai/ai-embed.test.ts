/**
 * 框架 OpenAi embedding 能力测试
 *
 * wire-fake：真 HTTP 服务器按 DashScope compatible-mode 协议输出 embeddings 响应
 * （不 mock fetch，CS-04 精神）。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { OpenAi } from '../ai/index.ts'
import { AiError } from '../ai/client.ts'
import { createMemoryAiServer } from '../ai/memory-server.ts'

// ── MemoryAiServer（onEmbed 决策注入——真实 /v1/embeddings 协议面） ──

/** 确定性嵌入（对齐旧 wire-fake 响应：[i+1, i*2, 0.5]） */
async function startEmbedServer(): Promise<Awaited<ReturnType<typeof createMemoryAiServer>>> {
  return createMemoryAiServer({
    onEmbed: async (texts: string[]) => texts.map((_, i) => [i + 1, i * 2, 0.5]),
  })
}

test('OpenAi({ embedding }) 的 embed/embedMany 走 DashScope 协议', async () => {
  const srv = await startEmbedServer()
  try {
    const module = OpenAi({
      apiKey: 'test-key',
      baseUrl: 'http://127.0.0.1:1', // chat 端点不可达（本测试不用）
      defaultModel: 'test-chat-model',
      embedding: { apiKey: 'emb-key', baseUrl: `${srv.url}/v1`, defaultModel: 'text-embedding-v4' },
    })

    const single = await module.embed('hello')
    assert.deepEqual(single, [1, 0, 0.5], '单文本嵌入（index 0）')

    const many = await module.embedMany(['a', 'b'])
    assert.deepEqual(many, [[1, 0, 0.5], [2, 2, 0.5]], '批量按 index 排序')
    assert.equal(srv.requests[1].body.model, 'text-embedding-v4', '请求 model 对齐默认参数')
    assert.deepEqual(srv.requests[1].body.input, ['a', 'b'])
  } finally {
    srv.closeAllConnections()
    await srv.close()
  }
})

test('embedding 默认参数与环境变量对齐（DASHSCOPE_*）', async () => {
  const srv = await startEmbedServer()
  const old = { key: process.env.DASHSCOPE_API_KEY, url: process.env.DASHSCOPE_BASE_URL, model: process.env.DASHSCOPE_EMBEDDING_MODEL }
  try {
    process.env.DASHSCOPE_API_KEY = 'env-key'
    process.env.DASHSCOPE_BASE_URL = `${srv.url}/v1`
    process.env.DASHSCOPE_EMBEDDING_MODEL = 'text-embedding-v3'

    const module = OpenAi({ apiKey: 'chat-key', baseUrl: 'http://127.0.0.1:1', defaultModel: 'm' })
    const v = await module.embed('x')
    assert.deepEqual(v, [1, 0, 0.5])
    assert.equal(srv.requests[0].body.model, 'text-embedding-v3', '模型从环境变量读取')
  } finally {
    process.env.DASHSCOPE_API_KEY = old.key
    process.env.DASHSCOPE_BASE_URL = old.url
    process.env.DASHSCOPE_EMBEDDING_MODEL = old.model
    srv.closeAllConnections()
    await srv.close()
  }
})

test('未配置 embedding 时 embed() 抛 AiError(unsupported)（诚实裁剪：不静默降级）', async () => {
  const old = process.env.DASHSCOPE_API_KEY
  delete process.env.DASHSCOPE_API_KEY // 隔离：确保无环境变量配置
  try {
    const module = OpenAi({ apiKey: 'k', baseUrl: 'http://127.0.0.1:1', defaultModel: 'm' })
    await assert.rejects(() => module.embed('x'), (e: unknown) => {
      assert.ok(e instanceof AiError)
      assert.equal((e as AiError).code, 'unsupported')
      return true
    })
    await assert.rejects(() => module.embedMany(['x']), (e: unknown) => {
      assert.ok(e instanceof AiError)
      assert.equal((e as AiError).code, 'unsupported')
      return true
    })
  } finally {
    process.env.DASHSCOPE_API_KEY = old
  }
})

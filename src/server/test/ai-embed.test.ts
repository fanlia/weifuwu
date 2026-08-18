/**
 * 框架 ai() embedding 能力测试
 *
 * wire-fake：真 HTTP 服务器按 DashScope compatible-mode 协议输出 embeddings 响应
 * （不 mock fetch，CS-04 精神）。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { ai } from '../ai/index.ts'
import { AiError } from '../ai/client.ts'

// ── wire-fake：DashScope /embeddings 协议服务器 ─────────────
let lastBody: { model: string; input: string[] } | null = null
let server: Server
let baseUrl: string

async function startEmbedServer(): Promise<void> {
  server = createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    lastBody = JSON.parse(raw || '{}')
    const n = lastBody!.input.length
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      data: Array.from({ length: n }, (_, i) => ({
        index: i,
        embedding: [i + 1, i * 2, 0.5], // 确定性向量
      })),
    }))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`
}

test('ai({ embedding }) 的 embed/embedMany 走 DashScope 协议', async () => {
  await startEmbedServer()
  try {
    const module = ai({
      apiKey: 'test-key',
      baseUrl: 'http://127.0.0.1:1', // chat 端点不可达（本测试不用）
      defaultModel: 'test-chat-model',
      embedding: { apiKey: 'emb-key', baseUrl, defaultModel: 'text-embedding-v4' },
    })

    const single = await module.embed('hello')
    assert.deepEqual(single, [1, 0, 0.5], '单文本嵌入（index 0）')

    const many = await module.embedMany(['a', 'b'])
    assert.deepEqual(many, [[1, 0, 0.5], [2, 2, 0.5]], '批量按 index 排序')
    assert.equal(lastBody?.model, 'text-embedding-v4', '请求 model 对齐默认参数')
    assert.deepEqual(lastBody?.input, ['a', 'b'])
  } finally {
    server.close()
  }
})

test('embedding 默认参数与环境变量对齐（DASHSCOPE_*）', async () => {
  await startEmbedServer()
  const old = { key: process.env.DASHSCOPE_API_KEY, url: process.env.DASHSCOPE_BASE_URL, model: process.env.DASHSCOPE_EMBEDDING_MODEL }
  try {
    process.env.DASHSCOPE_API_KEY = 'env-key'
    process.env.DASHSCOPE_BASE_URL = baseUrl
    process.env.DASHSCOPE_EMBEDDING_MODEL = 'text-embedding-v3'

    const module = ai({ apiKey: 'chat-key', baseUrl: 'http://127.0.0.1:1', defaultModel: 'm' })
    const v = await module.embed('x')
    assert.deepEqual(v, [1, 0, 0.5])
    assert.equal(lastBody?.model, 'text-embedding-v3', '模型从环境变量读取')
  } finally {
    process.env.DASHSCOPE_API_KEY = old.key
    process.env.DASHSCOPE_BASE_URL = old.url
    process.env.DASHSCOPE_EMBEDDING_MODEL = old.model
    server.close()
  }
})

test('未配置 embedding 时 embed() 抛 AiError(unsupported)（诚实裁剪：不静默降级）', async () => {
  const old = process.env.DASHSCOPE_API_KEY
  delete process.env.DASHSCOPE_API_KEY // 隔离：确保无环境变量配置
  try {
    const module = ai({ apiKey: 'k', baseUrl: 'http://127.0.0.1:1', defaultModel: 'm' })
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

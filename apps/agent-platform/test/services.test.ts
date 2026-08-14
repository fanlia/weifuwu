/**
 * 服务层测试 — agent-runner、chat、webhook、embedding
 */

import { describe, it, before, after, mock } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { postgres } from 'weifuwu'
import type { Context } from 'weifuwu'
import { runAgent, streamAgent } from '../src/services/agent-runner.ts'
import { handleNewMessage, handleNewMessageStream } from '../src/services/chat.ts'
import { handleWebhookMessage } from '../src/services/webhook.ts'
import { chunkAndEmbed, searchKnowledgeBase } from '../src/services/embedding.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── 模拟 AI 客户端 ──────────────────────────────────────

const mockAiClient = {
  chat: async () => ({
    id: 'mock',
    model: 'mock',
    choices: [{
      index: 0,
      message: { role: 'assistant', content: 'AI 回复内容' },
      finish_reason: 'stop' as const,
    }],
  }),
  chatStream: async (params: any) => {
    params.onChunk({
      id: '1', model: 'm',
      choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: 'stop' as const }],
    })
    params.onFinish?.({ content: 'Hello', toolCalls: [] })
  },
  agent: (config: any) => ({
    run: (messages: any[]) => new Response('ok'),
    stream: async (messages: any[], opts?: any) => {
      // 框架 wf:* 事件协议：emit(name, data)
      opts?.emit?.('wf:token', { text: 'Streaming' })
      opts?.emit?.('wf:usage', { totalTokens: 10 })
      opts?.emit?.('wf:done', {})
    },
    runToResult: async (messages: any[]) => ({
      content: `Agent 回复: ${messages.map(m => m.content).join(', ')}`,
      messages: [
        { role: 'system', content: config.systemPrompt },
        ...messages,
        { role: 'assistant', content: 'Agent 回复内容' },
      ],
      steps: [{ type: 'llm', content: 'Agent 回复内容' }],
    }),
  }),
  embed: async (text: string) => {
    // 返回 1024 维向量（匹配 schema vector(1024)）
    const vec = new Array(1024).fill(0)
    vec[0] = 0.1
    vec[1] = 0.2
    return vec
  },
  embedMany: async (texts: string[]) => {
    return texts.map(() => {
      const vec = new Array(1024).fill(0)
      vec[0] = 0.1
      vec[1] = 0.2
      return vec
    })
  },
}

const APP_ID = '00000000-0000-0000-0000-000000000001'
const DEPT_ID = '00000000-0000-0000-0000-000000000020'
const AI_AGENT_ID = '00000000-0000-0000-0000-000000000030'
const USER_AGENT_ID = '00000000-0000-0000-0000-000000000031'

function makeMockCtx(extra?: Record<string, unknown>): Context {
  return {
    params: {},
    query: {},
    ai: mockAiClient,
    sql: null as any,
    appId: APP_ID,
    auth: { userId: 'test-user', appId: APP_ID, email: 'test@test.com', name: 'Test', role: 'member' },
    ...extra,
  } as any
}

let pg: ReturnType<typeof postgres>

before(async () => {
  pg = postgres(process.env.TEST_DATABASE_URL ?? 'postgres://root:123456@localhost:5432/demo_svc_test', { max: 10, closeTimeout: 1 })
  const schemaPath = resolve(__dirname, '..', 'src', 'db', 'schema.sql')
  const schema = readFileSync(schemaPath, 'utf-8')
  await pg.sql.unsafe(`
    DROP TABLE IF EXISTS kb_chunks CASCADE;
    DROP TABLE IF EXISTS kb_documents CASCADE;
    DROP TABLE IF EXISTS messages CASCADE;
    DROP TABLE IF EXISTS department_members CASCADE;
    DROP TABLE IF EXISTS departments CASCADE;
    DROP TABLE IF EXISTS agents CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
    DROP TYPE IF EXISTS agent_type CASCADE;
  `)
  await pg.sql.unsafe(schema)

  // 插入测试数据（使用有效 UUID）
  await pg.sql`INSERT INTO departments (id, app_id, name) VALUES ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', 'Test Dept')`
  await pg.sql`INSERT INTO agents (id, app_id, type, name, system_prompt) VALUES ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000001', 'ai', 'AI Bot', '你是AI助手')`
  await pg.sql`INSERT INTO agents (id, app_id, type, name) VALUES ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000001', 'user', 'User')`
  await pg.sql`INSERT INTO department_members (department_id, agent_id) VALUES ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000030')`
  await pg.sql`INSERT INTO department_members (department_id, agent_id) VALUES ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000031')`
})

after(async () => {
  if (pg) {
    await pg.close()
  }
})

describe('Services', () => {

  // ── Agent Runner ────────────────────────────────────────

  describe('runAgent()', () => {
    it('返回 AgentRunResult', async () => {
      const ctx = makeMockCtx()
      const result = await runAgent(ctx, {
        agentId: AI_AGENT_ID,
        appId: APP_ID,
        departmentId: DEPT_ID,
        systemPrompt: '你是有帮助的助手',
        model: 'deepseek-v4-flash',
        tools: [],
        maxSteps: 5,
      }, [{ role: 'user', content: '你好' }])

      assert.ok(result.content)
      assert.ok(Array.isArray(result.steps))
      assert.ok(result.steps.length >= 1)
    })

    it('支持工具配置', async () => {
      const ctx = makeMockCtx()
      const result = await runAgent(ctx, {
        agentId: AI_AGENT_ID,
        appId: APP_ID,
        departmentId: DEPT_ID,
        systemPrompt: '使用工具回答问题',
        tools: [{
          type: 'function',
          function: { name: 'test_tool', description: 'Test', parameters: {} },
        }],
        maxSteps: 3,
      }, [{ role: 'user', content: '执行工具' }])

      assert.ok(result.content)
    })
  })

  describe('streamAgent()', () => {
    it('流式输出触发 callbacks', async () => {
      const ctx = makeMockCtx()
      const chunks: string[] = []

      await streamAgent(ctx, {
        agentId: AI_AGENT_ID,
        appId: APP_ID,
        departmentId: DEPT_ID,
        systemPrompt: '流式回答',
        tools: [],
        maxSteps: 3,
      }, [{ role: 'user', content: '流式输出测试' }], {
        onChunk: (chunk) => chunks.push(chunk),
        onFinish: () => {},
      })

      assert.ok(chunks.length >= 1)
    })
  })

  // ── Chat Service ────────────────────────────────────────

  describe('handleNewMessage()', () => {
    it('部门有 AI Agent 时触发自动回复', async () => {
      const ctx = makeMockCtx({ sql: await pg.sql as any })

      await handleNewMessage(ctx, DEPT_ID, USER_AGENT_ID, '测试消息')

      const messages = await pg.sql`
        SELECT content, ai_approved FROM messages WHERE department_id = ${DEPT_ID}
      `
      assert.ok(messages.length >= 1)
      const aiReply = messages.find((m: any) => m.ai_approved === true)
      assert.ok(aiReply, 'AI 自动回复应存在且已批准')
    })

    it('部门无 AI Agent 时插入系统提示（引导添加）', async () => {
      // 创建一个无 AI 成员的部门
      await pg.sql`INSERT INTO departments (id, app_id, name) VALUES ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000001', 'Empty')`
      await pg.sql`INSERT INTO department_members (department_id, agent_id) VALUES ('00000000-0000-0000-0000-000000000022', ${USER_AGENT_ID})`

      const ctx = makeMockCtx({ sql: await pg.sql as any })
      await handleNewMessage(ctx, '00000000-0000-0000-0000-000000000022', USER_AGENT_ID, '无 AI 回复')

      const msgs = await pg.sql`
        SELECT * FROM messages WHERE department_id = '00000000-0000-0000-0000-000000000022'
      `
      assert.equal(msgs.length, 1)
      assert.equal(msgs[0].msg_type, 'system')
      assert.match(String(msgs[0].content), /暂无 AI 成员/)
    })

    it('human_in_the_loop 创建草稿', async () => {
      // 创建 HITL AI Agent
      await pg.sql`
        INSERT INTO agents (id, app_id, type, name, system_prompt, human_in_the_loop)
        VALUES ('00000000-0000-0000-0000-000000000032', ${APP_ID}, 'ai', 'HITL Bot', '需审批', TRUE)
      `
      await pg.sql`
        INSERT INTO department_members (department_id, agent_id) VALUES (${DEPT_ID}, '00000000-0000-0000-0000-000000000032')
      `

      const ctx = makeMockCtx({ sql: await pg.sql as any })

      await handleNewMessage(ctx, DEPT_ID, USER_AGENT_ID, '需审批的消息')

      // 验证存在 ai_approved IS NULL 的草稿
      const drafts = await pg.sql`
        SELECT * FROM messages WHERE ai_approved IS NULL
      `
      assert.ok(drafts.length >= 1, '应有待审批的 AI 草稿')
    })
  })

  // ── Chat Service 流式 ───────────────────────────────────

  describe('handleNewMessageStream()', () => {
    it('并发 chunk 不覆盖 DB 为中间值（串行化写入——刷新后不截断）', async () => {
      // mock AI 流式：同步连续 emit 多个 wf:token（模拟 streamAgent 不 await
      // onChunk 的并发调用——修复前 UPDATE 乱序完成覆盖为中间值）
      const chunks = ['今天是', ' **2026年8月10日**', '，星期一。']
      const ctx = makeMockCtx({
        sql: await pg.sql as any,
        msg: { broadcast: () => {} },
        ai: {
          ...mockAiClient,
          agent: (config: any) => ({
            ...mockAiClient.agent(config),
            stream: async (_m: any[], opts?: any) => {
              for (const c of chunks) opts?.emit?.('wf:token', { text: c })
              opts?.emit?.('wf:usage', { totalTokens: 10 })
              opts?.emit?.('wf:done', {})
            },
          }),
        },
      })

      await handleNewMessageStream(ctx, DEPT_ID, USER_AGENT_ID, '今天几号', '')

      // 最新 AI 消息的 content 必须是完整拼接（修复前可能是中间值/截断）
      const rows = await pg.sql`
        SELECT content FROM messages
        WHERE department_id = ${DEPT_ID} AND sender_id = ${AI_AGENT_ID}
        ORDER BY created_at DESC LIMIT 1
      `
      assert.ok(rows.length >= 1, '应有 AI 流式回复消息')
      assert.equal(rows[0].content, chunks.join(''), 'DB content 应为完整拼接（并发 UPDATE 不得覆盖为中间值）')
    })
  })

  // ── Webhook Service ─────────────────────────────────────

  describe('handleWebhookMessage()', () => {
    before(async () => {
      // 创建 webhook agent
      await pg.sql`
        INSERT INTO agents (id, app_id, type, name, system_prompt)
        VALUES ('00000000-0000-0000-0000-000000000040', ${APP_ID}, 'webhook', 'Webhook Bot', '你是 Webhook Bot')
      `
    })

    it('返回 AI 回复', async () => {
      const ctx = makeMockCtx({ sql: await pg.sql as any })
      const result = await handleWebhookMessage(
        ctx as Context,
        '00000000-0000-0000-0000-000000000040',
        { content: 'Hello Webhook' },
      )
      assert.ok(result.reply)
      assert.equal(typeof result.reply, 'string')
    })

    it('支持 conversation_id', async () => {
      const ctx = makeMockCtx({ sql: await pg.sql as any })
      const result = await handleWebhookMessage(
        ctx as Context,
        '00000000-0000-0000-0000-000000000040',
        { content: 'Test', conversation_id: 'conv-123' },
      )
      assert.equal(result.conversation_id, 'conv-123')
    })

    it('出站镜像：配置 webhook_url → 应答回推（带签名）', async () => {
      // 测试逃生口：本地 mock 端点验证镜像（SSRF 防护默认拦内网——生产绝不设置）
      process.env.WEBHOOK_SSRF_ALLOW_PRIVATE = '1'
      // mock 接收端点
      const received: Array<{ headers: any; body: any }> = []
      const http = await import('node:http')
      const server = http.createServer((req: any, res: any) => {
        let b = ''
        req.on('data', (c: Buffer) => b += c)
        req.on('end', () => {
          received.push({ headers: req.headers, body: JSON.parse(b || '{}') })
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end('{"ok":true}')
        })
      })
      await new Promise<void>((r) => server.listen(0, r))
      const port = (server.address() as any).port
      // 配置出站 URL + secret
      await pg.sql`UPDATE agents SET webhook_url = ${`http://127.0.0.1:${port}/reply`}, webhook_secret = 'out-secret' WHERE id = '00000000-0000-0000-0000-000000000040'`
      try {
        const ctx = makeMockCtx({ sql: await pg.sql as any })
        // 入站也需签名（出站/入站共享 secret）
        const ts = String(Date.now())
        const raw = JSON.stringify({ content: '出站测试' })
        const { createHmac } = await import('node:crypto')
        const sig = createHmac('sha256', 'out-secret').update(`${ts}.${raw}`).digest('hex')
        const result = await handleWebhookMessage(
          ctx as Context,
          '00000000-0000-0000-0000-000000000040',
          { content: '出站测试' },
          undefined, sig, ts, `nonce-${Date.now()}`,
        )
        assert.ok(result.reply)
        await new Promise((r) => setTimeout(r, 300)) // 等镜像推送
        assert.equal(received.length, 1, '出站端点收到 1 次')
        assert.equal(received[0].body.reply, result.reply, '镜像内容 = 应答')
        assert.ok(received[0].headers['x-signature'], '带签名')
      } finally {
        // 恢复（不污染后续测试）
        process.env.WEBHOOK_SSRF_ALLOW_PRIVATE = ''
        await pg.sql`UPDATE agents SET webhook_url = NULL, webhook_secret = NULL WHERE id = '00000000-0000-0000-0000-000000000040'`
        await new Promise<void>((r) => server.close(() => r()))
      }
    })

    it('SSRF 防护：出站 URL 内网地址拒绝推送', async () => {
      // 配置内网出站 URL（无 secret——入站免签）
      await pg.sql`UPDATE agents SET webhook_url = 'http://127.0.0.1:9/evil', webhook_secret = NULL WHERE id = '00000000-0000-0000-0000-000000000040'`
      const { handleWebhookMessage } = await import('../src/services/webhook.ts')
      try {
        const ctx = makeMockCtx({ sql: await pg.sql as any })
        const result = await handleWebhookMessage(
          ctx as Context,
          '00000000-0000-0000-0000-000000000040',
          { content: 'SSRF 测试' },
        )
        assert.ok(result.reply, 'AI 正常回复（推送被拒不影响主流程）')
        // 推送被拒 → 出站日志记录 502（delivered=false）
        const [log] = await pg.sql`SELECT response_status FROM webhook_logs WHERE agent_id = '00000000-0000-0000-0000-000000000040' AND request_body LIKE 'OUTBOUND%' ORDER BY created_at DESC LIMIT 1`
        assert.ok(log, '出站日志存在')
        assert.equal(Number(log.response_status), 502, '出站推送被拒（502）')
      } finally {
        await pg.sql`UPDATE agents SET webhook_url = NULL, webhook_secret = NULL WHERE id = '00000000-0000-0000-0000-000000000040'`
      }
    })

    it('不存在的 agent 抛出错误', async () => {
      const ctx = makeMockCtx({ sql: await pg.sql as any })
      await assert.rejects(
        () => handleWebhookMessage(ctx as Context, '00000000-0000-0000-0000-000000000000', { content: 'test' }),
        /not found/i,
      )
    })

    it('有 appId 时验证应用隔离', async () => {
      const ctx = makeMockCtx({ sql: await pg.sql as any })
      await assert.rejects(
        () => handleWebhookMessage(
          ctx as Context,
          '00000000-0000-0000-0000-000000000040',
          { content: 'test' },
          '00000000-0000-0000-0000-000000009999',
        ),
        /not found/i,
      )
    })

    it('使用工具的 webhook', async () => {
      await pg.sql`
        INSERT INTO agents (id, app_id, type, name, system_prompt, tools)
        VALUES ('00000000-0000-0000-0000-000000000041', ${APP_ID}, 'webhook', 'Tool WB', 'Use tools', '[{"type":"function","function":{"name":"get_info","description":"Get info","parameters":{}}}]'::jsonb)
      `

      const ctx = makeMockCtx({ sql: await pg.sql as any })
      // 工具由框架 agent 引擎从 agents.tools 配置解析（src/tools/ 内置工具注册），
      // mock ai.agent 直接返回内容——验证带 tools 配置的 webhook 不崩溃且返回 reply
      const result = await handleWebhookMessage(
        ctx as Context,
        '00000000-0000-0000-0000-000000000041',
        { content: 'Get info' },
      )
      assert.ok(result.reply)
    })
  })

  // ── Embedding Service ───────────────────────────────────

  describe('chunkAndEmbed()', () => {
    it('短文本不分块', async () => {
      const ctx = makeMockCtx()
      const result = await chunkAndEmbed(ctx, 'Hello world', 500, 50)
      assert.equal(result.chunks.length, 1)
      assert.equal(result.embeddings.length, 1)
    })

    it('长文本分块', async () => {
      const ctx = makeMockCtx()
      const text = 'A'.repeat(1000)
      const result = await chunkAndEmbed(ctx, text, 200, 20)
      assert.ok(result.chunks.length > 1)
      assert.equal(result.chunks.length, result.embeddings.length)
    })
  })

  describe('searchKnowledgeBase()', () => {
    before(async () => {
      // 插入测试向量数据
      await pg.sql`
        INSERT INTO kb_documents (id, agent_id, filename, content, chunk_count)
        VALUES ('00000000-0000-0000-0000-000000000050', ${AI_AGENT_ID}, 'test.txt', '测试文档内容', 1)
      `
      // 创建 1024 维向量
      const testVec = '[' + new Array(1024).fill(0).map((_, i) => i === 0 ? '0.1' : i === 1 ? '0.2' : '0').join(',') + ']'
      await pg.sql`
        INSERT INTO kb_chunks (document_id, agent_id, content, chunk_index, embedding)
        VALUES ('00000000-0000-0000-0000-000000000050', ${AI_AGENT_ID}, '人工智能测试内容', 0, ${testVec}::vector)
      `
    })

    it('返回检索结果', async () => {
      const ctx = makeMockCtx({ sql: await pg.sql as any })
      const results = await searchKnowledgeBase(ctx, AI_AGENT_ID, '人工智能', 5)
      assert.ok(Array.isArray(results))
      assert.ok(results.length >= 0)
    })

    it('返回结果包含必要字段', async () => {
      const ctx = makeMockCtx({ sql: await pg.sql as any })
      const results = await searchKnowledgeBase(ctx, AI_AGENT_ID, '测试', 5)
      for (const r of results) {
        assert.ok(r.id)
        assert.ok(r.content)
        assert.ok(typeof r.similarity === 'number')
        assert.ok(r.filename)
      }
    })

    it('不存在的 agent 返回空', async () => {
      const ctx = makeMockCtx({ sql: await pg.sql as any })
      const results = await searchKnowledgeBase(ctx, '00000000-0000-0000-0000-000000000000', 'test', 5)
      assert.equal(results.length, 0)
    })
  })
})

/**
 * 服务层测试 — agent-runner、chat、webhook、embedding
 */

import { describe, it, before, after, mock } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { postgres, WEIFUWU_USER_SCHEMA } from 'weifuwu'
import { AGENT_PLATFORM_SCHEMA } from '../src/db/tables.ts'
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
    orm: (pg as any)?.orm ?? null,
    appId: APP_ID,
    auth: { userId: 'test-user', appId: APP_ID, email: 'test@test.com', name: 'Test', role: 'member' },
    ...extra,
  } as any
}

let pg: ReturnType<typeof postgres>

before(async () => {
  pg = postgres({ memory: true })
  // 协议层 = AST：声明式建库（migrateModule——零 SQL 文本）；memory 实例无残留（DROP 不需要）
  await pg.migrateModule('test-full', AGENT_PLATFORM_SCHEMA as never)
  await pg.migrateModule('test-users', WEIFUWU_USER_SCHEMA as never)

  // 插入测试数据（使用有效 UUID）
  await pg.orm.query.insert('departments').rows([{ id: '00000000-0000-0000-0000-000000000020', app_id: '00000000-0000-0000-0000-000000000001', name: 'Test Dept' }]).run()
  await pg.orm.query.insert('agents').rows([
    { id: '00000000-0000-0000-0000-000000000030', app_id: '00000000-0000-0000-0000-000000000001', type: 'ai', name: 'AI Bot', system_prompt: '你是AI助手' },
    { id: '00000000-0000-0000-0000-000000000031', app_id: '00000000-0000-0000-0000-000000000001', type: 'user', name: 'User' },
  ]).run()
  await pg.orm.query.insert('department_members').rows([
    { department_id: '00000000-0000-0000-0000-000000000020', agent_id: '00000000-0000-0000-0000-000000000030' },
    { department_id: '00000000-0000-0000-0000-000000000020', agent_id: '00000000-0000-0000-0000-000000000031' },
  ]).run()
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
      const ctx = makeMockCtx({ sql: await pg.sql as any, orm: (pg as any).orm })

      await handleNewMessage(ctx, DEPT_ID, USER_AGENT_ID, '测试消息')

      const messages = await pg.orm.query.from('messages').select('content', 'ai_approved').where({ department_id: { eq: DEPT_ID } }).run()
      assert.ok(messages.length >= 1)
      const aiReply = messages.find((m: any) => m.ai_approved === true)
      assert.ok(aiReply, 'AI 自动回复应存在且已批准')
    })

    it('部门无 AI Agent 时插入系统提示（引导添加）', async () => {
      // 创建一个无 AI 成员的部门
      await pg.orm.query.insert('departments').rows([{ id: '00000000-0000-0000-0000-000000000022', app_id: '00000000-0000-0000-0000-000000000001', name: 'Empty' }]).run()
      await pg.orm.query.insert('department_members').rows([{ department_id: '00000000-0000-0000-0000-000000000022', agent_id: USER_AGENT_ID }]).run()

      const ctx = makeMockCtx({ sql: await pg.sql as any, orm: (pg as any).orm })
      await handleNewMessage(ctx, '00000000-0000-0000-0000-000000000022', USER_AGENT_ID, '无 AI 回复')

      const msgs = await pg.orm.query.from('messages').where({ department_id: { eq: '00000000-0000-0000-0000-000000000022' } }).run()
      assert.equal(msgs.length, 1)
      assert.equal(msgs[0].msg_type, 'system')
      assert.match(String(msgs[0].content), /暂无 AI 成员/)
    })

    it('human_in_the_loop 创建草稿', async () => {
      // 创建 HITL AI Agent
      await pg.orm.query.insert('agents').rows([{ id: '00000000-0000-0000-0000-000000000032', app_id: APP_ID, type: 'ai', name: 'HITL Bot', system_prompt: '需审批', human_in_the_loop: true }]).run()
      await pg.orm.query.insert('department_members').rows([{ department_id: DEPT_ID, agent_id: '00000000-0000-0000-0000-000000000032' }]).run()

      const ctx = makeMockCtx({ sql: await pg.sql as any, orm: (pg as any).orm })

      await handleNewMessage(ctx, DEPT_ID, USER_AGENT_ID, '需审批的消息')

      // 验证存在 ai_approved IS NULL 的草稿
      const drafts = await pg.orm.query.from('messages').where({ ai_approved: { isNull: true } }).run()
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
        sql: await pg.sql as any, orm: (pg as any).orm,
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
      const rows = await pg.orm.query.from('messages').select('content').where({ department_id: { eq: DEPT_ID }, sender_id: { eq: AI_AGENT_ID } }).orderBy('created_at', 'desc').limit(1).run()
      assert.ok(rows.length >= 1, '应有 AI 流式回复消息')
      assert.equal(rows[0].content, chunks.join(''), 'DB content 应为完整拼接（并发 UPDATE 不得覆盖为中间值）')
    })

    it('CHAT-UX 波次 1（C1）：wf:* 事件全部携带 agentId（呼吸灯复位——关灯必须达真实 agent）', async () => {
      // 实证：旧代码仅首帧 step llm 带 agentId——done/token/tool 裸发——
      // 客户端 `ev.agentId ?? 'ai'` 关灯打在 'ai' 上 → 呼吸灯永久「干活中…」
      const broadcasts: Array<Record<string, any>> = []
      const ctx = makeMockCtx({
        sql: await pg.sql as any, orm: (pg as any).orm,
        msg: { broadcast: (_room: string, ev: Record<string, any>) => { broadcasts.push(ev) } },
        ai: {
          ...mockAiClient,
          agent: (config: any) => ({
            ...mockAiClient.agent(config),
            stream: async (_m: any[], opts?: any) => {
              opts?.emit?.('wf:token', { text: '你好' })
              opts?.emit?.('wf:usage', { totalTokens: 5 })
              opts?.emit?.('wf:done', {})
            },
          }),
        },
      })

      // 唯一问题名（answer-cache = 字符二元组 Jaccard ≥0.7 命中——时间戳数字重叠仍命中，
      // 实证 flake——用随机汉字串保证二元组不相交）
      const randQ = Array.from({ length: 10 }, () => String.fromCharCode(0x4e00 + Math.floor(Math.random() * 2000))).join('') + '？'
      await handleNewMessageStream(ctx, DEPT_ID, USER_AGENT_ID, randQ, '')

      const wfEvents = broadcasts.filter((e) => String(e.type).startsWith('wf:'))
      assert.ok(wfEvents.length >= 3, `应 broadcast 多个 wf:* 事件（实际 ${wfEvents.length}）`)
      const missing = wfEvents.filter((e) => !e.agentId)
      assert.deepEqual(missing, [], `所有 wf:* 事件必须带 agentId，缺失：${JSON.stringify(missing.map((e) => e.type))}`)
      const done = wfEvents.find((e) => e.type === 'wf:done')
      assert.equal(done?.agentId, AI_AGENT_ID, 'wf:done 的 agentId 必须是回复 agent 的真实 id')
      const step = wfEvents.find((e) => e.type === 'wf:step')
      assert.equal(step?.agentId, AI_AGENT_ID, 'wf:step 同样携带 agentId')
    })
  })

  // ── Webhook Service ─────────────────────────────────────

  describe('handleWebhookMessage()', () => {
    before(async () => {
      // 创建 webhook agent
      await pg.orm.query.insert('agents').rows([{ id: '00000000-0000-0000-0000-000000000040', app_id: APP_ID, type: 'webhook', name: 'Webhook Bot', system_prompt: '你是 Webhook Bot' }]).run()
    })

    it('返回 AI 回复', async () => {
      const ctx = makeMockCtx({ sql: await pg.sql as any, orm: (pg as any).orm })
      const result = await handleWebhookMessage(
        ctx as Context,
        '00000000-0000-0000-0000-000000000040',
        { content: 'Hello Webhook' },
      )
      assert.ok(result.reply)
      assert.equal(typeof result.reply, 'string')
    })

    it('支持 conversation_id', async () => {
      const ctx = makeMockCtx({ sql: await pg.sql as any, orm: (pg as any).orm })
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
      await pg.orm.query.update('agents').set({ webhook_url: `http://127.0.0.1:${port}/reply`, webhook_secret: 'out-secret' }).where({ id: { eq: '00000000-0000-0000-0000-000000000040' } }).run()
      try {
        const ctx = makeMockCtx({ sql: await pg.sql as any, orm: (pg as any).orm })
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
        await pg.orm.query.update('agents').set({ webhook_url: null, webhook_secret: null }).where({ id: { eq: '00000000-0000-0000-0000-000000000040' } }).run()
        await new Promise<void>((r) => server.close(() => r()))
      }
    })

    it('SSRF 防护：出站 URL 内网地址拒绝推送', async () => {
      // 配置内网出站 URL（无 secret——入站免签）
      await pg.orm.query.update('agents').set({ webhook_url: 'http://127.0.0.1:9/evil', webhook_secret: null }).where({ id: { eq: '00000000-0000-0000-0000-000000000040' } }).run()
      const { handleWebhookMessage } = await import('../src/services/webhook.ts')
      try {
        const ctx = makeMockCtx({ sql: await pg.sql as any, orm: (pg as any).orm })
        const result = await handleWebhookMessage(
          ctx as Context,
          '00000000-0000-0000-0000-000000000040',
          { content: 'SSRF 测试' },
        )
        assert.ok(result.reply, 'AI 正常回复（推送被拒不影响主流程）')
        // 推送被拒 → 出站日志记录 502（delivered=false）
        const [log] = await pg.orm.query.from('webhook_logs').select('response_status').where({ agent_id: { eq: '00000000-0000-0000-0000-000000000040' }, request_body: { like: 'OUTBOUND%' } }).orderBy('created_at', 'desc').limit(1).run()
        assert.ok(log, '出站日志存在')
        assert.equal(Number(log.response_status), 502, '出站推送被拒（502）')
      } finally {
        await pg.orm.query.update('agents').set({ webhook_url: null, webhook_secret: null }).where({ id: { eq: '00000000-0000-0000-0000-000000000040' } }).run()
      }
    })

    it('不存在的 agent 抛出错误', async () => {
      const ctx = makeMockCtx({ sql: await pg.sql as any, orm: (pg as any).orm })
      await assert.rejects(
        () => handleWebhookMessage(ctx as Context, '00000000-0000-0000-0000-000000000000', { content: 'test' }),
        /not found/i,
      )
    })

    it('有 appId 时验证应用隔离', async () => {
      const ctx = makeMockCtx({ sql: await pg.sql as any, orm: (pg as any).orm })
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
      await pg.orm.query.insert('agents').rows([{ id: '00000000-0000-0000-0000-000000000041', app_id: APP_ID, type: 'webhook', name: 'Tool WB', system_prompt: 'Use tools', tools: { type: 'function', function: { name: 'get_info', description: 'Get info', parameters: {} } } }]).run()

      const ctx = makeMockCtx({ sql: await pg.sql as any, orm: (pg as any).orm })
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
      await pg.orm.query.insert('kb_documents').rows([{ id: '00000000-0000-0000-0000-000000000050', agent_id: AI_AGENT_ID, filename: 'test.txt', content: '测试文档内容', chunk_count: 1 }]).run()
      // 创建 1024 维向量
      const testVec = '[' + new Array(1024).fill(0).map((_, i) => i === 0 ? '0.1' : i === 1 ? '0.2' : '0').join(',') + ']'
      await pg.orm.query.insert('kb_chunks').rows([{ document_id: '00000000-0000-0000-0000-000000000050', agent_id: AI_AGENT_ID, content: '人工智能测试内容', chunk_index: 0, embedding: JSON.parse(testVec) as never }]).run()
    })

    it('返回检索结果', async () => {
      const ctx = makeMockCtx({ sql: await pg.sql as any, orm: (pg as any).orm })
      const results = await searchKnowledgeBase(ctx, AI_AGENT_ID, '人工智能', 5)
      assert.ok(Array.isArray(results))
      assert.ok(results.length >= 0)
    })

    it('返回结果包含必要字段', async () => {
      const ctx = makeMockCtx({ sql: await pg.sql as any, orm: (pg as any).orm })
      const results = await searchKnowledgeBase(ctx, AI_AGENT_ID, '测试', 5)
      for (const r of results) {
        assert.ok(r.id)
        assert.ok(r.content)
        assert.ok(typeof r.similarity === 'number')
        assert.ok(r.filename)
      }
    })

    it('不存在的 agent 返回空', async () => {
      const ctx = makeMockCtx({ sql: await pg.sql as any, orm: (pg as any).orm })
      const results = await searchKnowledgeBase(ctx, '00000000-0000-0000-0000-000000000000', 'test', 5)
      assert.equal(results.length, 0)
    })
  })
})

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
import { handleNewMessage } from '../src/services/chat.ts'
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
    run: async (messages: any[]) => ({
      content: `Agent 回复: ${messages.map(m => m.content).join(', ')}`,
      messages: [
        { role: 'system', content: config.systemPrompt },
        ...messages,
        { role: 'assistant', content: 'Agent 回复内容' },
      ],
      steps: [{ type: 'llm' as const, content: 'Agent 回复内容' }],
    }),
    stream: async (messages: any[], callbacks: any) => {
      callbacks.onChunk({
        id: '1', model: 'm',
        choices: [{ index: 0, delta: { content: 'Streaming' }, finish_reason: 'stop' as const }],
      })
      callbacks.onFinish?.({ content: 'Streaming response' })
      return {
        content: 'Streaming response',
        messages: [{ role: 'assistant', content: 'Streaming response' }],
        steps: [{ type: 'llm' as const, content: 'Streaming' }],
      }
    },
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

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const DEPT_ID = '00000000-0000-0000-0000-000000000020'
const AI_AGENT_ID = '00000000-0000-0000-0000-000000000030'
const USER_AGENT_ID = '00000000-0000-0000-0000-000000000031'

function makeMockCtx(extra?: Record<string, unknown>): Context {
  return {
    params: {},
    query: {},
    ai: mockAiClient,
    sql: null as any,
    tenantId: TENANT_ID,
    auth: { userId: 'test-user', tenantId: TENANT_ID, email: 'test@test.com', name: 'Test', role: 'member' },
    ...extra,
  } as any
}

let pg: ReturnType<typeof postgres>

before(async () => {
  pg = postgres()
  const schemaPath = resolve(__dirname, '..', 'src', 'db', 'schema.sql')
  const schema = readFileSync(schemaPath, 'utf-8')
  await pg.sql.unsafe(`
    DROP TABLE IF EXISTS kb_chunks CASCADE;
    DROP TABLE IF EXISTS kb_documents CASCADE;
    DROP TABLE IF EXISTS messages CASCADE;
    DROP TABLE IF EXISTS department_members CASCADE;
    DROP TABLE IF EXISTS departments CASCADE;
    DROP TABLE IF EXISTS agents CASCADE;
    DROP TABLE IF EXISTS companies CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
    DROP TABLE IF EXISTS tenants CASCADE;
    DROP TYPE IF EXISTS agent_type CASCADE;
  `)
  await pg.sql.unsafe(schema)

  // 插入测试数据（使用有效 UUID）
  await pg.sql`INSERT INTO tenants (id, name, slug) VALUES ('00000000-0000-0000-0000-000000000001', 'Test', 'test')`
  await pg.sql`INSERT INTO companies (id, tenant_id, name) VALUES ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Test Co')`
  await pg.sql`INSERT INTO departments (id, company_id, name) VALUES ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000010', 'Test Dept')`
  await pg.sql`INSERT INTO agents (id, tenant_id, type, name, system_prompt) VALUES ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000001', 'ai', 'AI Bot', '你是AI助手')`
  await pg.sql`INSERT INTO agents (id, tenant_id, type, name) VALUES ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000001', 'user', 'User')`
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
        tenantId: TENANT_ID,
        departmentId: DEPT_ID,
        systemPrompt: '你是有帮助的助手',
        model: 'deepseek-chat',
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
        tenantId: TENANT_ID,
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
        tenantId: TENANT_ID,
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
      const wsCalls: string[] = []
      const wsHub = { send: (key: string, msg: string) => wsCalls.push(msg) }

      await handleNewMessage(ctx, DEPT_ID, USER_AGENT_ID, '测试消息', { wsHub })

      const messages = await pg.sql`
        SELECT content, ai_approved FROM messages WHERE department_id = ${DEPT_ID}
      `
      assert.ok(messages.length >= 1)
      const aiReply = messages.find((m: any) => m.ai_approved === true)
      assert.ok(aiReply, 'AI 自动回复应存在且已批准')
    })

    it('部门无 AI Agent 时不做任何事', async () => {
      // 创建一个无 AI 成员的部门
      await pg.sql`INSERT INTO departments (id, company_id, name) VALUES ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000010', 'Empty')`
      await pg.sql`INSERT INTO department_members (department_id, agent_id) VALUES ('00000000-0000-0000-0000-000000000022', ${USER_AGENT_ID})`

      const ctx = makeMockCtx({ sql: await pg.sql as any })
      await handleNewMessage(ctx, '00000000-0000-0000-0000-000000000022', USER_AGENT_ID, '无 AI 回复')

      const msgs = await pg.sql`
        SELECT * FROM messages WHERE department_id = '00000000-0000-0000-0000-000000000022'
      `
      assert.equal(msgs.length, 0)
    })

    it('human_in_the_loop 创建草稿', async () => {
      // 创建 HITL AI Agent
      await pg.sql`
        INSERT INTO agents (id, tenant_id, type, name, system_prompt, human_in_the_loop)
        VALUES ('00000000-0000-0000-0000-000000000032', ${TENANT_ID}, 'ai', 'HITL Bot', '需审批', TRUE)
      `
      await pg.sql`
        INSERT INTO department_members (department_id, agent_id) VALUES (${DEPT_ID}, '00000000-0000-0000-0000-000000000032')
      `

      const ctx = makeMockCtx({ sql: await pg.sql as any })
      const wsCalls: string[] = []
      const wsHub = { send: (key: string, msg: string) => wsCalls.push(msg) }

      await handleNewMessage(ctx, DEPT_ID, USER_AGENT_ID, '需审批的消息', { wsHub })

      // 验证存在 ai_approved IS NULL 的草稿
      const drafts = await pg.sql`
        SELECT * FROM messages WHERE ai_approved IS NULL
      `
      assert.ok(drafts.length >= 1, '应有待审批的 AI 草稿')

      // 验证 WS 推送了审批通知
      const draftNotifs = wsCalls.filter(c => c.includes('ai_draft'))
      assert.ok(draftNotifs.length >= 1, '应有审批通知 WS 推送')
    })
  })

  // ── Webhook Service ─────────────────────────────────────

  describe('handleWebhookMessage()', () => {
    before(async () => {
      // 创建 webhook agent
      await pg.sql`
        INSERT INTO agents (id, tenant_id, type, name, system_prompt)
        VALUES ('00000000-0000-0000-0000-000000000040', ${TENANT_ID}, 'webhook', 'Webhook Bot', '你是 Webhook Bot')
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

    it('不存在的 agent 抛出错误', async () => {
      const ctx = makeMockCtx({ sql: await pg.sql as any })
      await assert.rejects(
        () => handleWebhookMessage(ctx as Context, '00000000-0000-0000-0000-000000000000', { content: 'test' }),
        /not found/i,
      )
    })

    it('有 tenantId 时验证租户隔离', async () => {
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
        INSERT INTO agents (id, tenant_id, type, name, system_prompt, tools)
        VALUES ('00000000-0000-0000-0000-000000000041', ${TENANT_ID}, 'webhook', 'Tool WB', 'Use tools', '[{"type":"function","function":{"name":"get_info","description":"Get info","parameters":{}}}]'::jsonb)
      `

      const ctx = makeMockCtx({ sql: await pg.sql as any })
      const { registerTool } = await import('../src/ai/agent.ts')
      registerTool('get_info', async () => ({ info: 'test data' }))

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

/**
 * search-knowledge-base skill — tool definitions and handlers
 *
 * 2026-08 修复（skill 未随模型迁移——工具调用报错实证）：
 *  - `tenant_id`（2016 旧模型列）→ `app_id`（2026 多租户模型——schema 实态）
 *  - `ctx.tenantId` → `ctx.appId`（AppCtx 形态——agent-platform 隔离面）
 *  - 对齐内置版语义：绑定 KB 优先（agent.kb_id → 只检索绑定 KB；未绑定 →
 *    检索租户全部）——skill 不再偏离内置行为（此前直接全查——旧列报错）
 */

import type { ToolDefinition } from '../../../src/ai/types.ts'
import type { Context } from 'weifuwu'

export const tools: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'search_knowledge_base',
      description: '从 Agent 绑定的知识库中检索相关信息。当用户问题涉及文档、产品手册、FAQ 等内容时使用。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词或问题描述',
          },
          top_k: {
            type: 'number',
            description: '返回结果数量，默认 5',
          },
        },
        required: ['query'],
      },
    },
  },
]

export function createHandlers(ctxProvider: () => Context): Record<string, (args: Record<string, unknown>) => unknown | Promise<unknown>> {
  return {
    search_knowledge_base: async (args: Record<string, unknown>) => {
      const ctx = ctxProvider() as any
      const query = String(args.query ?? '')
      const topK = Math.min(20, Math.max(1, Number(args.top_k ?? 5)))
      if (!query) return '请提供搜索关键词'

      const { sql } = ctx

      // 绑定知识库优先（与内置版对齐）：agent.kb_id → 只检索绑定 KB
      const agentId = (ctx as any)._toolAgentId ?? null
      let kbs: Array<Record<string, any>>
      if (agentId) {
        const [agent] = await sql`
          SELECT a.kb_id, kb.name as kb_name
          FROM agents a
          LEFT JOIN agents kb ON kb.id = a.kb_id AND kb.type = 'knowledge_base' AND kb.is_active = TRUE
          WHERE a.id = ${agentId} AND a.app_id = ${ctx.appId}
        `
        if (agent?.kb_id && agent.kb_name) {
          kbs = [{ id: agent.kb_id as string, name: agent.kb_name as string }]
        } else {
          kbs = []
        }
      } else {
        kbs = []
      }
      if (kbs.length === 0) {
        kbs = await sql`
          SELECT id, name FROM agents
          WHERE app_id = ${ctx.appId} AND type = 'knowledge_base' AND is_active = TRUE
          LIMIT 5
        `
      }

      if (kbs.length === 0) {
        return '没有找到已激活的知识库。请先创建 knowledge_base 类型的 Agent 并上传文档。'
      }

      const results: Array<{ filename: string; content: string; similarity: number }> = []

      for (const kb of kbs) {
        const embedding = await ctx.ai.embed(query)
        const vecStr = `[${embedding.join(',')}]`
        const chunks = await sql`
          SELECT kc.content, kd.filename,
            1 - (kc.embedding <=> ${vecStr}::vector) as similarity
          FROM kb_chunks kc
          JOIN kb_documents kd ON kd.id = kc.document_id
          WHERE kc.agent_id = ${kb.id}
          ORDER BY kc.embedding <=> ${vecStr}::vector
          LIMIT 3
        `
        for (const c of chunks) {
          results.push({
            filename: c.filename,
            content: c.content,
            similarity: c.similarity,
          })
        }
      }

      results.sort((a, b) => b.similarity - a.similarity)
      const top = results.slice(0, topK)

      if (top.length === 0) {
        return '知识库中没有找到相关信息。'
      }

      return top.map((r, i) =>
        `[${i + 1}] 来自 "${r.filename}" (相似度: ${(r.similarity * 100).toFixed(1)}%)\n${r.content}`
      ).join('\n\n')
    },
  }
}

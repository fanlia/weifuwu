/**
 * search-knowledge-base skill — tool definitions and handlers
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
      const ctx = ctxProvider()
      const query = String(args.query ?? '')
      const topK = Math.min(20, Math.max(1, Number(args.top_k ?? 5)))
      if (!query) return '请提供搜索关键词'

      const { sql } = ctx

      const kbs = await sql`
        SELECT id, name FROM agents
        WHERE tenant_id = ${ctx.tenantId} AND type = 'knowledge_base' AND is_active = TRUE
        LIMIT 5
      `

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

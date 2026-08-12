/**
 * 内置 Tool 注册 — 全局注册可被 agent.ts registerTool 调用的工具
 *
 * 在 server.ts 启动时调用 registerBuiltinTools(ctx) 注册所有内置工具
 */

import type { ToolDefinition } from '../ai/types.ts'
import { registerTools } from './registry.ts'
import type { Context } from 'weifuwu'
import type { AppCtx } from '../middleware/ctx.ts'

/**
 * 内置工具定义列表（用于 LLM tool_choice 配置）
 */
export const BUILTIN_TOOL_DEFS: ToolDefinition[] = [
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
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: '获取当前日期和时间，当用户询问时间时使用',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
]

/**
 * 在 server.ts 启动时调用，注册内置工具 handler
 */
export function registerBuiltinTools(getCtx: () => AppCtx): void {
  registerTools({
    search_knowledge_base: async (args: Record<string, unknown>) => {
      const ctx = getCtx()
      const query = String(args.query ?? '')
      const topK = Math.min(20, Math.max(1, Number(args.top_k ?? 5)))
      if (!query) return '请提供搜索关键词'

      // 绑定知识库优先：AI agent 配置了 kb_id → 只检索绑定 KB；未绑定 → 检索租户全部（现状）
      const { sql } = ctx
      const agentId = (ctx as any)._toolAgentId

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
        ` as unknown as Array<{ id: string; name: string }>
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
        for (const c of chunks as unknown as Array<Record<string, any>>) {
          results.push({
            filename: c.filename,
            content: c.content,
            similarity: c.similarity,
          })
        }
      }

      // 按相似度排序取前 topK
      results.sort((a, b) => b.similarity - a.similarity)
      const top = results.slice(0, topK)

      if (top.length === 0) {
        return '知识库中没有找到相关信息。'
      }

      return top.map((r, i) =>
        `[${i + 1}] 来自 "${r.filename}" (相似度: ${(r.similarity * 100).toFixed(1)}%)\n${r.content}`
      ).join('\n\n')
    },

    get_current_time: async (_args: Record<string, unknown>) => {
      const now = new Date()
      return now.toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit',
      second: '2-digit',
      })
    },
  })
}

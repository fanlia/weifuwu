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
      // B6（2026-08）：单实现源——skill 版 handler 委托 kb-search（与内置版共用——
      // 此前双份实现漂移实证：skill 版用 tenant_id 旧列——工具报错——AI 检索全失败）
      const ctx = ctxProvider() as any
      const query = String(args.query ?? '')
      const topK = Math.min(20, Math.max(1, Number(args.top_k ?? 5)))
      if (!query) return '请提供搜索关键词'
      const { searchKnowledgeBase } = await import('../../../src/services/kb-search.ts')
      return searchKnowledgeBase(ctx, query, topK)
    },
  }
}

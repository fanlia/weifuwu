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
  {
    type: 'function',
    function: {
      name: 'call_agent',
      description: '调用同租户的另一个 AI Agent 处理任务（传入其名称或 ID + 任务描述），返回该 Agent 的回复。用于专业分工：把子任务委托给擅长该领域的 Agent（如数据分析/客服）。',
      parameters: {
        type: 'object',
        properties: {
          agent: { type: 'string', description: '目标 Agent 名称或 ID（同租户的 ai 类型 Agent）' },
          message: { type: 'string', description: '委托给该 Agent 的任务描述' },
        },
        required: ['agent', 'message'],
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

    call_agent: async (args: Record<string, unknown>) => {
      const ctx = getCtx()
      const target = String(args.agent ?? '')
      const message = String(args.message ?? '')
      if (!target || !message) return 'Error: call_agent 需要 agent 和 message 参数'
      // 深度限制（防环：A→B→A 或过深链）
      const depth = Number((ctx as any)._agentDepth ?? 0)
      const MAX_DEPTH = 2
      if (depth >= MAX_DEPTH) return `Error: Agent 协作深度超限（最多 ${MAX_DEPTH} 层）——请直接回答而非继续委托`
      // 找目标 Agent（同租户 + ai 类型 + 激活；名称或 ID）
      const [targetAgent] = await ctx.sql`
        SELECT * FROM agents
        WHERE (name = ${target} OR id::text = ${target}) AND app_id = ${ctx.appId}
          AND type = 'ai' AND is_active = TRUE
      `
      if (!targetAgent) return `Error: 找不到可调用的 AI Agent「${target}」（需同租户且已激活）`
      const ta = targetAgent as any
      if (String(ta.id) === String((ctx as any)._toolAgentId ?? '')) return 'Error: 不能调用自己（循环）'
      // 委托给子 Agent：复用 runAgent（其自身工具/知识库/协作全可用——递归）
      const { runAgent } = await import('../services/agent-runner.ts')
      ;(ctx as any)._agentDepth = depth + 1
      try {
        const result = await runAgent(ctx, {
          agentId: String(ta.id),
          appId: ctx.appId,
          departmentId: String((ctx as any)._toolDepartmentId ?? ''),
          systemPrompt: String(ta.system_prompt ?? '你是一个 AI 助手'),
          model: ta.model ? String(ta.model) : undefined,
          tools: (ta.tools ?? []) as unknown[],
          maxSteps: 3,
          humanInTheLoop: !!ta.human_in_the_loop,
          workspacePath: ta.workspace_path ? String(ta.workspace_path) : undefined,
          allowFileTools: !!ta.allow_file_tools,
          allowCommandExec: !!ta.allow_command_exec,
          allowNetwork: !!ta.allow_network,
        }, [{ role: 'user', content: message }])
        return `[${String(ta.name)} 的回复]\n${result.content}`
      } catch (e) {
        return `Error: 调用 Agent「${String(ta.name)}」失败: ${(e as Error)?.message ?? '未知错误'}`
      } finally {
        ;(ctx as any)._agentDepth = depth // 恢复（同 Agent 多次调用互不影响）
      }
    },
  })
}
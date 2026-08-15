/**
 * Agent 路由 — CRUD（4 种类型）
 */

import type { Router, Context } from 'weifuwu'
import type { AppCtx } from '../middleware/ctx.ts'
import { streamAgentPreview } from '../services/agent-runner.ts'

/** 内置工具定义（与 builtin.ts 同步） */
export const BUILTIN_TOOL_DEFS = [
  {
    type: 'function',
    function: {
      name: 'search_knowledge_base',
      description: '从 Agent 绑定的知识库中检索相关信息。当用户问题涉及文档、产品手册、FAQ 等内容时使用。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词或问题描述' },
          top_k: { type: 'number', description: '返回结果数量，默认 5' },
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
      parameters: { type: 'object', properties: {} },
    },
  },
]

/** 内置工具名称列表 */
const BUILTIN_TOOL_NAMES = BUILTIN_TOOL_DEFS.map(t => t.function.name)

export function registerAgentRoutes(app: Router<AppCtx>): void {
  // ── 获取内置工具列表 ──────────────────────────────────────

  app.get('/api/agents/builtin-tools', async (_req: Request, _ctx: AppCtx): Promise<Response> => {
    return Response.json({ tools: BUILTIN_TOOL_DEFS })
  })
  // ── 获取 Agent 列表 ──────────────────────────────────────

  app.get('/api/agents', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId } = ctx
    const url = new URL(req.url)
    const type = url.searchParams.get('type')
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10))
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)))

    const agents = await sql`
      SELECT
        id, type, name, avatar_url, description,
        model, system_prompt, temperature, max_tokens, human_in_the_loop,
        user_id, webhook_url, chunk_size, chunk_overlap,
        tools, is_active, created_at, updated_at,
        workspace_path, allow_file_tools, allow_command_exec, department_id
      FROM agents
      WHERE app_id = ${appId}
      ${type && ['ai', 'user', 'webhook', 'knowledge_base'].includes(type) ? sql`AND type = ${type}` : sql``}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    const [countResult] = await sql`
      SELECT COUNT(*)::int as total FROM agents
      WHERE app_id = ${appId}
      ${type && ['ai', 'user', 'webhook', 'knowledge_base'].includes(type) ? sql`AND type = ${type}` : sql``}
    `

    // 为每个 AI Agent 附加最近的 token 用量统计
    const agentsWithStats = []
    for (const a of agents) {
      if (a.type === 'ai') {
        const [tokenSum] = await sql`
          SELECT
            COALESCE(SUM(tokens_total), 0)::int as total_tokens,
            COALESCE(SUM(tokens_prompt), 0)::int as total_prompt,
            COALESCE(SUM(tokens_completion), 0)::int as total_completion,
            COUNT(*)::int as run_count
          FROM agent_logs
          WHERE agent_id = ${a.id}
        `
        agentsWithStats.push({ ...a, token_usage: tokenSum })
      } else {
        agentsWithStats.push(a)
      }
    }

    return Response.json({ agents: agentsWithStats, total: countResult.total })
  })

  // ── 创建 Agent ───────────────────────────────────────────

  app.post('/api/agents', async (req: Request, ctx: AppCtx): Promise<Response> => {
    // R4 权限：viewer 只读——不能建 Agent
    try {
      const { requireWriter } = await import('../services/permissions.ts')
      await requireWriter(ctx)
    } catch (e: any) {
      return Response.json({ error: e?.message ?? '无权操作' }, { status: e?.status ?? 403 })
    }
    const { sql, appId } = ctx
    const body = await req.json() as {
      type: string
      name: string
      description?: string
      avatar_url?: string
      // AI
      model?: string
      system_prompt?: string
      temperature?: number
      max_tokens?: number
      human_in_the_loop?: boolean
      tools?: unknown[]
      // User
      user_id?: string
      // Webhook
      webhook_url?: string
      kb_id?: string | null
      webhook_secret?: string
      webhook_retry_count?: number
      // Knowledge Base
      chunk_size?: number
      chunk_overlap?: number
      // Workspace
      workspace_path?: string
      allow_file_tools?: boolean
      allow_command_exec?: boolean
      // 组织层级（type='department' 部门经理）
      department_id?: string
      allow_network?: boolean
    }

    if (!body.type || !body.name) {
      return Response.json({ error: 'type 和 name 为必填' }, { status: 400 })
    }

    if (!['ai', 'user', 'webhook', 'knowledge_base', 'department'].includes(body.type)) {
      return Response.json({ error: 'type 必须是 ai/user/webhook/knowledge_base/department 之一' }, { status: 400 })
    }
    // user 类型仅允许注册/内部流程创建（绑定 user_id）——API 直调创建孤儿 user agent 防护
    if (body.type === 'user' && !body.user_id) {
      return Response.json({ error: 'user 类型必须绑定用户账号（由注册流程创建）' }, { status: 400 })
    }
    // 组织层级：department 类型 = 部门经理——绑定代表部门（同 app + 唯一：1 部门 1 经理）
    let managerPrompt: string | null = null
    if (body.type === 'department') {
      if (!body.department_id) {
        return Response.json({ error: '部门经理必须绑定部门（department_id）' }, { status: 400 })
      }
      const [dept] = await sql`
        SELECT id, name FROM departments WHERE id = ${body.department_id} AND app_id = ${appId}
      `
      if (!dept) return Response.json({ error: '绑定的部门不存在' }, { status: 404 })
      const [existing] = await sql`
        SELECT id FROM agents WHERE department_id = ${body.department_id} AND type = 'department' AND is_active = TRUE
      `
      if (existing) return Response.json({ error: '该部门已有经理（1 部门 1 经理）' }, { status: 409 })
      // 经理提示词：部门身份 + 成员名单（可经 call_agent 分派）——默认生成，可覆盖
      const members = await sql`
        SELECT a.name, a.type, a.description FROM department_members dm
        JOIN agents a ON a.id = dm.agent_id
        WHERE dm.department_id = ${body.department_id} AND a.type != 'user'
      `
      const memberNames = (members ?? [])
        .filter((m: any) => m.type === 'ai' || m.type === 'knowledge_base')
        .map((m: any) => `${m.name}${m.description ? `（${String(m.description).slice(0, 20)}）` : ''}`)
        .join('、')
      managerPrompt = body.system_prompt
        ?? `你是「${String(dept.name)}」的部门经理，代表该部门参与协作。

你的职责：
1. 作为部门代表回答与其他部门的协作请求
2. 需要部门成员实际干活时，用 call_agent 工具把任务分派给成员（一次一个成员）
3. 汇总成员结果后回复——你就是「${String(dept.name)}」的对外出口

部门成员：${memberNames || '（暂无 AI 成员——请先给部门添加 AI 能力）'}

任务完成后按以下结构汇报：
- ✅ 已完成：列出完成的事项
- ⚠️ 未完成：列出未完成的事项及原因（没有则省略）
- 📦 产物：生成的文件/结果位置（没有则省略）`
    }

    const [agent] = await sql`
      INSERT INTO agents (
        app_id, type, name, avatar_url, description,
        model, system_prompt, temperature, max_tokens, human_in_the_loop,
        user_id, webhook_url, webhook_secret, webhook_retry_count, chunk_size, chunk_overlap, tools,
        workspace_path, allow_file_tools, allow_command_exec, allow_network, kb_id, department_id
      ) VALUES (
        ${appId}, ${body.type}, ${body.name}, ${body.avatar_url ?? null}, ${body.description ?? null},
        ${body.model ?? null}, ${managerPrompt ?? body.system_prompt ?? null}, ${body.temperature ?? 0.7}, ${body.max_tokens ?? 2048}, ${body.human_in_the_loop ?? false},
        ${body.user_id ?? null}, ${body.webhook_url ?? null}, ${body.webhook_secret ?? null}, ${body.webhook_retry_count ?? 3}, ${body.chunk_size ?? 500}, ${body.chunk_overlap ?? 50},
        ${body.tools ? JSON.stringify(body.tools) : '[]'},
        ${body.workspace_path ?? null}, ${body.allow_file_tools ?? false}, ${body.allow_command_exec ?? false}, ${body.allow_network ?? false}, ${body.kb_id ?? null}, ${body.department_id ?? null}
      )
      RETURNING id, type, name, created_at
    `

    // 审计：Agent 创建（Wave 9）
    try {
      const { writeAudit } = await import('../services/audit.ts')
      await writeAudit(ctx as any, { action: 'agent_create', target_type: 'agent', target_id: String(agent.id), detail: { name: String(agent.name ?? ''), type: String(agent.type ?? '') } })
    } catch { /* 尽力 */ }
    return Response.json({ agent }, { status: 201 })
  })

  // ── 获取单个 Agent ───────────────────────────────────────

  app.get('/api/agents/:id', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params } = ctx
    const [agent] = await sql`
      SELECT a.*, u.email as bound_email, u.name as bound_user_name
      FROM agents a
      LEFT JOIN _weifuwu_users u ON u.id = a.user_id
      WHERE a.id = ${params.id} AND a.app_id = ${appId}
    `
    if (!agent) {
      return Response.json({ error: 'Agent 不存在' }, { status: 404 })
    }
    // 配额用量（Wave 9 成本控制——本月已用 token）
    let quota_used = 0
    try {
      const [usedRow] = await sql`
        SELECT COALESCE(SUM(tokens_total), 0)::int AS used
        FROM agent_logs WHERE agent_id = ${params.id} AND created_at >= DATE_TRUNC('month', NOW())
      `
      quota_used = Number((usedRow as any)?.used ?? 0)
    } catch { /* 尽力 */ }
    return Response.json({ agent: { ...agent, quota_used } })
  })

  // ── 更新 Agent ───────────────────────────────────────────

  app.put('/api/agents/:id', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params } = ctx
    const body = await req.json() as Record<string, unknown>

    // 构建动态更新
    const allowedFields = [
      'name', 'avatar_url', 'description', 'role_label', 'expertise',
      'model', 'system_prompt', 'temperature', 'max_tokens', 'human_in_the_loop',
      'webhook_url', 'webhook_secret', 'webhook_retry_count', 'im_bind_dept', 'chunk_size', 'chunk_overlap', 'tools', 'is_active',
      'workspace_path', 'allow_file_tools', 'allow_command_exec', 'allow_network', 'kb_id', 'monthly_token_quota',
    ]

    const sets: string[] = []
    const paramsList: unknown[] = []
    let idx = 1

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        sets.push(`${field} = $${idx++}`)
        paramsList.push(body[field])
      }
    }

    if (sets.length === 0) {
      return Response.json({ error: '没有可更新的字段' }, { status: 400 })
    }

    // 构建安全的动态 SET 子句 — 字段名硬编码无注入风险，参数值通过 paramsList 传入
    const setClause = sets.join(', ')
    const allParams = [...paramsList, params.id, appId]
    const [agent] = await sql.unsafe(
      `UPDATE agents SET ${setClause}, updated_at = NOW() WHERE id = $${paramsList.length + 1} AND app_id = $${paramsList.length + 2} RETURNING id, name, type, updated_at`,
      allParams
    )

    if (!agent) {
      return Response.json({ error: 'Agent 不存在' }, { status: 404 })
    }
    // 审计：Agent 更新（Wave 9）
    try {
      const { writeAudit } = await import('../services/audit.ts')
      await writeAudit(ctx as any, { action: 'agent_update', target_type: 'agent', target_id: String(agent.id), detail: { name: String(agent.name ?? '') } })
    } catch { /* 尽力 */ }
        // 审计：Agent 更新（Wave 9）
    try {
      const { writeAudit } = await import('../services/audit.ts')
      await writeAudit(ctx as any, { action: 'agent_update', target_type: 'agent', target_id: String(agent.id), detail: { name: String(agent.name ?? '') } })
    } catch { /* 尽力 */ }
    // 组织层级：经理自动成为代表部门的成员（role='manager'——识别层级）
    if (body.type === 'department' && body.department_id) {
      await sql`
        INSERT INTO department_members (department_id, agent_id, role)
        VALUES (${body.department_id}, ${agent.id}, 'manager')
        ON CONFLICT DO NOTHING
      `.catch(() => {})
    }

    return Response.json({ agent })
  })

  // ── 删除 Agent ───────────────────────────────────────────

  app.delete('/api/agents/:id', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params, auth } = ctx
    // 删除权限：仅 owner/admin（防 member 越权删 Agent）
    if (auth!.role !== 'owner' && auth!.role !== 'admin') {
      return Response.json({ error: '仅管理员可删除 Agent' }, { status: 403 })
    }
    const result = await sql`
      DELETE FROM agents
      WHERE id = ${params.id} AND app_id = ${appId}
      RETURNING id
    `
    if (result.length === 0) {
      return Response.json({ error: 'Agent 不存在' }, { status: 404 })
    }
    // 审计：Agent 删除（Wave 9）
    try {
      const { writeAudit } = await import('../services/audit.ts')
      await writeAudit(ctx as any, { action: 'agent_delete', target_type: 'agent', target_id: String(params.id) })
    } catch { /* 尽力 */ }
    return Response.json({ success: true })
  })

  // ── C4 质量指标：per-Agent 工具成功率 + 反馈汇总 ──

  app.get('/api/agents/:id/quality', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params } = ctx
    const [agent] = await sql`SELECT id FROM agents WHERE id = ${params.id} AND app_id = ${appId}`
    if (!agent) return Response.json({ error: 'Agent 不存在' }, { status: 404 })
    const [q] = await sql`
      SELECT COUNT(*)::int AS runs, COUNT(*) FILTER (WHERE success)::int AS ok_runs
      FROM agent_logs WHERE agent_id = ${params.id}
    `
    const [fb] = await sql`
      SELECT
        COALESCE(COUNT(*) FILTER (WHERE feedback = 'like'), 0)::int AS likes,
        COALESCE(COUNT(*) FILTER (WHERE feedback = 'dislike'), 0)::int AS dislikes
      FROM messages WHERE sender_id = ${params.id} AND feedback IS NOT NULL
    `
    const runs = Number((q as any)?.runs ?? 0)
    return Response.json({
      toolSuccessRate: runs > 0 ? Math.round(Number((q as any)?.ok_runs ?? 0) / runs * 100) : null,
      runs,
      likes: Number((fb as any)?.likes ?? 0),
      dislikes: Number((fb as any)?.dislikes ?? 0),
    })
  })

  // ── C3 记忆管理：查看/清除（R10 联动——记忆是用户数据） ──

  app.get('/api/agents/:id/memory', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params } = ctx
    const [agent] = await sql`SELECT id FROM agents WHERE id = ${params.id} AND app_id = ${appId}`
    if (!agent) return Response.json({ error: 'Agent 不存在' }, { status: 404 })
    const [mem] = await sql`SELECT content, updated_at FROM agent_memories WHERE agent_id = ${params.id}`
    return Response.json({ memory: mem ? String((mem as any).content ?? '') : '', updatedAt: mem ? (mem as any).updated_at : null })
  })

  app.delete('/api/agents/:id/memory', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params } = ctx
    const [agent] = await sql`SELECT id FROM agents WHERE id = ${params.id} AND app_id = ${appId}`
    if (!agent) return Response.json({ error: 'Agent 不存在' }, { status: 404 })
    await sql`DELETE FROM agent_memories WHERE agent_id = ${params.id}`
    return Response.json({ success: true })
  })

  // ── 对话预览（测试提示词，单轮流式，不落消息/不触发 HITL） ──

  app.post('/api/agents/:id/preview', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params } = ctx
    const [agent] = await sql`
      SELECT * FROM agents
      WHERE id = ${params.id} AND app_id = ${appId} AND type = 'ai'
    `
    if (!agent) {
      return Response.json({ error: 'AI Agent 不存在' }, { status: 404 })
    }
    const body = await req.json().catch(() => ({ content: '' }))
    const content = String(body.content ?? '').slice(0, 2000)
    if (!content.trim()) {
      return Response.json({ error: 'content 为必填' }, { status: 400 })
    }

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        const write = (chunk: string) => controller.enqueue(encoder.encode(chunk))
        try {
          await streamAgentPreview(ctx, agent as any, content, write)
        } catch (err) {
          write(`event: wf:error\ndata: ${JSON.stringify({ message: err instanceof Error ? err.message : String(err) })}\n\n`)
        }
        controller.close()
      },
    })

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    })
  })
  // ── Agent 版本管理（Wave 9：快照/列表/回滚） ─────────────────

  app.get('/api/agents/:id/versions', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { listVersions } = await import('../services/versions.ts')
    const versions = await listVersions(ctx as any, String(ctx.params.id))
    return Response.json({ versions })
  })

  app.post('/api/agents/:id/versions', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { saveVersion } = await import('../services/versions.ts')
    const body = await req.json().catch(() => ({}))
    const result = await saveVersion(ctx as any, String(ctx.params.id), body.note)
    if (!result) return Response.json({ error: 'Agent 不存在' }, { status: 404 })
    return Response.json({ version: result }, { status: 201 })
  })

  app.post('/api/agents/:id/versions/:versionId/rollback', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { rollbackVersion } = await import('../services/versions.ts')
    const result = await rollbackVersion(ctx as any, String(ctx.params.id), String(ctx.params.versionId))
    if (!result.ok) return Response.json({ error: result.note }, { status: 404 })
    return Response.json({ ok: true, note: result.note })
  })
}

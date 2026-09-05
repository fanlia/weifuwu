/**
 * Agent 路由 — CRUD（4 种类型）——orm 表绑定面（P2 迁移 + E1 聚合收编）
 *
 * FILTER 计数已由 E1 收编（count(col, as, filter)——compile/memory 同语义）。
 */

import type { Router } from 'weifuwu'
import { ops, and, eq, ne, bodyOf, listQuery, errorResponse } from 'weifuwu'
import type { AppCtx } from '../middleware/ctx.ts'
import { streamAgentPreview } from '../services/agent-runner.ts'
import { tables } from '../db/orm.ts'

/** 内置工具定义——单源：tools/builtin.ts（防止双份漂移——route 面 = 注册面） */
export { BUILTIN_TOOL_DEFS } from '../tools/builtin.ts'
// 静态导入重新导出（ESM 顶层——registerAgentRoutes 内直接可用）
import { BUILTIN_TOOL_DEFS as _BUILTIN } from '../tools/builtin.ts'
const BUILTIN_TOOL_DEFS = _BUILTIN

/** 内置工具名称列表 */
const BUILTIN_TOOL_NAMES = BUILTIN_TOOL_DEFS.map(t => t.function.name)

export function registerAgentRoutes(app: Router<AppCtx>): void {
  // ── 获取内置工具列表 ──────────────────────────────────────

  app.get('/api/agents/builtin-tools', async (_req: Request, _ctx: AppCtx): Promise<Response> => {
    return Response.json({ tools: BUILTIN_TOOL_DEFS })
  })
  // ── 获取 Agent 列表 ──────────────────────────────────────

  app.get('/api/agents', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { orm, appId } = ctx
    const url = new URL(req.url)

    // W4 试点：手写 parseInt ×2 + typeOk 白名单 → listQuery（行为等价——枚举白名单
    // 显式 400（原静默忽略非法 type——不静默改进）；sort 固定 created_at desc）
    try {
    const { filter: qFilter, limit, offset } = listQuery(url, tables(orm).agents as never, { defaultLimit: 50 })
    const page = await orm.ctxTable('agents').paginate({
      filter: qFilter as never,
      sort: [{ field: 'created_at', dir: 'desc' }],
      limit,
      offset,
    })
    const agents = page.rows
    const total = page.total

    // 为每个 AI Agent 附加最近的 token 用量统计
    const agentsWithStats = []
    for (const a of agents) {
      if (a.type === 'ai') {
        const [tokenSum] = await orm.query.from('agent_logs')
          .sum('tokens_total', 'total_tokens')
          .sum('tokens_prompt', 'total_prompt')
          .sum('tokens_completion', 'total_completion')
          .count('*', 'run_count')
          .where({ agent_id: { eq: String(a.id) } })
          .run()
        agentsWithStats.push({ ...a, token_usage: tokenSum })
      } else {
        agentsWithStats.push(a)
      }
    }

    return Response.json({ agents: agentsWithStats, total })
    } catch (e) { return errorResponse(e) }
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
    const { orm, appId } = ctx
    // W4 试点：手写 body 类型 30 行 + 必填/枚举校验 → bodyOf（shape 单源——
    // type/name 必填 + enum 白名单自动；app_id 系统列 omit（tenant 注入面）
    const T = tables(orm)
    try {
    const body = await bodyOf(req, T.agents, { variant: 'insert', omit: ['app_id'] })
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
      const T = tables(orm)
      const [dept] = await T.departments
        .select('id', 'name')
        .where(and(eq(T.departments.c.id, body.department_id), eq(T.departments.c.app_id, appId)))
        .run()
      if (!dept) return Response.json({ error: '绑定的部门不存在' }, { status: 404 })
      const [existing] = await T.agents
        .select('id')
        .where(and(
          eq(T.agents.c.department_id, body.department_id),
          eq(T.agents.c.type, 'department'),
          eq(T.agents.c.is_active, true),
        ))
        .run()
      if (existing) return Response.json({ error: '该部门已有经理（1 部门 1 经理）' }, { status: 409 })
      managerPrompt = body.system_prompt ?? null
    }

    const [agent] = await T.agents
      .insert({
        app_id: appId,
        type: body.type,
        name: body.name,
        avatar_url: body.avatar_url ?? null,
        description: body.description ?? null,
        model: body.model ?? null,
        system_prompt: managerPrompt ?? body.system_prompt ?? null,
        temperature: body.temperature ?? 0.7,
        max_tokens: body.max_tokens ?? 2048,
        human_in_the_loop: body.human_in_the_loop ?? false,
        user_id: body.user_id ?? null,
        webhook_url: body.webhook_url ?? null,
        webhook_secret: body.webhook_secret ?? null,
        webhook_retry_count: body.webhook_retry_count ?? 3,
        chunk_size: body.chunk_size ?? 500,
        chunk_overlap: body.chunk_overlap ?? 50,
        // W3 确定面：写入口归一（客户端可能传 JSON 字符串——入库恒对象——读面不再容错）
        tools: typeof body.tools === 'string' ? JSON.parse(body.tools) : (body.tools ?? []),
        workspace_path: body.workspace_path ?? null,
        allow_file_tools: body.allow_file_tools ?? false,
        allow_command_exec: body.allow_command_exec ?? false,
        allow_network: body.allow_network ?? false,
        kb_id: body.kb_id ?? null,
        department_id: body.department_id ?? null,
      })
      .returning('id', 'type', 'name', 'created_at')
      .run()

    // 审计：Agent 创建（Wave 9）
    try {
      const { writeAudit } = await import('../services/audit.ts')
      await writeAudit(ctx as any, { action: 'agent_create', target_type: 'agent', target_id: String(agent.id), detail: { name: String(agent.name ?? ''), type: String(agent.type ?? '') } })
    } catch { /* 尽力 */ }
    // 组织层级（与部门自动创建对齐）：经理入代表部门成员（role='manager'）+ 提示词单源回填（未自定义时）
    if (body.type === 'department' && body.department_id) {
      await T.department_members
        .insert({ department_id: body.department_id, agent_id: String(agent.id), role: 'manager' })
        .onConflict()
        .run()
        .catch(() => {})
      if (!body.system_prompt) {
        try {
          const { refreshManagerPrompt } = await import('../services/org-manager.ts')
          await refreshManagerPrompt(orm, String(appId), String(body.department_id))
        } catch { /* 刷新失败不阻断 */ }
      }
    }
    return Response.json({ agent }, { status: 201 })
    } catch (e) { return errorResponse(e) }
  })

  // ── 获取单个 Agent ───────────────────────────────────────

  app.get('/api/agents/:id', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { orm, appId, params } = ctx
    const agent = await orm.query.from('agents a')
      .select('a.id', 'a.app_id', 'a.type', 'a.name', 'a.avatar_url', 'a.description',
        'a.role_label', 'a.expertise', 'a.model', 'a.system_prompt', 'a.temperature', 'a.max_tokens',
        'a.human_in_the_loop', 'a.user_id', 'a.webhook_url', 'a.webhook_secret', 'a.webhook_retry_count',
        'a.im_bind_dept', 'a.chunk_size', 'a.chunk_overlap', 'a.tools', 'a.department_id',
        'a.monthly_token_quota', 'a.is_active', 'a.created_at', 'a.updated_at', 'a.workspace_path',
        'a.allow_file_tools', 'a.allow_command_exec', 'a.allow_network', 'a.template_slug', 'a.kb_id',
        'a.approval_policy', 'a.webhook_platform', 'a.risk_policy', 'a.light_model',
        'u.email as bound_email', 'u.name as bound_user_name')
      .join('_weifuwu_users u', { 'u.id': { col: 'a.user_id' } }, { type: 'left' })
      .where(and({ 'a.id': { eq: String(params.id) }}, { 'a.app_id': { eq: String(appId) } }))
      .one()
    if (!agent) {
      return Response.json({ error: 'Agent 不存在' }, { status: 404 })
    }
    // 配额用量（Wave 9 成本控制——本月已用 token）
    let quota_used = 0
    try {
      const [usedRow] = await orm.query.from('agent_logs')
        .sum('tokens_total', 'used')
        .where({ agent_id: { eq: params.id }, created_at: { gte: ops.monthStart() } })
        .run()
      quota_used = Number((usedRow as Record<string, unknown> | undefined)?.used ?? 0)
    } catch { /* 尽力 */ }
    return Response.json({ agent: { ...agent, quota_used } })
  })

  // ── 更新 Agent ───────────────────────────────────────────

  app.put('/api/agents/:id', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { orm, appId, params } = ctx
    const body = await req.json() as Record<string, unknown>

    // 构建动态更新（字段白名单——shape 校验面 + 白名单双保险）
    const allowedFields = [
      'name', 'avatar_url', 'description', 'role_label', 'expertise',
      'model', 'system_prompt', 'temperature', 'max_tokens', 'human_in_the_loop',
      'webhook_url', 'webhook_secret', 'webhook_retry_count', 'im_bind_dept', 'chunk_size', 'chunk_overlap', 'tools', 'is_active',
      'workspace_path', 'allow_file_tools', 'allow_command_exec', 'allow_network', 'kb_id', 'monthly_token_quota', 'department_id',
    ]
    const patch: Record<string, unknown> = { updated_at: ops.now() }
    for (const field of allowedFields) {
      if (body[field] !== undefined) patch[field] = body[field]
    }
    if (Object.keys(patch).length <= 1) {
      return Response.json({ error: '没有可更新的字段' }, { status: 400 })
    }

    const T = tables(orm)
    const [agent] = await T.agents
      .update(patch)
      .where(and(eq(T.agents.c.id, params.id), eq(T.agents.c.app_id, appId)))
      .returning('id', 'name', 'type', 'updated_at')
      .run()

    if (!agent) {
      return Response.json({ error: 'Agent 不存在' }, { status: 404 })
    }
    // 审计：Agent 更新（Wave 9）
    try {
      const { writeAudit } = await import('../services/audit.ts')
      await writeAudit(ctx as any, { action: 'agent_update', target_type: 'agent', target_id: String(agent.id), detail: { name: String(agent.name ?? '') } })
    } catch { /* 尽力 */ }
    // 组织层级：经理自动成为代表部门的成员（role='manager'——识别层级）
    if (body.type === 'department' && body.department_id) {
      await T.department_members
        .insert({ department_id: String(body.department_id), agent_id: String(agent.id), role: 'manager' })
        .onConflict()
        .run()
        .catch(() => {})
    }

    return Response.json({ agent })
  })

  // ── 删除 Agent ───────────────────────────────────────────

  app.delete('/api/agents/:id', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { orm, appId, params, auth } = ctx
    // 删除权限：仅 owner（防 member 越权删 Agent）。
    // （ROLES-OPTIMIZATION 波次 1：app 级 admin 幽灵角色裁剪——行为不变）
    if (auth!.role !== 'owner') {
      return Response.json({ error: '仅管理员可删除 Agent' }, { status: 403 })
    }
    const T = tables(orm)
    const result = await T.agents
      .delete()
      .where(and(eq(T.agents.c.id, params.id), eq(T.agents.c.app_id, appId)))
      .run()
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
    const { orm, appId, params } = ctx
    const T = tables(orm)
    const [agent] = await T.agents
      .select('id')
      .where(and(eq(T.agents.c.id, params.id), eq(T.agents.c.app_id, appId)))
      .run()
    if (!agent) return Response.json({ error: 'Agent 不存在' }, { status: 404 })
    const [q] = await T.agent_logs
      .select()
      .count('*', 'runs')
      .count('*', 'ok_runs', { success: { eq: true }})
      .where(eq(T.agent_logs.c.agent_id, params.id))
      .run()
    const [fb] = await T.messages
      .select()
      .count('*', 'likes', { feedback: { eq: 'like' }})
      .count('*', 'dislikes', { feedback: { eq: 'dislike' }})
      .where(and(eq(T.messages.c.sender_id, params.id), { feedback: { isNull: false } }))
      .run()
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
    const { orm, appId, params } = ctx
    const T = tables(orm)
    const [agent] = await T.agents
      .select('id')
      .where(and(eq(T.agents.c.id, params.id), eq(T.agents.c.app_id, appId)))
      .run()
    if (!agent) return Response.json({ error: 'Agent 不存在' }, { status: 404 })
    const [mem] = await T.agent_memories
      .select('content', 'updated_at')
      .where(eq(T.agent_memories.c.agent_id, params.id))
      .run()
    return Response.json({ memory: mem ? String((mem as any).content ?? '') : '', updatedAt: mem ? (mem as any).updated_at : null })
  })

  app.delete('/api/agents/:id/memory', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { orm, appId, params } = ctx
    const T = tables(orm)
    const [agent] = await T.agents
      .select('id')
      .where(and(eq(T.agents.c.id, params.id), eq(T.agents.c.app_id, appId)))
      .run()
    if (!agent) return Response.json({ error: 'Agent 不存在' }, { status: 404 })
    await T.agent_memories
      .delete()
      .where(eq(T.agent_memories.c.agent_id, params.id))
      .run()
    return Response.json({ success: true })
  })

  // ── 对话预览（测试提示词，单轮流式，不落消息/不触发 HITL） ──

  app.post('/api/agents/:id/preview', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { orm, appId, params } = ctx
    const T = tables(orm)
    const [agent] = await T.agents
      .select()
      .where(and(
        eq(T.agents.c.id, params.id),
        eq(T.agents.c.app_id, appId),
        eq(T.agents.c.type, 'ai'),
      ))
      .run()
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

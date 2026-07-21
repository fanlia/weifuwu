/**
 * Agent 路由 — CRUD（4 种类型）
 */

import type { Router, Context } from 'weifuwu'

export function registerAgentRoutes(app: Router): void {
  // ── 获取 Agent 列表 ──────────────────────────────────────

  app.get('/api/agents', async (req: Request, ctx: Context): Promise<Response> => {
    const { sql, tenantId } = ctx
    const url = new URL(req.url)
    const type = url.searchParams.get('type')

    const agents = await sql`
      SELECT
        id, type, name, avatar_url, description,
        model, system_prompt, temperature, max_tokens, human_in_the_loop,
        user_id, webhook_url, chunk_size, chunk_overlap,
        tools, is_active, created_at, updated_at
      FROM agents
      WHERE tenant_id = ${tenantId}
      ${type && ['ai', 'user', 'webhook', 'knowledge_base'].includes(type) ? sql`AND type = ${type}` : sql``}
      ORDER BY created_at DESC
    `

    return Response.json({ agents })
  })

  // ── 创建 Agent ───────────────────────────────────────────

  app.post('/api/agents', async (req: Request, ctx: Context): Promise<Response> => {
    const { sql, tenantId } = ctx
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
      // Knowledge Base
      chunk_size?: number
      chunk_overlap?: number
    }

    if (!body.type || !body.name) {
      return Response.json({ error: 'type 和 name 为必填' }, { status: 400 })
    }

    if (!['ai', 'user', 'webhook', 'knowledge_base'].includes(body.type)) {
      return Response.json({ error: 'type 必须是 ai/user/webhook/knowledge_base 之一' }, { status: 400 })
    }

    const [agent] = await sql`
      INSERT INTO agents (
        tenant_id, type, name, avatar_url, description,
        model, system_prompt, temperature, max_tokens, human_in_the_loop,
        user_id, webhook_url, chunk_size, chunk_overlap, tools
      ) VALUES (
        ${tenantId}, ${body.type}, ${body.name}, ${body.avatar_url ?? null}, ${body.description ?? null},
        ${body.model ?? null}, ${body.system_prompt ?? null}, ${body.temperature ?? 0.7}, ${body.max_tokens ?? 2048}, ${body.human_in_the_loop ?? false},
        ${body.user_id ?? null}, ${body.webhook_url ?? null}, ${body.chunk_size ?? 500}, ${body.chunk_overlap ?? 50},
        ${body.tools ? JSON.stringify(body.tools) : '[]'}
      )
      RETURNING id, type, name, created_at
    `

    return Response.json({ agent }, { status: 201 })
  })

  // ── 获取单个 Agent ───────────────────────────────────────

  app.get('/api/agents/:id', async (req: Request, ctx: Context): Promise<Response> => {
    const { sql, tenantId, params } = ctx
    const [agent] = await sql`
      SELECT * FROM agents
      WHERE id = ${params.id} AND tenant_id = ${tenantId}
    `
    if (!agent) {
      return Response.json({ error: 'Agent 不存在' }, { status: 404 })
    }
    return Response.json({ agent })
  })

  // ── 更新 Agent ───────────────────────────────────────────

  app.put('/api/agents/:id', async (req: Request, ctx: Context): Promise<Response> => {
    const { sql, tenantId, params } = ctx
    const body = await req.json() as Record<string, unknown>

    // 构建动态更新
    const allowedFields = [
      'name', 'avatar_url', 'description',
      'model', 'system_prompt', 'temperature', 'max_tokens', 'human_in_the_loop',
      'webhook_url', 'chunk_size', 'chunk_overlap', 'tools', 'is_active',
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
    const allParams = [...paramsList, params.id, tenantId]
    const [agent] = await sql.unsafe(
      `UPDATE agents SET ${setClause}, updated_at = NOW() WHERE id = $${paramsList.length + 1} AND tenant_id = $${paramsList.length + 2} RETURNING id, name, type, updated_at`,
      allParams
    )

    if (!agent) {
      return Response.json({ error: 'Agent 不存在' }, { status: 404 })
    }
    return Response.json({ agent })
  })

  // ── 删除 Agent ───────────────────────────────────────────

  app.delete('/api/agents/:id', async (req: Request, ctx: Context): Promise<Response> => {
    const { sql, tenantId, params } = ctx
    const result = await sql`
      DELETE FROM agents
      WHERE id = ${params.id} AND tenant_id = ${tenantId}
    `
    if (result.count === 0) {
      return Response.json({ error: 'Agent 不存在' }, { status: 404 })
    }
    return Response.json({ success: true })
  })
}

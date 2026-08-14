/**
 * 部门路由 — CRUD + 成员管理
 */

import type { Router, Context } from 'weifuwu'
import type { AppCtx } from '../middleware/ctx.ts'

export function registerDepartmentRoutes(app: Router<AppCtx>): void {
  // ── 获取部门列表 ─────────────────────────────────────────

  app.get('/api/departments', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId } = ctx
    const url = new URL(req.url)
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10))
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)))

    const departments = await sql`
      SELECT d.id, d.app_id, d.name, d.is_dm, d.created_at,
        (SELECT COUNT(*) FROM department_members dm WHERE dm.department_id = d.id)::int as member_count,
        (SELECT m.content FROM messages m WHERE m.department_id = d.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
        (SELECT m.created_at FROM messages m WHERE m.department_id = d.id ORDER BY m.created_at DESC LIMIT 1) as last_message_at
      FROM departments d
      WHERE d.app_id = ${appId}
      ORDER BY COALESCE((SELECT m.created_at FROM messages m WHERE m.department_id = d.id ORDER BY m.created_at DESC LIMIT 1), d.created_at) DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    const [countResult] = await sql`
      SELECT COUNT(*)::int as total
      FROM departments d
      WHERE d.app_id = ${appId}
    `

    return Response.json({ departments, total: countResult.total })
  })

  // ── 发起单聊（找/建 1v1 DM 部门——当前用户 × 目标 Agent） ──────

  app.post('/api/departments/dm', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, auth } = ctx
    const body = await req.json() as { agent_id: string }
    if (!body.agent_id) {
      return Response.json({ error: 'agent_id 为必填' }, { status: 400 })
    }
    // 目标 Agent 必须是同租户且不是 user 类型（不能和自己单聊）
    const [target] = await sql`
      SELECT id FROM agents WHERE id = ${body.agent_id} AND app_id = ${appId} AND type != 'user'
    `
    if (!target) {
      return Response.json({ error: 'Agent 不存在' }, { status: 404 })
    }
    // 当前用户的 user agent
    const [me] = await sql`
      SELECT id FROM agents WHERE app_id = ${appId} AND type = 'user' AND user_id = ${auth!.userId}
    `
    if (!me) {
      return Response.json({ error: '当前用户无绑定 Agent' }, { status: 400 })
    }
    // 找已有 DM（成员恰好 = me + target）
    const [existing] = await sql`
      SELECT d.id FROM departments d
      JOIN department_members dm1 ON dm1.department_id = d.id AND dm1.agent_id = ${me.id}
      JOIN department_members dm2 ON dm2.department_id = d.id AND dm2.agent_id = ${target.id}
      WHERE d.is_dm = TRUE
        AND (SELECT COUNT(*) FROM department_members dm WHERE dm.department_id = d.id) = 2
      LIMIT 1
    `
    if (existing) {
      return Response.json({ department: existing, existed: true })
    }
    const [department] = await sql`
      INSERT INTO departments (app_id, name, is_dm)
      VALUES (${appId}, '单聊', TRUE)
      RETURNING id, app_id, name, is_dm, created_at
    `
    await sql`
      INSERT INTO department_members (department_id, agent_id, role) VALUES
        (${department.id}, ${me.id}, 'admin'),
        (${department.id}, ${target.id}, 'member')
      ON CONFLICT DO NOTHING
    `
    return Response.json({ department, existed: false }, { status: 201 })
  })

  // ── 创建部门 ─────────────────────────────────────────────

  app.post('/api/departments', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId } = ctx
    const body = await req.json() as {
      name: string
      is_dm?: boolean
      member_ids?: string[]
    }

    if (!body.name) {
      return Response.json({ error: 'name 为必填' }, { status: 400 })
    }

    const [department] = await sql`
      INSERT INTO departments (app_id, name, is_dm)
      VALUES (${appId}, ${body.name}, ${body.is_dm ?? false})
      RETURNING id, app_id, name, is_dm, created_at
    `

    // 创建者的 user agent 自动加入并设为管理员（确保创建者能发消息）
    const [creatorAgent] = await sql`
      SELECT id FROM agents
      WHERE app_id = ${appId} AND type = 'user' AND user_id = ${ctx.auth!.userId}
    `
    if (creatorAgent) {
      await sql`
        INSERT INTO department_members (department_id, agent_id, role)
        VALUES (${department.id}, ${creatorAgent.id}, 'admin')
        ON CONFLICT DO NOTHING
      `
    }

    // 添加初始成员
    if (body.member_ids && body.member_ids.length > 0) {
      for (const agentId of body.member_ids) {
        await sql`
          INSERT INTO department_members (department_id, agent_id, role)
          VALUES (${department.id}, ${agentId}, 'member')
          ON CONFLICT DO NOTHING
        `
      }
    }

    return Response.json({ department }, { status: 201 })
  })

  // ── 获取单个部门 ─────────────────────────────────────────

  app.get('/api/departments/:id', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params } = ctx
    const [dept] = await sql`
      SELECT d.*
      FROM departments d
      WHERE d.id = ${params.id} AND d.app_id = ${appId}
    `
    if (!dept) {
      return Response.json({ error: '部门不存在' }, { status: 404 })
    }

    // 获取成员列表
    const members = await sql`
      SELECT a.id, a.type, a.name, a.avatar_url, dm.role, dm.joined_at
      FROM department_members dm
      JOIN agents a ON a.id = dm.agent_id
      WHERE dm.department_id = ${params.id}
    `

    return Response.json({ department: dept, members })
  })

  // ── 更新部门 ─────────────────────────────────────────────

  app.put('/api/departments/:id', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params } = ctx
    const body = await req.json() as { name?: string }

    const [dept] = await sql`
      UPDATE departments d
      SET name = COALESCE(${body.name ?? null}, d.name), updated_at = NOW()
      WHERE d.id = ${params.id} AND d.app_id = ${appId}
      RETURNING d.id, d.name, d.updated_at
    `

    if (!dept) {
      return Response.json({ error: '部门不存在' }, { status: 404 })
    }
    return Response.json({ department: dept })
  })

  // ── 删除部门 ─────────────────────────────────────────────

  app.delete('/api/departments/:id', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params } = ctx
    const result = await sql`
      DELETE FROM departments d
      WHERE d.id = ${params.id} AND d.app_id = ${appId}
      RETURNING d.id
    `
    if (result.length === 0) {
      return Response.json({ error: '部门不存在' }, { status: 404 })
    }
    return Response.json({ success: true })
  })

  // ── 添加成员 ─────────────────────────────────────────────

  app.post('/api/departments/:id/members', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params, auth } = ctx
    const body = await req.json() as { agent_id: string; role?: string }

    if (!body.agent_id) {
      return Response.json({ error: 'agent_id 为必填' }, { status: 400 })
    }

    // 验证部门和 Agent 都属于当前租户
    const [dept] = await sql`
      SELECT d.id FROM departments d
      WHERE d.id = ${params.id} AND d.app_id = ${appId}
    `
    if (!dept) {
      return Response.json({ error: '部门不存在' }, { status: 404 })
    }

    const [agent] = await sql`
      SELECT id FROM agents WHERE id = ${body.agent_id} AND app_id = ${appId}
    `
    if (!agent) {
      return Response.json({ error: 'Agent 不存在' }, { status: 404 })
    }

    // 商业化 G7 知识库部门授权：成员管理（含 KB 添加）必须部门管理员或租户 owner——
    // 防普通成员把知识库/Agent 拉进自己部门造成越权
    const [caller] = await sql`
      SELECT dm.role FROM department_members dm
      JOIN agents ua ON ua.id = dm.agent_id
      WHERE dm.department_id = ${params.id} AND ua.user_id = ${auth!.userId}
      LIMIT 1
    `
    const [callerOwner] = await sql`
      SELECT role FROM _weifuwu_app_members WHERE app_id = ${appId} AND user_id = ${auth!.userId}
    `
    if ((!caller || caller.role !== 'admin') && callerOwner?.role !== 'owner') {
      return Response.json({ error: '只有部门管理员可以管理成员' }, { status: 403 })
    }

    await sql`
      INSERT INTO department_members (department_id, agent_id, role)
      VALUES (${params.id}, ${body.agent_id}, ${body.role ?? 'member'})
      ON CONFLICT (department_id, agent_id) DO UPDATE SET role = EXCLUDED.role
    `

    return Response.json({ success: true })
  })

  // ── 移除成员 ─────────────────────────────────────────────

  app.delete('/api/departments/:id/members/:agentId', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params } = ctx

    // 验证部门属于当前租户
    const [dept] = await sql`
      SELECT d.id FROM departments d
      WHERE d.id = ${params.id} AND d.app_id = ${appId}
    `
    if (!dept) {
      return Response.json({ error: '部门不存在' }, { status: 404 })
    }

    await sql`
      DELETE FROM department_members
      WHERE department_id = ${params.id} AND agent_id = ${params.agentId}
    `

    return Response.json({ success: true })
  })
}

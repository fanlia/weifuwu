/**
 * 部门路由 — CRUD + 成员管理
 */

import type { Router, Context } from 'weifuwu'

export function registerDepartmentRoutes(app: Router): void {
  // ── 获取部门列表 ─────────────────────────────────────────

  app.get('/api/departments', async (req: Request, ctx: Context): Promise<Response> => {
    const { sql, tenantId } = ctx
    const url = new URL(req.url)
    const companyId = url.searchParams.get('company_id')

    const departments = await sql`
      SELECT d.id, d.company_id, d.name, d.is_dm, d.created_at,
        (SELECT COUNT(*) FROM department_members dm WHERE dm.department_id = d.id)::int as member_count
      FROM departments d
      JOIN companies c ON c.id = d.company_id
      WHERE c.tenant_id = ${tenantId}
      ${companyId ? sql`AND d.company_id = ${companyId}` : sql``}
      ORDER BY d.created_at DESC
    `

    return Response.json({ departments })
  })

  // ── 创建部门 ─────────────────────────────────────────────

  app.post('/api/departments', async (req: Request, ctx: Context): Promise<Response> => {
    const { sql, tenantId } = ctx
    const body = await req.json() as {
      company_id: string
      name: string
      is_dm?: boolean
      member_ids?: string[]
    }

    if (!body.company_id || !body.name) {
      return Response.json({ error: 'company_id 和 name 为必填' }, { status: 400 })
    }

    // 验证公司属于当前租户
    const [company] = await sql`
      SELECT id FROM companies WHERE id = ${body.company_id} AND tenant_id = ${tenantId}
    `
    if (!company) {
      return Response.json({ error: '公司不存在' }, { status: 404 })
    }

    const [department] = await sql`
      INSERT INTO departments (company_id, name, is_dm)
      VALUES (${body.company_id}, ${body.name}, ${body.is_dm ?? false})
      RETURNING id, company_id, name, is_dm, created_at
    `

    // 创建者的 user agent 自动加入并设为管理员（确保创建者能发消息）
    const [creatorAgent] = await sql`
      SELECT id FROM agents
      WHERE tenant_id = ${tenantId} AND type = 'user' AND user_id = ${ctx.auth!.userId}
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

  app.get('/api/departments/:id', async (req: Request, ctx: Context): Promise<Response> => {
    const { sql, tenantId, params } = ctx
    const [dept] = await sql`
      SELECT d.*, c.name as company_name
      FROM departments d
      JOIN companies c ON c.id = d.company_id
      WHERE d.id = ${params.id} AND c.tenant_id = ${tenantId}
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

  app.put('/api/departments/:id', async (req: Request, ctx: Context): Promise<Response> => {
    const { sql, tenantId, params } = ctx
    const body = await req.json() as { name?: string }

    const [dept] = await sql`
      UPDATE departments d
      SET name = COALESCE(${body.name ?? null}, d.name), updated_at = NOW()
      FROM companies c
      WHERE d.id = ${params.id} AND c.id = d.company_id AND c.tenant_id = ${tenantId}
      RETURNING d.id, d.name, d.updated_at
    `

    if (!dept) {
      return Response.json({ error: '部门不存在' }, { status: 404 })
    }
    return Response.json({ department: dept })
  })

  // ── 删除部门 ─────────────────────────────────────────────

  app.delete('/api/departments/:id', async (req: Request, ctx: Context): Promise<Response> => {
    const { sql, tenantId, params } = ctx
    const result = await sql`
      DELETE FROM departments d
      USING companies c
      WHERE d.id = ${params.id} AND c.id = d.company_id AND c.tenant_id = ${tenantId}
    `
    if (result.count === 0) {
      return Response.json({ error: '部门不存在' }, { status: 404 })
    }
    return Response.json({ success: true })
  })

  // ── 添加成员 ─────────────────────────────────────────────

  app.post('/api/departments/:id/members', async (req: Request, ctx: Context): Promise<Response> => {
    const { sql, tenantId, params } = ctx
    const body = await req.json() as { agent_id: string; role?: string }

    if (!body.agent_id) {
      return Response.json({ error: 'agent_id 为必填' }, { status: 400 })
    }

    // 验证部门和 Agent 都属于当前租户
    const [dept] = await sql`
      SELECT d.id FROM departments d
      JOIN companies c ON c.id = d.company_id
      WHERE d.id = ${params.id} AND c.tenant_id = ${tenantId}
    `
    if (!dept) {
      return Response.json({ error: '部门不存在' }, { status: 404 })
    }

    const [agent] = await sql`
      SELECT id FROM agents WHERE id = ${body.agent_id} AND tenant_id = ${tenantId}
    `
    if (!agent) {
      return Response.json({ error: 'Agent 不存在' }, { status: 404 })
    }

    await sql`
      INSERT INTO department_members (department_id, agent_id, role)
      VALUES (${params.id}, ${body.agent_id}, ${body.role ?? 'member'})
      ON CONFLICT (department_id, agent_id) DO UPDATE SET role = EXCLUDED.role
    `

    return Response.json({ success: true })
  })

  // ── 移除成员 ─────────────────────────────────────────────

  app.delete('/api/departments/:id/members/:agentId', async (req: Request, ctx: Context): Promise<Response> => {
    const { sql, tenantId, params } = ctx

    // 验证部门属于当前租户
    const [dept] = await sql`
      SELECT d.id FROM departments d
      JOIN companies c ON c.id = d.company_id
      WHERE d.id = ${params.id} AND c.tenant_id = ${tenantId}
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

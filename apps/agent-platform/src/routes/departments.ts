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
    // R4 权限：viewer 只读——不能建部门
    try {
      const { requireWriter } = await import('../services/permissions.ts')
      await requireWriter(ctx)
    } catch (e: any) {
      return Response.json({ error: e?.message ?? '无权操作' }, { status: e?.status ?? 403 })
    }
    const { sql, appId } = ctx
    const body = await req.json() as {
      name: string
      is_dm?: boolean
      member_ids?: string[]
      /** 组织层级：自动创建部门经理（department 类型 agent——代表部门对外协作） */
      auto_manager?: boolean
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

    // 组织层级：自动创建部门经理（department 类型 agent——代表部门，可加入上级部门）
    let manager = null
    if (!body.is_dm && body.auto_manager !== false) {
      const [mgr] = await sql`
        INSERT INTO agents (app_id, type, name, description, model, department_id, is_active, tools, allow_file_tools)
        VALUES (${appId}, 'department', ${String(body.name) + '经理'}, ${'部门经理——代表「' + String(body.name) + '」对外协作'},
          'deepseek-v4-flash', ${department.id}, true, '[]', true)
        RETURNING id, name
      `
      // 经理自动成为本部门成员（role='manager'——识别组织层级）
      await sql`
        INSERT INTO department_members (department_id, agent_id, role)
        VALUES (${department.id}, ${mgr.id}, 'manager')
        ON CONFLICT DO NOTHING
      `
      // 经理提示词（部门成员名单——call_agent 分派用）
      try {
        const members = await sql`
          SELECT a.name FROM department_members dm JOIN agents a ON a.id = dm.agent_id
          WHERE dm.department_id = ${department.id} AND a.type IN ('ai', 'knowledge_base')
        `
        const names = (members ?? []).map((m: any) => m.name).join('、')
        await sql`
          UPDATE agents SET system_prompt = ${`你是「${String(body.name)}」的部门经理，代表该部门参与协作。\n\n你的职责：\n1. 作为部门代表回答与其他部门的协作请求\n2. 需要部门成员实际干活时，用 call_agent 工具把任务分派给成员（一次一个成员）\n3. 汇总成员结果后回复——你就是「${String(body.name)}」的对外出口\n\n部门成员：${names || '（暂无 AI 成员——请先给部门添加 AI 能力）'}\n\n任务完成后按以下结构汇报：\n- ✅ 已完成：列出完成的事项\n- ⚠️ 未完成：列出未完成的事项及原因（没有则省略）\n- 📦 产物：生成的文件/结果位置（没有则省略）`}
          WHERE id = ${mgr.id}
        `
      } catch { /* 提示词生成失败不阻断 */ }
      manager = { id: mgr.id, name: mgr.name }
    }

    return Response.json({ department, manager }, { status: 201 })
  })

  // ── P1 工作区聚合 API（三层模型：一个部门 = 一个页面）─────────────────
  // 项目空间页首屏一次返回：部门 + 成员 + 环境状态（用户语言）+ 文件根列表 + 最近消息摘要 + 配额
  app.get('/api/departments/:id/workspace', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params } = ctx
    const [dept] = await sql`
      SELECT d.* FROM departments d
      WHERE d.id = ${params.id} AND d.app_id = ${appId}
    `
    if (!dept) return Response.json({ error: '部门不存在' }, { status: 404 })
    // 成员
    const members = await sql`
      SELECT a.id, a.type, a.name, a.avatar_url, a.description, a.role_label, a.expertise, dm.role, dm.joined_at
      FROM department_members dm
      JOIN agents a ON a.id = dm.agent_id
      WHERE dm.department_id = ${params.id}
    `
    // 环境状态（用户语言映射——前端零翻译）
    const { manager } = await import('../sandbox/manager.ts')
    manager.init(sql)
    const sb = await manager.byDepartment(String(params.id))
    const envMap: Record<string, { status: string; label: string }> = {
      running: { status: 'ready', label: 'AI 随时能干活' },
      stopped: { status: 'cold', label: 'AI 休息中，干活时自动唤醒' },
      requested: { status: 'cold', label: '环境待启动（首次干活自动创建）' },
      error: { status: 'error', label: '环境异常，请管理员处理' },
    }
    let env = { status: 'none', label: '' }
    if (sb && envMap[sb.status]) env = envMap[sb.status]
    // 文件根列表（共享工作目录——交付物；单聊也是部门特例）
    let files: Array<{ name: string; type: string; size: number; mtime: string }> = []
    try {
      const { resolveDepartmentWorkspace } = await import('../middleware/workspace.ts')
      const ws = await resolveDepartmentWorkspace(String(params.id), (dept as any).workspace_path, true)
      if (ws) {
        const { readdir, stat } = await import('node:fs/promises')
        const { join } = await import('node:path')
        const entries = await readdir(ws, { withFileTypes: true })
        const items: Array<{ name: string; type: string; size: number; mtime: string }> = []
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue
          const full = join(ws, entry.name)
          try {
            const s = await stat(full)
            items.push({ name: entry.name, type: entry.isDirectory() ? 'dir' : 'file', size: s.size, mtime: s.mtime.toISOString() })
          } catch { /* 跳过 */ }
        }
        items.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1))
        files = items.slice(0, 20)
      }
    } catch { /* 文件列表失败不阻断 */ }
    // 最近消息摘要（3 条）
    const recent = await sql`
      SELECT m.content, m.created_at, a.name as sender_name, a.type as sender_type
      FROM messages m JOIN agents a ON a.id = m.sender_id
      WHERE m.department_id = ${params.id} AND m.ai_approved != FALSE
      ORDER BY m.created_at DESC LIMIT 3
    `
    return Response.json({
      department: dept,
      members,
      env,
      files,
      recentMessages: (recent ?? []).map((r: any) => ({
        content: String(r.content ?? '').slice(0, 120),
        senderName: String(r.sender_name ?? ''),
        senderType: String(r.sender_type ?? ''),
        createdAt: r.created_at,
      })),
    })
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
      SELECT a.id, a.type, a.name, a.avatar_url, a.description, a.role_label, a.expertise, dm.role, dm.joined_at
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
    // 三层模型：部门 = 工作目录 + 计算资源归属——删除前先终止关联 sandbox（rm 容器）
    try {
      const { manager } = await import('../sandbox/manager.ts')
      manager.init(sql)
      await manager.terminateByDepartment(String(params.id))
    } catch { /* 沙盒清理失败不阻断删除——孤儿清理兜底 */ }
    const result = await sql`
      DELETE FROM departments d
      WHERE d.id = ${params.id} AND d.app_id = ${appId}
      RETURNING d.id
    `
    if (result.length === 0) {
      return Response.json({ error: '部门不存在' }, { status: 404 })
    }
    // 三层模型：部门删除 → 工作目录清理（保留期 SANDBOX_WORKSPACE_RETENTION_DAYS 默认 0=立即删）
    try {
      const { resolveDepartmentWorkspace, getDefaultWorkspaceRoot } = await import('../middleware/workspace.ts')
      const ws = await resolveDepartmentWorkspace(String(params.id), null, true)
      if (ws) {
        const retentionDays = Number(process.env.SANDBOX_WORKSPACE_RETENTION_DAYS ?? 0)
        if (retentionDays <= 0) {
          const { rm } = await import('node:fs/promises')
          await rm(ws, { recursive: true, force: true })
        }
      }
    } catch { /* 目录清理失败不影响 */ }
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

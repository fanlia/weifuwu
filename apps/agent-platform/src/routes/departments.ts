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
    const q = String(url.searchParams.get('q') ?? '').trim()

    const departments = await sql`
      SELECT d.id, d.app_id, d.name, d.is_dm, d.created_at,
        (SELECT COUNT(*) FROM department_members dm WHERE dm.department_id = d.id)::int as member_count,
        (SELECT COUNT(*) FROM department_members dm JOIN agents a ON a.id = dm.agent_id
           WHERE dm.department_id = d.id AND a.type = 'user')::int as human_count,
        (SELECT m.content FROM messages m WHERE m.department_id = d.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
        (SELECT m.created_at FROM messages m WHERE m.department_id = d.id ORDER BY m.created_at DESC LIMIT 1) as last_message_at
      FROM departments d
      WHERE d.app_id = ${appId}
      ${q ? sql`AND d.name ILIKE ${'%' + q + '%'}` : sql``}
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
    // R4 权限：viewer 只读——不能建部门；**member 也不能**（能力矩阵：
    // 建部门 = owner/admin——2026-08 UI 角色测试抓到：member 能建——
    // 实现与矩阵漂移——过宽）
    try {
      const { requireWriter } = await import('../services/permissions.ts')
      await requireWriter(ctx)
    } catch (e: any) {
      return Response.json({ error: e?.message ?? '无权操作' }, { status: e?.status ?? 403 })
    }
    try {
      const { appRoleOf } = await import('../services/permissions.ts')
      const role = await appRoleOf(ctx)
      // ROLES-OPTIMIZATION 波次 1：app 级 admin 幽灵角色裁剪（invite 只产
      // member/viewer、DB 零实例）——仅 owner 可建部门；行为不变
      if (role !== 'owner') {
        return Response.json({ error: '只有租户所有者可以创建部门' }, { status: 403 })
      }
    } catch (e: any) {
      return Response.json({ error: e?.message ?? '权限校验失败' }, { status: e?.status ?? 403 })
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
      // 组织层级：经理提示词单源（org-manager.ts）——成员名单实时化（成员增删刷新）
      try {
        const { refreshManagerPrompt } = await import('../services/org-manager.ts')
        await refreshManagerPrompt(sql, String(appId), String(department.id))
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
    // 组织层级（2026-12）：下级部门——本部门成员中 type='department' 的经理代表的部门
    // 上级可查看子部门交付物（只读）——组织层级的可见性闭环
    const subDepartments = []
    try {
      const mgrRows = await sql`
        SELECT a.id as mgr_id, a.name as mgr_name, a.department_id
        FROM department_members dm JOIN agents a ON a.id = dm.agent_id
        WHERE dm.department_id = ${params.id} AND a.type = 'department' AND a.department_id IS NOT NULL
      `
      for (const m of mgrRows ?? []) {
        const subDeptId = String((m as any).department_id)
        if (subDeptId === String(params.id)) continue // 排除自我引用（经理代表本部门）
        const [sd] = await sql`SELECT id, name FROM departments WHERE id = ${subDeptId} AND app_id = ${appId}`
        if (!sd) continue
        // 子部门成员数 + 最近交付物（根目录 top 10——只读可见性）
        let subMemberCount = 0
        let subFiles: Array<{ name: string; type: string; size: number; mtime: string }> = []
        try {
          const [cnt] = await sql`SELECT COUNT(*)::int as n FROM department_members WHERE department_id = ${subDeptId}`
          subMemberCount = Number(cnt?.n ?? 0)
        } catch { /* 计数失败 */ }
        try {
          const { resolveDepartmentWorkspace } = await import('../middleware/workspace.ts')
          const subWs = await resolveDepartmentWorkspace(subDeptId, (sd as any).workspace_path, true)
          if (subWs) {
            const { readdir, stat } = await import('node:fs/promises')
            const { join } = await import('node:path')
            const entries = await readdir(subWs, { withFileTypes: true })
            const items: Array<{ name: string; type: string; size: number; mtime: string }> = []
            for (const entry of entries) {
              if (entry.name.startsWith('.')) continue
              const full = join(subWs, entry.name)
              try {
                const st = await stat(full)
                items.push({ name: entry.name, type: entry.isDirectory() ? 'dir' : 'file', size: st.size, mtime: st.mtime.toISOString() })
              } catch { /* 跳过 */ }
            }
            items.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1))
            subFiles = items.slice(0, 10)
          }
        } catch { /* 子部门文件失败不阻断 */ }
        subDepartments.push({
          id: subDeptId,
          name: String((sd as any).name),
          managerId: String((m as any).mgr_id),
          managerName: String((m as any).mgr_name),
          memberCount: subMemberCount,
          files: subFiles,
        })
      }
    } catch { /* 下级部门解析失败不阻断 */ }
    return Response.json({
      department: dept,
      members,
      env,
      files,
      subDepartments,
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
    const body = await req.json() as { name?: string; artifact_review?: boolean }

    // 产物审批模式切换（2026-12）：关闭时把 .pending 待审产物全部移入共享目录（不丢文件）
    if (body.artifact_review !== undefined) {
      try {
        const [cur] = await sql`SELECT artifact_review FROM departments WHERE id = ${params.id} AND app_id = ${appId}`
        const turningOff = (cur as any)?.artifact_review === true && body.artifact_review === false
        if (turningOff) {
          const { flushPendingArtifacts } = await import('../services/artifact-review.ts')
          await flushPendingArtifacts(sql, String(params.id))
        }
      } catch { /* 切换失败不阻断 */ }
    }

    const [dept] = await sql`
      UPDATE departments d
      SET name = COALESCE(${body.name ?? null}, d.name),
          artifact_review = COALESCE(${body.artifact_review ?? null}, d.artifact_review),
          updated_at = NOW()
      WHERE d.id = ${params.id} AND d.app_id = ${appId}
      RETURNING d.id, d.name, d.artifact_review, d.updated_at
    `

    if (!dept) {
      return Response.json({ error: '部门不存在' }, { status: 404 })
    }
    return Response.json({ department: dept })
  })

  // ── 删除部门 ─────────────────────────────────────────────

  app.delete('/api/departments/:id', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params } = ctx
    // R-权限（2026-08——UI 角色测试抓出：删除无任何鉴权——viewer/member
    // 都能删任何部门——矩阵红线：删除 = owner；ROLES-OPTIMIZATION 波次 1：
    // app 级 admin 幽灵角色裁剪——行为不变）
    try {
      const { appRoleOf } = await import('../services/permissions.ts')
      const role = await appRoleOf(ctx)
      if (role !== 'owner') {
        return Response.json({ error: '只有租户所有者可以删除部门' }, { status: 403 })
      }
    } catch (e: any) {
      return Response.json({ error: e?.message ?? '权限校验失败' }, { status: e?.status ?? 403 })
    }
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
    // 组织层级：部门经理是派生资源——部门亡经理亡（孤儿歼灭——department_members 行 FK cascade 自动清）
    await sql`
      DELETE FROM agents WHERE type = 'department' AND department_id = ${params.id} AND app_id = ${appId}
    `
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
    // 部门级 admin（department_members.role——合法——勿与租户级幽灵 admin 裁剪混淆——ROLES-OPTIMIZATION 波次 1）
    if ((!caller || caller.role !== 'admin') && callerOwner?.role !== 'owner') {
      return Response.json({ error: '只有部门管理员可以管理成员' }, { status: 403 })
    }

    await sql`
      INSERT INTO department_members (department_id, agent_id, role)
      VALUES (${params.id}, ${body.agent_id}, ${body.role ?? 'member'})
      ON CONFLICT (department_id, agent_id) DO UPDATE SET role = EXCLUDED.role
    `

    // 组织层级：成员变化 → 刷新部门经理提示词（成员名单实时化）
    try {
      const { refreshManagerPrompt } = await import('../services/org-manager.ts')
      await refreshManagerPrompt(sql, String(appId), String(params.id))
    } catch { /* 刷新失败不阻断 */ }

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

    // 组织层级：成员变化 → 刷新部门经理提示词（成员名单实时化）
    try {
      const { refreshManagerPrompt } = await import('../services/org-manager.ts')
      await refreshManagerPrompt(sql, String(appId), String(params.id))
    } catch { /* 刷新失败不阻断 */ }

    return Response.json({ success: true })
  })

  // ── 产物审批（2026-12）：AI 产出 → 批准发布 / 拒绝删除 ────────────
  // artifact_review 模式下 AI 的写入落在 .pending 待审区——批准 = 移动至共享目录
  app.get('/api/departments/:id/artifacts/pending', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params } = ctx
    const [dept] = await sql`SELECT id FROM departments WHERE id = ${params.id} AND app_id = ${appId}`
    if (!dept) return Response.json({ error: '部门不存在' }, { status: 404 })
    const { listPendingArtifacts } = await import('../services/artifact-review.ts')
    const items = await listPendingArtifacts(sql, String(params.id))
    return Response.json({ pending: items })
  })

  app.post('/api/departments/:id/artifacts/:action', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params, auth } = ctx
    const action = params.action as 'approve' | 'reject'
    if (!['approve', 'reject'].includes(action)) return Response.json({ error: '不支持的 action' }, { status: 400 })
    const [dept] = await sql`SELECT id FROM departments WHERE id = ${params.id} AND app_id = ${appId}`
    if (!dept) return Response.json({ error: '部门不存在' }, { status: 404 })
    // 产物审批是管理动作（G7 同款权限）：部门管理员或租户 owner 才能批准/拒绝
    const [caller] = await sql`
      SELECT dm.role FROM department_members dm
      JOIN agents ua ON ua.id = dm.agent_id
      WHERE dm.department_id = ${params.id} AND ua.user_id = ${auth!.userId}
      LIMIT 1
    `
    const [callerOwner] = await sql`
      SELECT role FROM _weifuwu_app_members WHERE app_id = ${appId} AND user_id = ${auth!.userId}
    `
    // 部门级 admin（department_members.role——合法——勿与租户级幽灵 admin 裁剪混淆——ROLES-OPTIMIZATION 波次 1）
    if ((!caller || caller.role !== 'admin') && callerOwner?.role !== 'owner') {
      return Response.json({ error: '只有部门管理员可以审批产物' }, { status: 403 })
    }
    const body = await req.json().catch(() => ({}))
    const relPath = String(body.path ?? '')
    const { approveArtifact, rejectArtifact } = await import('../services/artifact-review.ts')
    const r = action === 'approve'
      ? await approveArtifact(sql, String(params.id), relPath)
      : await rejectArtifact(sql, String(params.id), relPath)
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 })
    return Response.json({ success: true, path: relPath })
  })
}

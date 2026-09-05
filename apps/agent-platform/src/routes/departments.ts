/**
 * 部门路由 — CRUD + 成员管理（orm 表绑定面——P1 迁移）
 *
 * 判负面（登记于 platform-orm-迁移.md §3——逃生舱 orm.execute·审计白名单）：
 * - GET /api/departments 列表：4 标量子查询投影 + COALESCE 排序——builder 面不可表达
 *   ——保留 SQL 逃生舱（// orm-pg-subquery）
 */

import type { Router } from 'weifuwu'
import { HttpError } from 'weifuwu'
import { ops, eq, ne, and, or, inArray, like, ilike, bodyOf } from 'weifuwu'
import type { AppCtx } from '../middleware/ctx.ts'
import { tables, weifuwuAppMembers } from '../db/orm.ts'

export function registerDepartmentRoutes(app: Router<AppCtx>): void {
  // ── 获取部门列表 ─────────────────────────────────────────

  app.get('/api/departments', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, orm, appId } = ctx
    const url = new URL(req.url)
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10))
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)))
    const q = String(url.searchParams.get('q') ?? '').trim()

    // orm-pg-subquery 判负修订：4 个标量子查询投影 → 主查 departments + 组查（成员计数/最近消息）Map 合并
    const deps0 = await orm.query.from('departments').select('id', 'app_id', 'name', 'is_dm', 'created_at')
      .where({ app_id: { eq: appId }, ...(q ? { name: { ilike: `%${q}%` } } : {}) })
      .limit(limit).offset(offset).run()
    const depIds = deps0.map((d) => String(d.id))
    const memRows = depIds.length ? await orm.query.from('department_members').select('department_id', 'agent_id')
      .where({ department_id: { in: depIds } }).run() : []
    const memMap = new Map<string, { member_count: number; human_count: number }>()
    const idsByDep = new Map<string, string[]>()
    for (const m of memRows) {
      const k = String(m.department_id)
      const cur = memMap.get(k) ?? { member_count: 0, human_count: 0 }
      cur.member_count += 1
      memMap.set(k, cur)
      idsByDep.set(k, [...(idsByDep.get(k) ?? []), String(m.agent_id ?? '')])
    }
    const memAgentIds = [...new Set(memRows.map((m) => String(m.agent_id ?? '')))]
    const agentTypes = memAgentIds.length ? await orm.query.from('agents').select('id', 'type').where({ id: { in: memAgentIds } }).run() : []
    const typeMap = new Map(agentTypes.map((a) => [String(a.id), String(a.type)]))
    for (const [k, cur] of memMap) {
      cur.human_count = (idsByDep.get(k) ?? []).filter((aid) => typeMap.get(aid) === 'user').length
    }
    // 最近消息（content/created_at——每部门最新 1 条）
    const lastRows = depIds.length ? await orm.query.from('messages').select('department_id', 'content', 'created_at')
      .where({ department_id: { in: depIds } }).orderBy('created_at', 'desc').run() : []
    const seen = new Set<string>()
    const msgMap = new Map<string, { last_message: unknown; last_message_at: unknown }>()
    for (const m of lastRows) {
      const k = String(m.department_id)
      if (seen.has(k)) continue
      seen.add(k)
      msgMap.set(k, { last_message: m.content, last_message_at: m.created_at })
    }
    const departments = deps0.map((d) => ({
      id: d.id, app_id: d.app_id, name: d.name, is_dm: d.is_dm, created_at: d.created_at,
      ...(memMap.get(String(d.id)) ?? { member_count: 0, human_count: 0 }),
      ...(msgMap.get(String(d.id)) ?? { last_message: null, last_message_at: null }),
    }))
      .sort((a, b) => String((b as any).last_message_at ?? b.created_at).localeCompare(String((a as any).last_message_at ?? a.created_at)))

    const T = tables(orm)
    const [countRow] = await orm.query.from('departments').count('*', 'total').where({ app_id: { eq: appId }}).run()

    return Response.json({ departments, total: (countRow as Record<string, unknown> | undefined)?.total ?? 0 })
  })

  // ── 发起单聊（找/建 1v1 DM 部门——当前用户 × 目标 Agent） ──────

  app.post('/api/departments/dm', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { orm, appId, auth } = ctx
    const body = await req.json() as { agent_id: string }
    if (!body.agent_id) {
      throw new HttpError('agent_id 为必填', 400)
    }
    const T = tables(orm)
    // 目标 Agent 必须是同租户且不是 user 类型（不能和自己单聊）
    const [target] = await T.agents
      .select('id')
      .where(and(eq(T.agents.c.id, body.agent_id), eq(T.agents.c.app_id, appId), ne(T.agents.c.type, 'user')))
      .run()
    if (!target) {
      throw new HttpError('Agent 不存在', 404)
    }
    // 当前用户的 user agent
    const [me] = await T.agents
      .select('id')
      .where(and(eq(T.agents.c.app_id, appId), eq(T.agents.c.type, 'user'), eq(T.agents.c.user_id, auth!.userId)))
      .run()
    if (!me) {
      throw new HttpError('当前用户无绑定 Agent', 400)
    }
    // 找已有 DM（成员恰好 = me + target）——双 JOIN + NOT EXISTS 第三成员（=COUNT=2）
    const existing = await orm.query.from('departments d')
      .select('d.id')
      .join('department_members dm1', and(
        { 'dm1.department_id': { col: 'd.id' } },
        { 'dm1.agent_id': { eq: me.id } },
      ))
      .join('department_members dm2', and(
        { 'dm2.department_id': { col: 'd.id' } },
        { 'dm2.agent_id': { eq: target.id } },
      ))
      .where({ 'd.is_dm': { eq: true } })
      .exists(
        { kind: 'select', table: 'department_members', alias: 'dm3', cols: ['1'], where: and(
          { 'dm3.department_id': { col: 'd.id' } },
          { 'dm3.agent_id': { notIn: [String(me.id), String(target.id)] } },
        ) },
        true,
      )
      .limit(1)
      .run()
    if (existing.length) {
      return Response.json({ department: existing[0], existed: true })
    }
    const [department] = await T.departments
      .insert({ app_id: appId, name: '单聊', is_dm: true })
      .returning('id', 'app_id', 'name', 'is_dm', 'created_at')
      .run()
    await T.department_members.insert([
      { department_id: String(department.id), agent_id: String(me.id), role: 'admin' },
      { department_id: String(department.id), agent_id: String(target.id), role: 'member' },
    ]).onConflict().run()
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
        throw new HttpError('只有租户所有者可以创建部门', 403)
      }
    } catch (e: any) {
      return Response.json({ error: e?.message ?? '权限校验失败' }, { status: e?.status ?? 403 })
    }
    const { orm, appId } = ctx
    const body = await req.json() as {
      name: string
      is_dm?: boolean
      member_ids?: string[]
      /** 组织层级：自动创建部门经理（department 类型 agent——代表部门对外协作） */
      auto_manager?: boolean
    }

    if (!body.name) {
      throw new HttpError('name 为必填', 400)
    }

    const T = tables(orm)
    const [department] = await T.departments
      .insert({ app_id: appId, name: body.name, is_dm: body.is_dm ?? false })
      .returning('id', 'app_id', 'name', 'is_dm', 'created_at')
      .run()

    // 创建者的 user agent 自动加入并设为管理员（确保创建者能发消息）
    const [creatorAgent] = await T.agents
      .select('id')
      .where(and(eq(T.agents.c.app_id, appId), eq(T.agents.c.type, 'user'), eq(T.agents.c.user_id, ctx.auth!.userId)))
      .run()
    if (creatorAgent) {
      await T.department_members
        .insert({ department_id: String(department.id), agent_id: String(creatorAgent.id), role: 'admin' })
        .onConflict()
        .run()
    }

    // 添加初始成员
    if (body.member_ids && body.member_ids.length > 0) {
      await T.department_members
        .insert(body.member_ids.map((agentId) => ({ department_id: String(department.id), agent_id: agentId, role: 'member' })))
        .onConflict()
        .run()
    }

    // 组织层级：自动创建部门经理（department 类型 agent——代表部门，可加入上级部门）
    let manager = null
    if (!body.is_dm && body.auto_manager !== false) {
      const [mgr] = await T.agents
        .insert({
          app_id: appId,
          type: 'department',
          name: String(body.name) + '经理',
          description: '部门经理——代表「' + String(body.name) + '」对外协作',
          model: 'deepseek-v4-flash',
          department_id: String(department.id),
          is_active: true,
          tools: [],
          allow_file_tools: true,
        })
        .returning('id', 'name')
        .run()
      // 经理自动成为本部门成员（role='manager'——识别组织层级）
      await T.department_members
        .insert({ department_id: String(department.id), agent_id: String(mgr.id), role: 'manager' })
        .onConflict()
        .run()
      // 组织层级：经理提示词单源（org-manager.ts）——成员名单实时化（成员增删刷新）
      try {
        const { refreshManagerPrompt } = await import('../services/org-manager.ts')
        await refreshManagerPrompt(orm, appId, String(department.id))
      } catch { /* 提示词生成失败不阻断 */ }
      manager = { id: mgr.id, name: mgr.name }
    }

    return Response.json({ department, manager }, { status: 201 })
  })

  // ── P1 工作区聚合 API（三层模型：一个部门 = 一个页面）─────────────────
  // 项目空间页首屏一次返回：部门 + 成员 + 环境状态（用户语言）+ 文件根列表 + 最近消息摘要 + 配额
  app.get('/api/departments/:id/workspace', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { orm, appId, params } = ctx
    const T = tables(orm)
    const [dept] = await T.departments
      .select()
      .where(and(eq(T.departments.c.id, params.id), eq(T.departments.c.app_id, appId)))
      .run()
    if (!dept) throw new HttpError('部门不存在', 404)
    // 成员
    const members = await orm.query.from('department_members dm')
      .select('a.id', 'a.type', 'a.name', 'a.avatar_url', 'a.description', 'a.role_label', 'a.expertise', 'dm.role', 'dm.joined_at')
      .join('agents a', { 'a.id': { col: 'dm.agent_id' } })
      .where({ 'dm.department_id': { eq: params.id }})
      .run()
    // 环境状态（用户语言映射——前端零翻译）
    const { sql } = ctx
    const { manager } = await import('../sandbox/manager.ts')
    manager.init(orm)
    const sb = await manager.byDepartment(params.id)
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
      const ws = await resolveDepartmentWorkspace(params.id, (dept as any).workspace_path, true)
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
    // 最近消息摘要（3 条）——JOIN 表绑定
    const recent = await orm.query.from('messages m')
      .select('m.content', 'm.created_at', 'a.name as sender_name', 'a.type as sender_type')
      .join('agents a', { 'a.id': { col: 'm.sender_id' } })
      .where(and(
        { 'm.department_id': { eq: params.id }},
        { 'm.ai_approved': { ne: false } },
      ))
      .orderBy('m.created_at', 'desc')
      .limit(3)
      .run()
    // 组织层级（2026-12）：下级部门——本部门成员中 type='department' 的经理代表的部门
    // 上级可查看子部门交付物（只读）——组织层级的可见性闭环
    const subDepartments = []
    try {
      const mgrRows = await orm.query.from('department_members dm')
        .select('a.id as mgr_id', 'a.name as mgr_name', 'a.department_id')
        .join('agents a', { 'a.id': { col: 'dm.agent_id' } })
        .where(and(
          { 'dm.department_id': { eq: params.id }},
          { 'a.type': { eq: 'department' } },
        ))
        .run()
      for (const m of mgrRows ?? []) {
        const subDeptId = String((m as any).department_id)
        if (subDeptId === params.id) continue // 排除自我引用（经理代表本部门）
        const [sd] = await T.departments
          .select('id', 'name', 'workspace_path')
          .where(and(eq(T.departments.c.id, subDeptId), eq(T.departments.c.app_id, appId)))
          .run()
        if (!sd) continue
        // 子部门成员数 + 最近交付物（根目录 top 10——只读可见性）
        let subMemberCount = 0
        let subFiles: Array<{ name: string; type: string; size: number; mtime: string }> = []
        try {
          const [cnt] = await orm.query.from('department_members').count('*', 'n').where({ department_id: { eq: subDeptId }}).run()
          subMemberCount = Number((cnt as Record<string, unknown> | undefined)?.n ?? 0)
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
    const { orm, appId, params } = ctx
    const T = tables(orm)
    const [dept] = await T.departments
      .select()
      .where(and(eq(T.departments.c.id, params.id), eq(T.departments.c.app_id, appId)))
      .run()
    if (!dept) {
      throw new HttpError('部门不存在', 404)
    }

    // 获取成员列表——JOIN 表绑定
    const members = await orm.query.from('department_members dm')
      .select('a.id', 'a.type', 'a.name', 'a.avatar_url', 'a.description', 'a.role_label', 'a.expertise', 'dm.role', 'dm.joined_at')
      .join('agents a', { 'a.id': { col: 'dm.agent_id' } })
      .where({ 'dm.department_id': { eq: params.id }})
      .run()

    return Response.json({ department: dept, members })
  })

  // ── 更新部门 ─────────────────────────────────────────────

  app.put('/api/departments/:id', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { orm, appId, params } = ctx
    // W2：手写体 → bodyOf patch 变体（全可选——部分更新面——类型从 shape 派生）
    const T = tables(orm)
    const body = await bodyOf(req, T.departments, { variant: 'patch', omit: [] })
    // 产物审批模式切换（2026-12）：关闭时把 .pending 待审产物全部移入共享目录（不丢文件）
    if (body.artifact_review !== undefined) {
      try {
        const [cur] = await T.departments
          .select('artifact_review')
          .where(and(eq(T.departments.c.id, params.id), eq(T.departments.c.app_id, appId)))
          .run()
        const turningOff = (cur as any)?.artifact_review === true && body.artifact_review === false
        if (turningOff) {
          const { sql } = ctx
          const { flushPendingArtifacts } = await import('../services/artifact-review.ts')
          await flushPendingArtifacts(sql, params.id)
        }
      } catch { /* 切换失败不阻断 */ }
    }

    // 部分更新（COALESCE 语义 = 只写显式键——updated_at 由 DB 侧刷新）
    const patch: Record<string, unknown> = { updated_at: ops.now() }
    if (body.name !== undefined) patch.name = body.name
    if (body.artifact_review !== undefined) patch.artifact_review = body.artifact_review
    const [dept] = await orm.query.update('departments')
      .set(patch)
      .where(and({ id: { eq: params.id }}, { app_id: { eq: appId }}))
      .returning('id', 'name', 'artifact_review', 'updated_at')
      .run()

    if (!dept) {
      throw new HttpError('部门不存在', 404)
    }
    return Response.json({ department: dept })
  })

  // ── 删除部门 ─────────────────────────────────────────────

  app.delete('/api/departments/:id', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { orm, appId, params } = ctx
    // R-权限（2026-08——UI 角色测试抓出：删除无任何鉴权——viewer/member
    // 都能删任何部门——矩阵红线：删除 = owner；ROLES-OPTIMIZATION 波次 1：
    // app 级 admin 幽灵角色裁剪——行为不变）
    try {
      const { appRoleOf } = await import('../services/permissions.ts')
      const role = await appRoleOf(ctx)
      if (role !== 'owner') {
        throw new HttpError('只有租户所有者可以删除部门', 403)
      }
    } catch (e: any) {
      return Response.json({ error: e?.message ?? '权限校验失败' }, { status: e?.status ?? 403 })
    }
    const T = tables(orm)
    // 三层模型：部门 = 工作目录 + 计算资源归属——删除前先终止关联 sandbox（rm 容器）
    try {
      const { manager } = await import('../sandbox/manager.ts')
      manager.init(orm)
      await manager.terminateByDepartment(params.id)
    } catch { /* 沙盒清理失败不阻断删除——孤儿清理兜底 */ }
    const result = await T.departments
      .delete()
      .where(and(eq(T.departments.c.id, params.id), eq(T.departments.c.app_id, appId)))
      .run()
    if (result.length === 0) {
      throw new HttpError('部门不存在', 404)
    }
    // 组织层级：部门经理是派生资源——部门亡经理亡（department_members 行 FK cascade 自动清）
    await T.agents
      .delete()
      .where(and(eq(T.agents.c.type, 'department'), eq(T.agents.c.department_id, params.id), eq(T.agents.c.app_id, appId)))
      .run()
    // 三层模型：部门删除 → 工作目录清理（保留期 SANDBOX_WORKSPACE_RETENTION_DAYS 默认 0=立即删）
    try {
      const { resolveDepartmentWorkspace, getDefaultWorkspaceRoot } = await import('../middleware/workspace.ts')
      const ws = await resolveDepartmentWorkspace(params.id, null, true)
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
    const { orm, appId, params, auth } = ctx
    const body = await req.json() as { agent_id: string; role?: string }

    if (!body.agent_id) {
      throw new HttpError('agent_id 为必填', 400)
    }

    const T = tables(orm)
    // 验证部门和 Agent 都属于当前租户
    const [dept] = await T.departments
      .select('id')
      .where(and(eq(T.departments.c.id, params.id), eq(T.departments.c.app_id, appId)))
      .run()
    if (!dept) {
      throw new HttpError('部门不存在', 404)
    }

    const [agent] = await T.agents
      .select('id')
      .where(and(eq(T.agents.c.id, body.agent_id), eq(T.agents.c.app_id, appId)))
      .run()
    if (!agent) {
      throw new HttpError('Agent 不存在', 404)
    }

    // 商业化 G7 知识库部门授权：成员管理（含 KB 添加）必须部门管理员或租户 owner——
    // 防普通成员把知识库/Agent 拉进自己部门造成越权
    const [caller] = await orm.query.from('department_members dm')
      .select('dm.role')
      .join('agents ua', { 'ua.id': { col: 'dm.agent_id' } })
      .where(and(
        { 'dm.department_id': { eq: params.id }},
        { 'ua.user_id': { eq: auth!.userId }},
      ))
      .limit(1)
      .run()
    const Wm = orm.table('_weifuwu_app_members', weifuwuAppMembers)
    const [callerOwner] = await Wm
      .select('role')
      .where(and(eq(Wm.c.app_id, appId), eq(Wm.c.user_id, auth!.userId)))
      .run()
    // 部门级 admin（department_members.role——合法——勿与租户级幽灵 admin 裁剪混淆——ROLES-OPTIMIZATION 波次 1）
    if ((!caller || caller.role !== 'admin') && (callerOwner as any)?.role !== 'owner') {
      throw new HttpError('只有部门管理员可以管理成员', 403)
    }

    await T.department_members
      .insert({ department_id: params.id, agent_id: body.agent_id, role: body.role ?? 'member' })
      .onConflict(['department_id', 'agent_id'], true)
      .run()

    // 组织层级：成员变化 → 刷新部门经理提示词（成员名单实时化）
    try {
      const { refreshManagerPrompt } = await import('../services/org-manager.ts')
      await refreshManagerPrompt(orm, appId, params.id)
    } catch { /* 刷新失败不阻断 */ }

    return Response.json({ success: true })
  })

  // ── 移除成员 ─────────────────────────────────────────────

  app.delete('/api/departments/:id/members/:agentId', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { orm, appId, params } = ctx

    const T = tables(orm)
    // 验证部门属于当前租户
    const [dept] = await T.departments
      .select('id')
      .where(and(eq(T.departments.c.id, params.id), eq(T.departments.c.app_id, appId)))
      .run()
    if (!dept) {
      throw new HttpError('部门不存在', 404)
    }

    await T.department_members
      .delete()
      .where(and(eq(T.department_members.c.department_id, params.id), eq(T.department_members.c.agent_id, params.agentId)))
      .run()

    // 组织层级：成员变化 → 刷新部门经理提示词（成员名单实时化）
    try {
      const { refreshManagerPrompt } = await import('../services/org-manager.ts')
      await refreshManagerPrompt(orm, appId, params.id)
    } catch { /* 刷新失败不阻断 */ }

    return Response.json({ success: true })
  })

  // ── 产物审批（2026-12）：AI 产出 → 批准发布 / 拒绝删除 ────────────
  // artifact_review 模式下 AI 的写入落在 .pending 待审区——批准 = 移动至共享目录
  app.get('/api/departments/:id/artifacts/pending', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { orm, appId, params } = ctx
    const T = tables(orm)
    const [dept] = await T.departments
      .select('id')
      .where(and(eq(T.departments.c.id, params.id), eq(T.departments.c.app_id, appId)))
      .run()
    if (!dept) throw new HttpError('部门不存在', 404)
    const { sql } = ctx
    const { listPendingArtifacts } = await import('../services/artifact-review.ts')
    const items = await listPendingArtifacts(sql, params.id)
    return Response.json({ pending: items })
  })

  app.post('/api/departments/:id/artifacts/:action', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { orm, appId, params, auth } = ctx
    const action = params.action as 'approve' | 'reject'
    if (!['approve', 'reject'].includes(action)) throw new HttpError('不支持的 action', 400)
    const T = tables(orm)
    const [dept] = await T.departments
      .select('id')
      .where(and(eq(T.departments.c.id, params.id), eq(T.departments.c.app_id, appId)))
      .run()
    if (!dept) throw new HttpError('部门不存在', 404)
    // 产物审批是管理动作（G7 同款权限）：部门管理员或租户 owner 才能批准/拒绝
    const [caller] = await orm.query.from('department_members dm')
      .select('dm.role')
      .join('agents ua', { 'ua.id': { col: 'dm.agent_id' } })
      .where(and(
        { 'dm.department_id': { eq: params.id }},
        { 'ua.user_id': { eq: auth!.userId }},
      ))
      .limit(1)
      .run()
    const [callerOwner] = await orm.table('_weifuwu_app_members', weifuwuAppMembers)
      .select('role')
      .where({ app_id: { eq: appId }, user_id: { eq: auth!.userId }})
      .run()
    // 部门级 admin（department_members.role——合法——勿与租户级幽灵 admin 裁剪混淆——ROLES-OPTIMIZATION 波次 1）
    if ((!caller || caller.role !== 'admin') && (callerOwner as any)?.role !== 'owner') {
      throw new HttpError('只有部门管理员可以审批产物', 403)
    }
    const body = await req.json().catch(() => ({}))
    const relPath = String(body.path ?? '')
    const { sql } = ctx
    const { approveArtifact, rejectArtifact } = await import('../services/artifact-review.ts')
    const r = action === 'approve'
      ? await approveArtifact(sql, params.id, relPath)
      : await rejectArtifact(sql, params.id, relPath)
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 })
    return Response.json({ success: true, path: relPath })
  })
}

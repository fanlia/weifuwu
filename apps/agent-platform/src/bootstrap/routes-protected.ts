/**
 * 受保护路由 + 启动副作用（server.ts 拆分 W1——需登录 + 租户隔离面）
 *
 * protectedRoutes 装配（onError/requireAuth/租户拦截）+ 11 个 register
 * 模块 + gql + workflow + messager + 内联 route + timer/恢复副作用。
 * 行为零变化（机械提取——平台 475 验证）。
 */
import { Router, errorResponse, workflowSystem, messager, ops, HttpError, email, ui, verifyPassword, hashPassword, WEIFUWU_WORKFLOW_SCHEMA, WEIFUWU_MESSAGER_SCHEMA } from 'weifuwu'
import type { Context } from 'weifuwu'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleWebhookMessage } from '../services/webhook.ts'
import type { AppCtx } from '../middleware/ctx.ts'
import type { PlatformDeps } from './deps.ts'
import { tables } from '../db/orm.ts'
import { registerAgentRoutes } from '../routes/agents.ts'
import { registerWorkspaceRoutes } from '../routes/workspace.ts'
import { registerDepartmentRoutes } from '../routes/departments.ts'
import { registerDemoRoutes } from '../routes/demo.ts'
import { registerSandboxRoutes } from '../routes/sandboxes.ts'
import { registerAiEventRoutes } from '../routes/ai-events.ts'
import { registerMessageRoutes } from '../routes/messages.ts'
import { registerKnowledgeRoutes } from '../routes/knowledge.ts'
import { registerSurveyRoutes } from '../routes/survey.ts'
import { registerSkillRoutes } from '../routes/skills.ts'
import { registerRoleTemplateRoutes } from '../routes/role-templates.ts'
import { registerAdminRoutes } from '../routes/admin.ts'
import { registerStatsRoutes } from '../routes/stats.ts'
import { registerDeliverableRoutes } from '../routes/deliverables.ts'
import { registerUiRoutes } from '../ui/routes.ts'

export async function registerProtectedRoutes(app: Router<AppCtx>, deps: PlatformDeps): Promise<void> {
  const { pg, redisClient, eventsPg, currentCtx } = deps
  const __dirname = dirname(fileURLToPath(import.meta.url)) + '/../..'

  const protectedRoutes = new Router<AppCtx>()
  // W0：受保护面错误链（与主 app 同面）
  protectedRoutes.onError((e: unknown) => errorResponse(e))
  // 登录保护（框架 ctx.auth.requireAuth：未登录抛 401）
  protectedRoutes.use((req: Request, ctx: Context, next: any) => {
    ;(ctx as unknown as AppCtx).auth.requireAuth()
    return next(req, ctx)
  })
  // 商业化 G2：租户停用拦截（status='disabled' → 403——管理后台停用即全租户不可用）
  // 管理面豁免：/api/admin/* 不受租户停用影响（管理员停用后仍需能恢复）
  protectedRoutes.use(async (req: Request, ctx: Context, next: any) => {
    if (String(req.url ?? '').includes('/api/admin/')) return next(req, ctx)
    const c = ctx as unknown as AppCtx
    if (c.appId) {
      const rows = await c.orm.query.from('_weifuwu_apps').select('status').where({ id: { eq: c.appId } }).run()
      if (rows[0]?.status === 'disabled') {
        throw new HttpError('该团队已被停用，请联系管理员', 403)
      }
    }
    return next(req, ctx)
  })
  // 公司
  // Agent
  registerAgentRoutes(protectedRoutes)

  // ── W5：/api/gql —— agents 声明式 GraphQL 面（orm.gql——样板 resolver 生成；
  //   租户 scope 自动注入（contextValue.appId）+ webhook_secret hidden 豁免；
  //   复杂查询（token 聚合等）仍走手写 route——分层纪律） ──
  // 注意：tables(pg.orm) 先行使注册（平台注册面是惰性的——route 处理时注册；
  //   registry 幂等——route 面共享实例——启动路径先行调用是安全的）
  const agentGql = pg.orm.gql(tables(pg.orm).agents, { hidden: ['webhook_secret'] })
  protectedRoutes.graphql('/api/gql', async (_req, ctx) => ({
    schema: agentGql.typeDefs,
    resolvers: agentGql.resolvers,
    context: () => ({ orm: (ctx as unknown as AppCtx).orm, appId: (ctx as unknown as AppCtx).appId }),
  }))

  // ── workflow 系统（框架：引擎存储/编排——routes 必须在 mount 前注册——mount 快照收集） ──
  const workflowSystemInstance = workflowSystem({
    orm: pg.orm,
    redis: redisClient?.redis, // store 步骤后端（Redis 客户端——自动适配 KVStore）
  })
  app.use(workflowSystemInstance)
  await pg.migrateModule('weifuwu-workflows', WEIFUWU_WORKFLOW_SCHEMA)
  workflowSystemInstance.routes(protectedRoutes) // 缺省：/api/workflows + ctx.auth.appId（user 会话透传）
  workflowSystemInstance.scheduler.start() // cron 定时触发（tick 30s 幂等）
  // 工作空间文件浏览器
  await registerWorkspaceRoutes(protectedRoutes)
  // 部门
  registerDepartmentRoutes(protectedRoutes)
  // 一键演示空间（G-A 冷启动）
  registerDemoRoutes(protectedRoutes)
  // P1 任务执行总览：部门执行状态聚合（复用 sandbox_events/runningExecs/产物 mtime）
  protectedRoutes.get('/api/departments/:id/executions', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { orm, appId, params } = ctx
    const [dept] = await orm.query.from('departments').select('id').where({ id: { eq: params.id }, app_id: { eq: appId } }).run()
    if (!dept) throw new HttpError('部门不存在', 404)
    const { manager } = await import('../sandbox/manager.ts')
    manager.init(orm)
    const { sandbox } = await import('../sandbox/docker.ts')
    // 成员（ai/department——可执行角色）
    const members = await orm.query.from('department_members dm')
      .join('agents a', { 'a.id': { col: 'dm.agent_id' } })
      .select('a.id', 'a.name', 'a.role_label', 'a.type', 'a.department_id')
      .where({ 'dm.department_id': { eq: params.id }, 'a.type': { in: ['ai', 'department'] } }).run()
    // 部门最近**用户**消息时间（任务派发起点——AI 回复会推后时间导致早期完成者误判 stalled）
    const [lastMsg] = await orm.query.from('messages m')
      .join('agents a', { 'a.id': { col: 'm.sender_id' } })
      .max('m.created_at', 'at')
      .where({ 'm.department_id': { eq: params.id }, 'a.type': { eq: 'user' } }).run()
    const taskStart = lastMsg?.at ? new Date(String(lastMsg.at)).getTime() : Date.now()
    const now = Date.now()
    const tasks = []
    for (const m of members ?? []) {
      const agentId = String((m as any).id)
      const execDeptId = (m as any).department_id ? String((m as any).department_id) : params.id
      // 执行归属沙盒（角色独立部门沙盒 / 当前部门沙盒）
      let sb = null
      try { sb = await manager.byDepartment(execDeptId) } catch { sb = null }
      const running = sb ? sandbox.runningExecs.get(String(sb.id)) ?? null : null
      // 最近事件（exec 链路）
      let lastEvent: { type: string; detail: string | null; created_at: string } | null = null
      let recentFailed = false
      if (sb) {
        const events = await manager.eventHistory(String(sb.id), 10)
        lastEvent = events[0] ?? null
        recentFailed = events.some((e) => (e.type.includes('error') || e.type.includes('timeout')) && now - new Date(e.created_at).getTime() < 10 * 60_000)
      }
      // 产物文件（执行归属目录最新文件 mtime）
      let artifact: { path: string; mtime: number } | null = null
      try {
        const { resolveDepartmentWorkspace } = await import('../middleware/workspace.ts')
        const ws = await resolveDepartmentWorkspace(execDeptId, null, true)
        if (ws) {
          const { readdir, stat } = await import('node:fs/promises')
          const { join } = await import('node:path')
          const entries = await readdir(ws).catch(() => [])
          let latest: { path: string; mtime: number } | null = null
          for (const e of entries) {
            if (e.startsWith('.')) continue
            try {
              const st = await stat(join(ws, e))
              if (st.isFile() && (!latest || st.mtimeMs > latest.mtime)) latest = { path: e, mtime: st.mtimeMs }
            } catch { /* 跳过 */ }
          }
          artifact = latest
        }
      } catch { /* 产物扫描失败 */ }
      // 状态推导（2026-12）：working > failed > done > stalled > waiting > idle
      let status: 'working' | 'failed' | 'done' | 'stalled' | 'waiting' | 'idle' = 'idle'
      const artifactNew = artifact && artifact.mtime > taskStart
      if (running) status = 'working'
      else if (recentFailed && !artifactNew) status = 'failed'
      else if (artifactNew) status = 'done'
      else if (now - taskStart > 5 * 60_000 && !artifactNew) status = 'stalled'
      else if (now - taskStart > 30_000) status = 'waiting'
      tasks.push({
        agentId, name: String((m as any).name), roleLabel: (m as any).role_label ?? null,
        type: String((m as any).type),
        status,
        runningExec: running ? { tool: running.tool, elapsedMs: now - running.startedAt, timeoutMs: running.timeoutMs } : null,
        lastEvent: lastEvent ? { type: lastEvent.type, detail: lastEvent.detail, created_at: lastEvent.created_at } : null,
        artifact: artifactNew && artifact ? { path: artifact.path, mtime: new Date(artifact.mtime).toISOString() } : null,
      })
    }
    const done = tasks.filter((t) => t.status === 'done').length
    return Response.json({ tasks, progress: { done, total: tasks.length } })
  })
  // 沙盒（一级概念：计算资源——CRUD + 生命周期操作）
  registerSandboxRoutes(protectedRoutes)
  // 宿主上报（集群化阶段 2：CENTER_URL 配置时连接中心——单机直连模式零影响）
  const { startHostReporting } = await import('../sandbox/host-client.ts')
  startHostReporting()
  // 宿主健康检查（阶段 4：定期——事件流心跳超时 → host:down/up）
  const { checkHostHealth } = await import('../sandbox/host-health.ts')
  const healthTimer = setInterval(() => {
    const r = checkHostHealth()
    if (r.down.length > 0 || r.up.length > 0) {
      console.log(`[sandbox] 宿主健康：down=${r.down.join(',') || '-'} up=${r.up.join(',') || '-'}`)
    }
  }, 60_000)
  healthTimer.unref?.()
  // AI 事件流（三端打通——vdom + ai + sandbox）
  registerAiEventRoutes(protectedRoutes)
  // 三端事件契约（精密配合——AI 工具决策 → 沙盒预热；exec 超时 → 跨层标注）
  const { registerBrowserWarmContract, registerExecTimeoutContract, startEventContracts } = await import('../services/event-contracts.ts')
  registerBrowserWarmContract()
  registerExecTimeoutContract()
  startEventContracts()
  // 消息
  registerMessageRoutes(protectedRoutes)
  // 知识库
  registerKnowledgeRoutes(protectedRoutes)
  registerSurveyRoutes(protectedRoutes)
  // S1：server 启动恢复——running campaign 标记 interrupted（不留孤儿循环——retry API 恢复）
  setImmediate(async () => {
    try {
      const { markInterrupted } = await import('../services/survey-campaign.ts')
      const n = await markInterrupted({ sql: pg, appId: '' } as any)
      if (n > 0) console.log(`[campaign] 启动恢复：${n} 个运行中 campaign 标记 interrupted（可 retry 恢复）`)
    } catch { /* 恢复失败不阻断 */ }
  })
  // Skills
  registerSkillRoutes(protectedRoutes)
  // 角色模板
  registerRoleTemplateRoutes(protectedRoutes)
  // 商业化 G2：租户管理后台（平台管理员 ADMIN_EMAILS）
  registerAdminRoutes(protectedRoutes)
  registerStatsRoutes(protectedRoutes) // G3：统计/报表/埋点路由（纯迁移——行为不变）
  registerDeliverableRoutes(app)

  // ── 审计日志（Wave 9——安全/合规：登录/Agent 变更记录） ──
  // ── 运营详情：沙盒状态 + 今日审计（受保护） ─────────────
  protectedRoutes.get('/api/ops', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    const { getLicenseInfo } = await import('../services/license.ts')
    const licenseInfo = getLicenseInfo()
    let sandboxInfo: Record<string, any> = { available: false }
    try {
      const { sandbox } = await import('../sandbox/docker.ts')
      const st = await sandbox.status()
      sandboxInfo = { available: st.available, enabled: st.enabled, imageReady: st.imageReady, mode: st.mode, poolSize: st.poolSize, maxContainers: st.maxContainers }
    } catch { /* 沙盒不可用 */ }
    let auditToday = 0
    try {
      const [row] = await ctx.orm.query.from('audit_logs').count('*', 'n').where({ created_at: { gte: ops.nowAgo(1, 'day') }, app_id: { eq: ctx.appId } }).run()
      auditToday = Number((row as any)?.n ?? 0)
    } catch { /* 无审计表 */ }
    return Response.json({ sandbox: sandboxInfo, auditToday, license: licenseInfo })
  })

  protectedRoutes.get('/api/audit', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { listAudit } = await import('../services/audit.ts')
    const url = new URL(req.url ?? '', 'http://localhost')
    const limit = Number(url.searchParams.get('limit') ?? 50)
    const action = url.searchParams.get('action') ?? undefined
    // C3 时间范围筛选（from/to——ISO 格式——非法值 400 不透穿到 SQL）
    const from = url.searchParams.get('from') ?? undefined
    const to = url.searchParams.get('to') ?? undefined
    for (const [k, v] of [['from', from], ['to', to]] as const) {
      if (v !== undefined && Number.isNaN(Date.parse(v))) {
        return Response.json({ error: `${k} 非法（需 ISO 时间格式）` }, { status: 400 })
      }
    }
    const result = await listAudit(ctx, { limit, action, from, to })
    return Response.json(result)
  })

  // 商业化 G4：租户 BYOK 配置（自带模型 Key/端点——Settings 设置）
  protectedRoutes.get('/api/settings/ai-config', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    const { getByokConfig } = await import('../services/byok.ts')
    const cfg = await getByokConfig(ctx.orm, ctx.appId)
    return Response.json({ baseUrl: cfg?.base_url ?? '', apiKey: cfg?.api_key ? '******' : '', apiKeySet: !!cfg?.api_key, model: cfg?.model ?? '' })
  })

  protectedRoutes.put('/api/settings/ai-config', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { orm, appId } = ctx
    const body = await req.json() as { baseUrl?: string; apiKey?: string; model?: string; clear?: boolean }
    if (body.clear) {
      await orm.query.delete('app_ai_configs').where({ app_id: { eq: appId } }).run()
      return Response.json({ ok: true, cleared: true })
    }
    // 已存 key 不回显：apiKey 为空 = 保持原值
    const [cur] = await orm.query.from('app_ai_configs').select('api_key').where({ app_id: { eq: appId } }).run()
    const finalKey = body.apiKey?.trim() ? body.apiKey.trim() : String((cur as any)?.api_key ?? '')
    await orm.query.insert('app_ai_configs').rows([
      { app_id: appId, base_url: body.baseUrl?.trim() ?? null, api_key: finalKey || null, model: body.model?.trim() ?? null, updated_at: ops.now() },
    ]).onConflict('app_id', true).run()
    try {
      const { writeAudit } = await import('../services/audit.ts')
      await writeAudit(ctx as any, { action: 'byok_update', target_type: 'app', target_id: appId, detail: { baseUrl: body.baseUrl ?? null, model: body.model ?? null } })
    } catch { /* 尽力 */ }
    return Response.json({ ok: true })
  })

  // 商业化 G6：审计日志 CSV 导出（合规——数据可带走）
  protectedRoutes.get('/api/audit/export', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { listAudit } = await import('../services/audit.ts')
    const url = new URL(req.url ?? '', 'http://localhost')
    const action = url.searchParams.get('action') ?? undefined
    const { entries } = await listAudit(ctx, { limit: 100, action })
    const esc = (v: unknown) => { const s = String(v ?? ''); return `"${s.replace(/"/g, '""')}"` }
    const head = '时间,操作,操作人,目标类型,详情'
    const rows = (entries as any[]).map((e) => [
      e.created_at ?? '', e.action ?? '', e.user_name ?? '', e.target_type ?? '',
      JSON.stringify(e.detail ?? ''),
    ].map(esc).join(','))
    const csv = '\uFEFF' + [head, ...rows].join('\n')
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="audit-${ctx.appId.slice(0, 8)}-${Date.now()}.csv"`,
      },
    })
  })

  // ── 用户设置 ─────────────────────────────────────────────
  // 更新个人资料
  protectedRoutes.put('/api/auth/profile', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { orm, auth } = ctx
    const body = await req.json() as { name?: string }
    if (!body.name?.trim()) {
      throw new HttpError('name 不能为空', 400)
    }
    // 框架用户表（_weifuwu_users）——应用层更新扩展字段
    const [user] = await orm.query.update('_weifuwu_users').set({ name: body.name.trim() })
      .where({ id: { eq: auth.userId } }).returning('id', 'email', 'name', 'role', 'created_at').run()
    return Response.json({ user })
  })

  // ── R10 GDPR：数据导出（用户可带走自己的数据） ───────────

  protectedRoutes.get('/api/auth/export', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    const { orm, auth } = ctx
    const uid = auth!.userId
    const [profile] = await orm.query.from('_weifuwu_users').select('id', 'email', 'name', 'created_at').where({ id: { eq: uid } }).run()
    const memberships = await orm.query.from('_weifuwu_app_members m')
      .join('_weifuwu_apps a', { 'a.id': { col: 'm.app_id' } })
      .select('a.slug', 'a.name', 'm.role')
      .where({ 'm.user_id': { eq: uid } }).run()
    const agents = await orm.query.from('agents').select('id', 'app_id', 'type', 'name', 'description', 'created_at').where({ user_id: { eq: uid } }).run()
    const messages = await orm.query.from('messages m')
      .join('agents a', { 'a.id': { col: 'm.sender_id' } })
      .select('m.id', 'm.department_id', 'm.content', 'm.msg_type', 'm.created_at')
      .where({ 'a.user_id': { eq: uid } }).run()
    const data = { profile, memberships, agents, messages }
    return new Response(JSON.stringify(data, null, 2), {
      headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="my-data.json"' },
    })
  })

  // ── R10 GDPR：账号删除（匿名化级联——保留业务数据，去用户身份） ──

  protectedRoutes.delete('/api/auth/account', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    const { orm, auth } = ctx
    const uid = auth!.userId
    // 1) 匿名化平台账号（email 唯一约束 → 用 deleted-{id} 占位；密码失效）
    await orm.query.update('_weifuwu_users').set({ email: `deleted-${String(uid).slice(0, 8)}@deleted.local`, name: '已删除用户', password_hash: null }).where({ id: { eq: uid } }).run()
    // 2) 停用绑定的 user Agent（消息历史 sender 不再关联真实身份）
    await orm.query.update('agents').set({ is_active: false, name: '已删除用户' }).where({ user_id: { eq: uid } }).run()
    // 3) 移除成员关系
    await orm.query.delete('_weifuwu_app_members').where({ user_id: { eq: uid } }).run()
    // 4) 清除会话（refresh token 失效）
    await orm.query.delete('_weifuwu_sessions').where({ user_id: { eq: uid } }).run()
    // 审计（用户 id 已匿名——记录 app 级事件）
    try {
      const { writeAudit } = await import('../services/audit.ts')
      await writeAudit(ctx as any, { action: 'account_deleted', target_type: 'user', target_id: String(uid), detail: {} })
    } catch { /* 尽力 */ }
    return Response.json({ success: true, message: '账号已删除（数据已匿名化）' })
  })

  // 修改密码
  protectedRoutes.put('/api/auth/password', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { orm, auth } = ctx
    const body = await req.json() as { currentPassword: string; newPassword: string }
    if (!body.currentPassword || !body.newPassword) {
      throw new HttpError('currentPassword 和 newPassword 为必填', 400)
    }
    if (body.newPassword.length < 6) {
      throw new HttpError('新密码至少 6 位', 400)
    }

    const [user] = await orm.query.from('_weifuwu_users').select('password_hash').where({ id: { eq: auth.userId } }).run()
    if (!user) throw new HttpError('用户不存在', 404)

    const valid = await verifyPassword(body.currentPassword, user.password_hash as string)
    if (!valid) {
      throw new HttpError('当前密码错误', 403)
    }

    // 业务侧（appAuth 薄面）无 AuthApi 方法面——密码更新为通用原语（hashPassword 导出）
    const newHash = await hashPassword(body.newPassword)
    await orm.query.update('_weifuwu_users').set({ password_hash: newHash }).where({ id: { eq: auth.userId } }).run()
    return Response.json({ success: true })
  })


  // ── 沙盒监控/管理 API（管理员——容器状态/资源/进程/操作） ──
  protectedRoutes.get('/api/sandbox/containers', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    const { sandbox } = await import('../sandbox/docker.ts')
    const { orm } = ctx
    const containers = await sandbox.listContainers()
    // 容器名 → agent 名映射（ap-sandbox-{agentId}）
    const ids = containers.map((c) => String(c.name ?? '').replace('ap-sandbox-', ''))
    const agents = ids.length > 0
      ? await orm.query.from('agents').select('id', 'name', 'type').where({ id: { in: ids } }).run()
      : []
    const agentMap = new Map((Array.isArray(agents) ? agents : []).map((a: any) => [String(a.id), String(a.name ?? a.id)]))
    // 逐个取资源统计（docker stats 逐容器——上限 20 个，串行快）
    const withStats = []
    for (const c of containers) {
      const stats = await sandbox.containerStats(String(c.name))
      withStats.push({
        name: c.name, status: c.status, image: c.image, createdAt: c.createdAt,
        agentName: agentMap.get(String(c.name).replace('ap-sandbox-', '')) ?? '未知',
        ...(stats ?? {}),
      })
    }
    return Response.json({ containers: withStats })
  })

  protectedRoutes.get('/api/sandbox/containers/:name/processes', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sandbox } = await import('../sandbox/docker.ts')
    const procs = await sandbox.containerProcesses(ctx.params.name)
    return Response.json({ name: ctx.params.name, processes: procs })
  })

  protectedRoutes.post('/api/sandbox/containers/:name/:action', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sandbox } = await import('../sandbox/docker.ts')
    const action = ctx.params.action as 'stop' | 'start' | 'restart' | 'rm'
    if (!['stop', 'start', 'restart', 'rm'].includes(action)) {
      throw new HttpError('不支持的 action', 400)
    }
    const r = await sandbox.containerAction(ctx.params.name, action)
    return r.ok ? Response.json(r) : Response.json({ error: r.message }, { status: 400 })
  })


  // 挂载受保护路由
  app.mount('/', protectedRoutes)

  // ── WebSocket（框架 messager：房间广播 + Redis 跨进程） ──
  // M10：transaction 注入（pg.transaction——连接级——会话+成员建库原子——
  // 原框架内 BEGIN/COMMIT unsafe 在池化下断裂——2027-XX 修复）
  const messagerSystem = messager({ orm: pg.orm, redis: redisClient?.redis })
  await pg.migrateModule('weifuwu-messager', WEIFUWU_MESSAGER_SCHEMA)
  app.use(messagerSystem)


  // ── 邮件通知（商业化 G5：审批请求通知）——API 发送（不直连 SMTP）——无 key 时降级 no-op ──
  app.use(email({
    from: process.env.EMAIL_FROM ?? 'no-reply@agent-platform.local',
    ...(process.env.EMAIL_API_KEY || process.env.RESEND_API_KEY
      ? { apiKey: process.env.EMAIL_API_KEY ?? process.env.RESEND_API_KEY }
      : { adapter: (async () => ({ ok: true, id: 'noop' })) as any }),  // 未配置：no-op（不阻断）
  }))
  app.ws('/ws', messagerSystem.client.handler())

  // ── 测试钩子（仅 WF_TEST_HOOKS=1——确定性 wf:* 事件注入——UI 回归用——
  //   不依赖真实 LLM——共享 server spawn 时开启） ──
  if (process.env.WF_TEST_HOOKS === '1') {
    // 测试种子 SQL（仅钩子模式——测试直插改发服务端库（memory 模式下测试进程与
    // 服务端不共享库——直插真库失效）；生产无此面（WF_TEST_HOOKS 未设））
    // 认证：仅本机测试约定（无 token——与 wf 钩子同信任面；端点不接受查询/结构性外传）
    app.post('/api/test/orm', async (req: Request) => {
      try {
        const body = await req.json() as { query?: unknown }
        if (!body.query || typeof body.query !== 'object') throw new HttpError('query 必填（Query AST）', 400)
        const rows = await pg.orm.execute(body.query as never)
        return Response.json({ ok: true, rows })
      } catch (e: any) {
        return Response.json({ error: String(e?.message ?? e) }, { status: 500 })
      }
    })
    app.post('/api/test/wf', async (req: Request) => {
      try {
        const body = await req.json() as { room?: string; events?: any[] }
        if (!body.room || !Array.isArray(body.events)) throw new HttpError('room/events 必填', 400)
        for (const evt of body.events) messagerSystem.client.broadcast(body.room, evt)
        return Response.json({ ok: true, pushed: body.events.length })
      } catch (e: any) {
        return Response.json({ error: String(e?.message ?? e) }, { status: 500 })
      }
    })
  }

  // ── sandbox 集群（阶段 2）：宿主上报端点（sandbox-host 进程连接——
  //  接收事件 → 中心聚合缓冲——跨宿主统一查询） ──
  app.ws('/sandbox-host', {
    open: (ws: any) => {
      ws.send(JSON.stringify({ type: 'host:ack' }))
    },
    message: async (_ws: any, _ctx: any, data: string | Buffer) => {
      try {
        const msg = JSON.parse(String(data))
        const { hostEventIngest } = await import('../sandbox/events.ts')
        if (msg?.type === 'sandbox:event' && msg.event?.entity === 'sandbox') {
          hostEventIngest(msg.event)
        } else if (msg?.type === 'host:ping') {
          // 心跳（阶段 4：宿主活跃证明——health 检测用）
          const { sandboxEmit } = await import('../sandbox/events.ts')
          sandboxEmit('host:ping', msg.hostId, { hostId: msg.hostId, ts: msg.ts })
        } else if (msg?.type === 'host:register') {
          // 宿主注册（容量视图——调度器基础）
          const { sandboxEmit } = await import('../sandbox/events.ts')
          sandboxEmit('host:register', undefined, { hostId: msg.hostId, capacity: msg.capacity, at: new Date().toISOString() })
        }
      } catch { /* 解析失败忽略 */ }
    },
  })

  // ── 问卷实时联动 WS（框架 router.ws + hub 房间——逐题同步/提交锁定） ──
  app.ws('/survey-live', {
    open: (ws: any, ctx: any) => {
      ctx.hub.join('survey-live', ws)
      surveyHub = ctx.hub
      // 2027-09 实证（历史提交污染——新 campaign 角色被旧提交锁死）：
      // open 时预发的是**无 campaign 过滤**的全局 state——其中含历史 campaign
      // 的同源提交 → 页面 onMessage 的 lock 判定（submissions.find(source)）
      // 命中旧提交 → 页面显示「已提交（#旧id）」→ 角色停止提交 → 新 campaign
      // 任务超时失败（c1b2fadf 实测：同一角色 4 次尝试全部假完成）。
      // 修复：open 不再预发 state——页面一律在 hello 中带 campaign 视角请求
      // （form/stats 页面连接后均发 hello）——全局视角仅在没有 ?c= 时返回。
    },
    message: async (ws: any, ctx: any, data: string | Buffer) => {
      try {
        const msg = JSON.parse(String(data))
        // 心跳：ping → pong（前端 ws 中间件 30s ping + 10s 无响应主动断线——
        // 无 pong → 每 ~40s 断线重连循环——真实 bug：统计页静置时反复断线）
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }))
          return
        }
        // 在线报到：填写页连接后发 hello（统计页只订阅不发——不计入在线）
        if (msg.type === 'survey:hello' && msg.source) {
          const source = String(msg.source).slice(0, 40)
          // 统计页看客（source='stats-view'）不入在线列表——只回视角状态
          // （实证：统计页 hello 被当填写者——在线列表出现 'stats-view'——污染）
          // 同来源重连去重（WS 重连时旧连接 close 可能延迟——先移除同 source 旧连接，
          // 否则在线人数虚高/列表重复——真实 bug：AI 浏览器重连后同角色出现两次）
          for (const [w, v] of surveyOnline) {
            if (v.source === source && w !== ws) {
              surveyOnline.delete(w)
              try { w.close() } catch { /* 已断 */ }
            }
          }
          if (source === 'stats-view') {
            ws.send(JSON.stringify(surveyState(String(msg.campaign ?? ''))))
            return
          }
          surveyOnline.set(ws, { source, at: new Date().toISOString() })
          surveyBroadcastOnline()
          // 统计页/填写页在 hello 带 campaign 视角（?c=）——服务端回该 campaign 过滤的
          // 全量状态（2027-09：campaign 粒度统计——不叠加——每次任务独立计数）
          if (msg.campaign !== undefined) {
            ws.send(JSON.stringify(surveyState(String(msg.campaign ?? ''))))
          } else {
            ws.send(JSON.stringify(surveyState()))
          }
          return
        }
        if (msg.type === 'survey:answer' && msg.question) {
          // 逐题同步：填写页每完成一题 → 广播（统计页实时滚动）+ 刷新活动时间
          const cur = surveyOnline.get(ws)
          if (cur) { cur.at = new Date().toISOString() }
          const record = {
            source: String(msg.source ?? '访客'),
            question: String(msg.question).slice(0, 100),
            answer: String(msg.answer ?? '').slice(0, 300),
            at: new Date().toISOString(),
            campaign: String(msg.campaign ?? ''),
          }
          surveyAnswers.push(record)
          if (surveyAnswers.length > surveyLimit) surveyAnswers.splice(0, surveyAnswers.length - surveyLimit)
          void pg.orm.query.insert('survey_answers').values({ source: String(record.source), question: String(record.question), answer: String(record.answer), campaign_id: String(record.campaign) || null }).run().catch((e: any) => {
            console.error('[survey] 逐题落库失败:', e?.message ?? e)
          })
          surveyBroadcast({ type: 'survey:answer', ...record })
        } else if (msg.type === 'survey:submit' && msg.data) {
          // 提交：入内存 + 广播（统计页计数 +1、来源锁定）
          const d = msg.data
          // campaign 归属双保险：URL 带 c（页面传递）失败时——按 source（角色名）
          // 反查最近 run 的 campaign_id（实证：角色不完全用消息 URL——c 参数丢失——
          // 50 条提交 campaign_id 全空——反查兜底后归属可靠）
          let campId = String(d.campaign ?? '')
          if (!campId) {
            try {
              const [rr] = await pg.orm.query.from('survey_campaign_runs').where({ agent_name: { eq: String(msg.source ?? '') } }).select('campaign_id').orderBy('created_at', 'desc').limit(1).run()
              campId = rr ? String(rr.campaign_id) : ''
            } catch { /* 反查失败走空 */ }
          }
          const record = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            source: String(msg.source ?? '访客'),
            submitted_at: new Date().toISOString(),
            age: String(d.age ?? ''), industry: String(d.industry ?? ''), rating: Number(d.rating ?? 0),
            focus: Array.isArray(d.focus) ? d.focus : (d.focus ? [d.focus] : []),
            feedback: String(d.feedback ?? '').slice(0, 500),
            campaign: campId,
          }
          surveySubmissions.push(record)
          if (surveySubmissions.length > surveyLimit) surveySubmissions.splice(0, surveySubmissions.length - surveyLimit)
          surveyTotal++
          // await 落库（2027-09 实证：fire-and-forget + 静默 catch 曾吞掉落库失败——
          // 完成信号依赖该行（campaign 扫描 survey_submissions）——失败必须可见）
          try {
            await pg.orm.query.insert('survey_submissions').values({ id: String(record.id), source: String(record.source), age: String(record.age), industry: String(record.industry), rating: Number(record.rating), focus: (() => { try { return JSON.parse(String(record.focus)) } catch { return String(record.focus) } })(), feedback: String(record.feedback), submitted_at: String(record.submitted_at), campaign_id: String(record.campaign) || null }).run()
          } catch (e: any) {
            console.error('[survey] 提交落库失败（完成信号丢失风险——source=%s id=%s）:', String(record.source), String(record.id), e?.message ?? e)
          }
          surveyBroadcast({ type: 'survey:submitted', count: surveyTotal, latest: record, aggregate: surveyAggregate() })
          // 提交后保持在线（浏览器未关——ws 连接保持——统计页在线显示已提交状态——
          // 下线只发生在 close/bye：用户要求"只要填写者还没关闭浏览器就应该显示在线"）
          const cur = surveyOnline.get(ws)
          if (cur) {
            cur.submitted = true
            cur.at = new Date().toISOString()
            surveyBroadcastOnline()
          }
        }
        // 显式 bye（页面主动离开）
        if (msg.type === 'survey:bye') {
          if (surveyOnline.delete(ws)) surveyBroadcastOnline()
        }
      } catch { /* 解析失败忽略 */ }
    },
    close: (ws: any, ctx: any) => {
      ctx.hub.leave(ws)
      if (surveyOnline.delete(ws)) surveyBroadcastOnline()   // 下线 → 实时更新在线人数
    },
  })

  // ── Webhook 入口 ───────────────────────────────────────

  app.post('/api/webhook/:agentId', async (req: Request, ctx: AppCtx): Promise<Response> => {
    try {
      // B3：请求体大小限制（64KB）——防滥用
      const contentLength = Number(req.headers.get('content-length') ?? 0)
      if (contentLength > 64 * 1024) {
        throw new HttpError('Request body too large (max 64KB)', 413)
      }
      const body = await req.json()
      // R3 计量收口：Webhook 调用受计划配额约束（免费版到期/超限 → 402）
      const { planBlockForApp } = await import('../services/webhook.ts')
      const [whAgent] = await ctx.orm.query.from('agents').where({ id: { eq: ctx.params.agentId }, type: { eq: 'webhook' } }).select('app_id').limit(1).run()
      const whAppId = whAgent ? String(whAgent.app_id ?? '') : ''
      if (whAppId) {
        const block = await planBlockForApp(ctx, whAppId)
        if (block) return Response.json({ error: block }, { status: 402 })
      }
      const signature = req.headers.get('x-signature') ?? undefined
      const result = await handleWebhookMessage(ctx, ctx.params.agentId, body, undefined, signature,
        req.headers.get('x-timestamp') ?? undefined, req.headers.get('x-nonce') ?? undefined)
      return Response.json(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // H3：签名类错误明确区分——Missing 401，Invalid/Replay 403，其它 400
      const status = message.includes('Missing') ? 401
        : message.includes('Invalid') || message.includes('Replay') ? 403
        : 400
      return Response.json({ error: message }, { status })
    }
  })

  // ── G8 补强：外部 IM 入站（企微/钉钉/飞书回调 → 绑定部门消息流 → AI 回复回显） ──
  app.post('/api/im/:platform', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const rawBody = await req.text().catch(() => '')
    let body: Record<string, any> = {}
    try { body = rawBody ? JSON.parse(rawBody) : {} } catch { throw new HttpError('无效 JSON', 400) }
    const { parseImInbound } = await import('../services/im-inbound.ts')
    let msg: any
    try {
      msg = parseImInbound(ctx.params.platform, body as Record<string, any>)
    } catch (e: any) {
      return Response.json({ error: e?.message ?? '解析失败' }, { status: 400 })
    }

    // 查绑定了部门的 IM 机器人（webhook agent + im_bind_dept 非空）
    const agents = await pg.orm.query.from('agents').select('id', 'name', 'webhook_platform', 'webhook_url', 'im_bind_dept', 'webhook_secret')
      .where({ type: { eq: 'webhook' }, im_bind_dept: { isNull: false }, is_active: { eq: true } }).limit(1).run()
    const whAgent = (Array.isArray(agents) ? agents : [agents])[0] as any
    if (!whAgent?.im_bind_dept) {
      throw new HttpError('未配置 IM 绑定部门（Webhook Agent 需绑定 im_bind_dept）', 404)
    }

    // G8 验签（安全底线）：配置了 webhook_secret 时强制校验
    const secret = whAgent.webhook_secret ? String(whAgent.webhook_secret) : ''
    if (secret) {
      const { verifySignature, checkNonce, verifyDingtalkSign } = await import('../services/webhook.ts')
      const hmacOk = verifySignature(rawBody,
        req.headers.get('x-signature') ?? '', secret,
        req.headers.get('x-timestamp') ?? undefined)
      // 钉钉官方：timestamp + sign 头
      const dt = req.headers.get('timestamp') ?? ''
      const dtSign = req.headers.get('sign') ?? ''
      const dingOk = dt && dtSign ? verifyDingtalkSign(body, dt, dtSign, secret) : false
      if (!hmacOk && !dingOk) {
        throw new HttpError('签名校验失败（需 X-Signature 或钉钉 timestamp+sign）', 403)
      }
      // Replay 防护（HMAC 路径）
      if (!checkNonce(req.headers.get('x-nonce') ?? undefined, req.headers.get('x-timestamp') ?? undefined)) {
        throw new HttpError('重放请求', 403)
      }
    }

    // 消息进绑定部门——同步收集 AI 回复（SSE 路径：write 回调分片——累积 buffer 再匹配）
    let reply = ''
    let sseBuf = ''
    const { handleNewMessageStreamSSE } = await import('../services/chat.ts')
    await handleNewMessageStreamSSE(ctx, String(whAgent.im_bind_dept), msg.content, '', (chunk: string) => {
      sseBuf += chunk
      const m = sseBuf.match(/event: wf:done[\s\S]*?data: (\{[\s\S]*?\})\n\n/)
      if (m) {
        try {
          const evt = JSON.parse(m[1])
          if (evt.content) reply = evt.content
        } catch { /* 解析失败忽略 */ }
      }
    }).catch((e: any) => console.error('[im] 入站处理失败:', e?.message ?? e))

    // 平台格式回显（回调响应即回复——钉钉/飞书/企微被动回复）
    const { formatOutboundBody } = await import('../services/webhook-platform.ts')
    const out = formatOutboundBody(String(whAgent.webhook_platform ?? 'generic'), reply || '（AI 未生成回复）', msg.conversationId)
    return new Response(out, { headers: { 'Content-Type': 'application/json' } })
  })

  // ── 问卷实时联动（框架 WS——2 页联动，不落库） ──
  const surveyAnswers: Array<Record<string, unknown>> = []        // 逐题回答（内存——最新窗口）
  const surveySubmissions: Array<Record<string, unknown>> = []    // 已提交（内存——最新窗口）
  let surveyTotal = 0                                            // 提交总数（DB 持久计数）
  const surveyLimit = 1000
  // 启动恢复：DB 全量 → 内存（重启不再丢）——srvD8 实证：重启后 stats 只剩重启后 20
  void (async () => {
    try {
      const rows = (await pg.orm.query.from('survey_submissions').select('id', 'source', 'age', 'industry', 'rating', 'focus', 'feedback', 'submitted_at', 'campaign_id').orderBy('submitted_at', 'desc').limit(1000).run()) ?? []
      surveyTotal = Number((await pg.orm.query.from('survey_submissions').count('*', 'n').run())[0]?.n ?? 0)
      for (const r of [...rows].reverse()) {
        surveySubmissions.push({
          id: String(r.id), source: String(r.source), submitted_at: String(r.submitted_at),
          age: String(r.age ?? ''), industry: String(r.industry ?? ''), rating: Number(r.rating ?? 0),
          focus: r.focus, feedback: String(r.feedback ?? ''),
          campaign: String(r.campaign_id ?? ''),
        })
      }
      const arows = (await pg.orm.query.from('survey_answers').select('source', 'question', 'answer', 'created_at', 'campaign_id').orderBy('created_at', 'desc').limit(1000).run()) ?? []
      for (const r of [...arows].reverse()) {
        surveyAnswers.push({ source: String(r.source), question: String(r.question), answer: String(r.answer), at: String(r.created_at), campaign: String(r.campaign_id ?? '') })
      }
      console.log(`[survey] 已恢复提交 ${surveyTotal} / 答案 ${arows.length}`)
    } catch (e: any) { console.warn('[survey] 恢复失败:', e?.message) }
  })()
  let surveyHub: import('weifuwu').Hub | null = null              // WS 房间（app.ws open 时捕获）
  const surveyOnline = new Map<any, { source: string; at: string; submitted?: boolean }>()  // 在线填写者（ws → source + 提交状态——浏览器未关保持在线）
  const surveyBroadcast = (event: Record<string, unknown>) => {
    surveyHub?.send('survey-live', JSON.stringify(event))
  }
  // S5 聚合分布（2027-09）：每次广播重算（1000 份 O(n) 微秒级）——提交广播
  // 也携带（实证：submitted 事件不带 aggregate → 页面分布统计停滞在连接快照）
  const surveyAggregate = () => {
    const byIndustry: Record<string, number> = {}
    const byAge: Record<string, number> = {}
    const byRating: Record<string, number> = {}
    const focus: Record<string, number> = {}
    let ratingSum = 0
    for (const s of surveySubmissions) {
      // record 顶层字段（实证：曾读 s.data → 恒空对象 → 分布统计全零）
      if (s.industry) byIndustry[String(s.industry)] = (byIndustry[String(s.industry)] ?? 0) + 1
      if (s.age) byAge[String(s.age)] = (byAge[String(s.age)] ?? 0) + 1
      const r = Number(s.rating ?? 0)
      if (r > 0) { byRating[String(r)] = (byRating[String(r)] ?? 0) + 1; ratingSum += r }
      for (const f of ((s.focus as string[]) ?? [])) focus[String(f)] = (focus[String(f)] ?? 0) + 1
    }
    return {
      total: surveySubmissions.length,
      byIndustry, byAge, byRating, focus,
      avgRating: surveySubmissions.length > 0 ? Math.round((ratingSum / surveySubmissions.length) * 10) / 10 : 0,
      completionRate: surveySubmissions.length > 0 ? 100 : 0,
    }
  }
  const surveyState = (campaignId = '') => {
    const filtered = campaignId ? surveySubmissions.filter((s) => String((s as any).campaign ?? '') === campaignId) : surveySubmissions
    const filteredAnswers = campaignId ? surveyAnswers.filter((a) => String((a as any).campaign ?? '') === campaignId) : surveyAnswers
    return {
    type: 'survey:state',
    count: campaignId ? filtered.length : surveyTotal,
    globalCount: surveyTotal,
    campaign: campaignId,
    answers: filteredAnswers.slice(-surveyLimit),
    submissions: filtered.slice(-surveyLimit),
    online: surveyOnlineState(),
    aggregate: (() => {
      const byIndustry: Record<string, number> = {}
      const byAge: Record<string, number> = {}
      const byRating: Record<string, number> = {}
      const focus: Record<string, number> = {}
      let ratingSum = 0
      for (const s of filtered) {
        if (s.industry) byIndustry[String(s.industry)] = (byIndustry[String(s.industry)] ?? 0) + 1
        if (s.age) byAge[String(s.age)] = (byAge[String(s.age)] ?? 0) + 1
        const r = Number(s.rating ?? 0)
        if (r > 0) { byRating[String(r)] = (byRating[String(r)] ?? 0) + 1; ratingSum += r }
        for (const f of ((s.focus as string[]) ?? [])) focus[String(f)] = (focus[String(f)] ?? 0) + 1
      }
      return {
        total: filtered.length,
        byIndustry, byAge, byRating, focus,
        avgRating: filtered.length > 0 ? Math.round((ratingSum / filtered.length) * 10) / 10 : 0,
        completionRate: filtered.length > 0 ? 100 : 0,
      }
    })(),
    }
  }
  // 在线连接清理（每 30 秒）：①readyState 非 OPEN（僵尸连接——close 丢失）
  // ②超过 10 分钟无活动（AI 填完不关页面/卡住——提交后应已下线，超时兜底）
  const ONLINE_IDLE_MS = 10 * 60 * 1000
  setInterval(() => {
    try {
      const now = Date.now()
      let changed = false
      for (const [w, v] of surveyOnline) {
        const idle = now - new Date(v.at).getTime()
        if (w.readyState !== 1 /* OPEN */ || idle > ONLINE_IDLE_MS) {
          surveyOnline.delete(w)
          changed = true
        }
      }
      if (changed) surveyBroadcastOnline()
    } catch { /* 清理失败不影响 */ }
  }, 30 * 1000).unref()

  const surveyOnlineState = () => {
    const all = [...surveyOnline.values()]
    return {
      count: all.length,
      sources: all.map((v) => v.source),
      submitted: all.filter((v) => v.submitted).map((v) => v.source), // 已提交但仍在线（浏览器未关）
    }
  }
  const surveyBroadcastOnline = () => {
    surveyBroadcast({ type: 'survey:online', ...surveyOnlineState() })
  }

  // ── 本地 CDN：问卷 CDN 页面的框架资源（dist——客户环境可无外网） ──
  // 本地 CDN（问卷页——v2 面——dist/client/vdom/index.js；旧 ui-dom 产物已随
  // v1 退役消失——问卷页 2027-09 迁移 vdom（S7 试点抓到：真实 LLM 打开问卷
  // 页静态资源 500——页面运行面断链——角色浏览器渲染失败卡死））
  const distRoot = join(__dirname, '..', '..', 'dist')
  app.get('/static/ui-dom/index.js', async (): Promise<Response> => {
    const { readFileSync } = await import('node:fs')
    return new Response(readFileSync(join(distRoot, 'client', 'vdom', 'index.js'), 'utf-8'), { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' } })
  })
  app.get('/static/components/index.js', async (): Promise<Response> => {
    const { readFileSync } = await import('node:fs')
    return new Response(readFileSync(join(distRoot, 'client', 'components', 'index.js'), 'utf-8'), { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' } })
  })

  // ── 模拟数据收集问卷（客户 demo——多角色 AI 填写） ──────────
  app.get('/demo-survey', async (): Promise<Response> => {
    const { readFileSync } = await import('node:fs')
    const { join, dirname } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const __dirname = dirname(fileURLToPath(import.meta.url))
    // CDN 模式（weifuwu 组件库 + 原生表单控件——AI 填写可靠）
    const html = readFileSync(join(__dirname, 'public', 'survey-form.html'), 'utf-8')
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  })

  // ── 模拟数据收集统计（CDN 页面 + JSON 数据 API） ─────────────
  // 一键触发 10 角色填写（demo——统计页按钮 → 服务端批量派单）
  app.post('/demo-survey/launch', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    try {
      // 新架构（2026-12）：10 个角色各在独立部门（独立沙盒——并发填写）
      // 派单 = 对每个角色部门发消息（@角色 触发）——并发执行，互不排队
      const ROLES = ['财务小王', '市场小李', '产品老张', '客服小陈', '研发大刘', '人事小周', '销售阿强', '运营小赵', '行政陈姐', '实习生阿泽']
      const deptRows = await pg.orm.query.from('departments').select('id', 'name').where({ name: { in: ROLES }, is_dm: { eq: false } }).run()
      const deptMap = new Map((deptRows ?? []).map((d: any) => [String(d.name), String(d.id)]))
      const missing = ROLES.filter((r) => !deptMap.has(r))
      if (missing.length > 0) {
        return Response.json({ error: `缺少角色部门：${missing.join('、')}（先跑 seed-survey-agents.mjs）` }, { status: 404 })
      }
      const [sender] = await pg.orm.query.from('agents').where({ app_id: { eq: ctx.appId }, type: { eq: 'user' } }).select('id').limit(1).run()
      const senderId = sender ? String(sender.id) : 'system'
      const { handleNewMessageStream } = await import('../services/chat.ts')
      // 并发派单（各部门沙盒同时执行浏览器任务）；分批 3 个控制瞬时连接/容器启动峰值
      const BASE = process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`
      void (async () => {
        const BATCH = 3
        const BATCH_GAP_MS = 10_000 // 批间 10s（连接池 50 + acquireTimeout 防线已增强——旧 45s 是池满事故的保守设计）
        let dispatched = 0
        for (let i = 0; i < ROLES.length; i += BATCH) {
          const batch = ROLES.slice(i, i + BATCH)
          console.log(`[launch] 第 ${i / BATCH + 1} 批派单：${batch.join('、')}`)
          await Promise.allSettled(batch.map(async (name) => {
            const content = `@${name} 【新任务】请重新打开问卷 ${BASE}/demo-survey?s=${encodeURIComponent(name)} 并完整填写提交（这是新一轮填写任务——即使工作目录已有旧的 survey-result.json 也要重新填写并覆盖更新它）。完成后把本轮作答结果写入工作目录 survey-result.json（覆盖旧文件），并执行 agent-browser close 关闭浏览器。`
            const dispatch = () => handleNewMessageStream(ctx, String(deptMap.get(name)), senderId, content, '')
            try { await dispatch(); dispatched++ } catch (err: any) {
              console.error(`[launch] 派单失败 ${name}:`, err?.message ?? err)
              await new Promise((r) => setTimeout(r, 3000))
              try { await dispatch(); dispatched++ } catch (err2: any) {
                console.error(`[launch] 重试失败 ${name}:`, err2?.message ?? err2)
              }
            }
          }))
          if (i + BATCH < ROLES.length) {
            await new Promise((r) => setTimeout(r, BATCH_GAP_MS))
          }
        }
        console.log(`[launch] 派单完成：${dispatched}/${ROLES.length} 个角色（并发独立沙盒）`)
      })()
      return Response.json({ success: true, sent: ROLES.length, scheduling: true, roles: ROLES })
    } catch (e: any) {
      return Response.json({ error: e?.message ?? 'launch 失败' }, { status: 500 })
    }
  })

  app.get('/demo-survey/campaigns', async (): Promise<Response> => {
    const { readFileSync } = await import('node:fs')
    const { join, dirname } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const __dirname = dirname(fileURLToPath(import.meta.url))
    const html = readFileSync(join(__dirname, 'public', 'survey-campaigns.html'), 'utf-8')
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  })

  // 任务列表数据（campaign 粒度——每次任务独立提交计数——2027-09）
  app.get('/api/survey/campaigns-list', async (): Promise<Response> => {
    try {
      const campRows = (await pg.orm.query.from('survey_campaigns').select('id', 'status', 'total', 'completed', 'failed', 'created_at').orderBy('created_at', 'desc').limit(50).run()) ?? []
      const campIds = campRows.map((c) => String(c.id))
      const subCounts = campIds.length ? await pg.orm.query.from('survey_submissions').select('campaign_id').count('*', 'submitted', { campaign_id: { in: campIds } }).groupBy('campaign_id').run() : []
      const subMap = new Map(subCounts.map((x) => [String(x.campaign_id), Number((x as any).submitted ?? 0)]))
      const rows = campRows.map((c) => ({ ...c, id: String(c.id), submitted: subMap.get(String(c.id)) ?? 0 }))
      return Response.json({ list: rows })
    } catch (e: any) {
      return Response.json({ error: e?.message ?? '查询失败' }, { status: 500 })
    }
  })

  app.get('/demo-survey/stats', async (): Promise<Response> => {
    const { readFileSync } = await import('node:fs')
    const { join, dirname } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const __dirname = dirname(fileURLToPath(import.meta.url))
    // CDN 模式（weifuwu 组件库渲染——Card/Badge/EmptyState）
    const html = readFileSync(join(__dirname, 'public', 'survey-stats.html'), 'utf-8')
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  })
  // ── UI / SPA ───────────────────────────────────────────
  app.use(ui())

  registerUiRoutes(app, __dirname)

  // ── 启动 ────────────────────────────────────────────────

  // PORT 环境变量（测试 spawn 用 PORT=0 随机端口——框架 serve 打印实际端口）
  const port = Number(process.env.PORT ?? 3000)
}

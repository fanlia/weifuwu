/**
 * agent-platform server — 多租户 AI Agent 平台
 *
 * 启动方式:
 *   node --env-file=.env apps/agent-platform/server.ts
 */

import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from 'weifuwu'
import type { AppCtx } from './src/middleware/ctx.ts'
import { serve, Router, cors, postgres, redis, ui, userSystem, ai, messager, rateLimit, verifyPassword } from 'weifuwu'
import { readFileSync } from 'node:fs'

// ── 中间件 ────────────────────────────────────────────────

// ── 路由 ──────────────────────────────────────────────────
import { registerAuthRoutes } from './src/routes/auth.ts'
import { registerAgentRoutes } from './src/routes/agents.ts'
import { registerWorkspaceRoutes } from './src/routes/workspace.ts'
import { registerDepartmentRoutes } from './src/routes/departments.ts'
import { registerMessageRoutes } from './src/routes/messages.ts'
import { registerKnowledgeRoutes } from './src/routes/knowledge.ts'

// ── 服务 ──────────────────────────────────────────────────
import { handleNewMessage } from './src/services/chat.ts'
import { handleWebhookMessage } from './src/services/webhook.ts'

// ── 内置工具 + Skills ─────────────────────────────────────
import { registerBuiltinTools, BUILTIN_TOOL_DEFS } from './src/tools/builtin.ts'
import { registerSkillRoutes } from './src/routes/skills.ts'
import { registerRoleTemplateRoutes } from './src/routes/role-templates.ts'

// ── UI ────────────────────────────────────────────────────
import { registerUiRoutes } from './src/ui/routes.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main() {
  const app = new Router<AppCtx>()

  // ── 指标收集（内存计数器——/api/metrics 暴露） ─────────────────
  const metrics = {
    requests: 0, errors: 0,
    aiCalls: 0, aiTokens: 0, aiLatencyMs: 0,
    webhooks: 0, sandboxCalls: 0,
    startTime: Date.now(),
  }
  ;(globalThis as any).__platform_metrics = metrics

  // ── 全局中间件 ──────────────────────────────────────────
  app.use(cors())


  // ── 数据库 ──────────────────────────────────────────────
  const pg = postgres()
  app.use(pg)

  // ── 请求日志（结构化 JSON 行 + 请求 id——可观测性基础；pg 之后——ctx.sql 已注入） ──
  app.use(async (req: Request, ctx: Context, next: any) => {
    const id = Math.random().toString(36).slice(2, 10)
    const url = new URL(req.url ?? '', 'http://localhost')
    const start = Date.now()
    metrics.requests++
    try {
      const res = await next(req, ctx)  // 必须显式传 req/ctx（dispatch 不传参数会变 undefined——框架约定）
      metrics.errors += (res as Response)?.status >= 500 ? 1 : 0
      console.log(JSON.stringify({
        ts: new Date().toISOString(), id, method: req.method, path: url.pathname,
        status: (res as Response)?.status ?? 200, ms: Date.now() - start,
      }))
      return res
    } catch (e) {
      metrics.errors++
      console.error(JSON.stringify({
        ts: new Date().toISOString(), id, method: req.method, path: url.pathname,
        level: 'error', ms: Date.now() - start, error: (e as Error)?.message,
      }))
      throw e
    }
  })

  // ── Schema 迁移 ───────────────────────────────────────
  // 使用 CREATE IF NOT EXISTS 安全地确保表存在，绝不 DROP 数据
  const schemaPath = resolve(__dirname, 'src', 'db', 'schema.sql')
  const schema = readFileSync(schemaPath, 'utf-8')
  await pg.migrate()
  if (!(await pg.isMigrated('agent-platform'))) {
    await pg.sql.unsafe(schema)
    await pg.markMigrated('agent-platform')
    console.log('[agent-platform] DB schema 已初始化')
  }
  // 检查核心表是否存在
  const [check] = await pg.sql`
    SELECT COUNT(*)::int as count FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'agents'
  ` as any[]
  if (check.count === 0) {
    await pg.sql.unsafe(schema)
    await pg.markMigrated('agent-platform')
    console.log('[agent-platform] 检测到表丢失，已重新创建')
  }

  // 增量表（追加的 schema——迁移一次性 markMigrated，新表需幂等补建；Wave 9 audit_logs）
  await pg.sql.unsafe(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      app_id      UUID NOT NULL,
      user_id     UUID,
      action      TEXT NOT NULL,
      target_type TEXT,
      target_id   UUID,
      detail      JSONB,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_app ON audit_logs(app_id, created_at DESC);
  `)

  // ── Redis（框架自研客户端）────────────────────────────
  const hasRedis = !!(process.env.REDIS_URL)
  let redisClient: any = null
  if (hasRedis) {
    redisClient = redis()
    app.use(redisClient)
    console.log('[agent-platform] Redis 已连接（自研客户端）')
  }

  // ── 用户系统（weifuwu user()——完全替代自研 auth）────────────────
  const users = userSystem({
    sql: pg.sql,
    secret: process.env.JWT_SECRET ?? 'default-secret',
    accessTtlSeconds: 15 * 60,   // 对齐原 15m
    refreshTtlDays: 7,           // 对齐原 7d
  })
  await users.migrate()          // _weifuwu_users / _weifuwu_sessions / _weifuwu_apps / _weifuwu_app_members
  // 迁移遗留：schema.sql 已去外键（agents.user_id 指向框架 _weifuwu_users），但已存在的表结构
  // 仍带旧约束（agents_user_id_fkey → 已删的 users 表）——幂等删除，避免注册建默认 Agent 失败
  await pg.sql`
    ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_user_id_fkey
  `

  // ── 一次性迁移：旧 tenant 模型 → 新 app 模型（幂等，仅旧库生效） ──
  // 旧版：tenants 表 + _weifuwu_users.tenant 字段 + 业务表 app_id
  // 新版：_weifuwu_apps + _weifuwu_app_members + 业务表 app_id（框架 userSystem 三层模型）
  await pg.sql.unsafe(`
    -- 一次性迁移：仅当旧 tenants 表存在时执行（成功后会 DROP——幂等标记）
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_name='tenants' AND table_schema='public') THEN
        -- 1. 旧 tenants → _weifuwu_apps（owner = 该租户第一个用户）
        INSERT INTO _weifuwu_apps (id, slug, name, owner_user_id)
        SELECT t.id, t.slug, t.name,
          (SELECT u.id FROM _weifuwu_users u WHERE u.tenant = t.id::text ORDER BY u.created_at LIMIT 1)
        FROM tenants t
        WHERE EXISTS (SELECT 1 FROM _weifuwu_users u WHERE u.tenant = t.id::text)
        ON CONFLICT (slug) DO NOTHING;

        -- 2. 旧用户 tenant 字段 → members（role=owner——旧模型注册即租户所有者）
        INSERT INTO _weifuwu_app_members (app_id, user_id, role, invited_by)
        SELECT u.tenant::uuid, u.id, 'owner', u.id
        FROM _weifuwu_users u WHERE u.tenant IS NOT NULL
        ON CONFLICT DO NOTHING;

        -- 3. 业务表列重命名（幂等：列存在检查）+ 旧外键清理
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='tenant_id') THEN
          ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_tenant_id_fkey;
          ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_tenant_id_fkey;
          ALTER TABLE agent_logs DROP CONSTRAINT IF EXISTS agent_logs_tenant_id_fkey;
          ALTER TABLE webhook_logs DROP CONSTRAINT IF EXISTS webhook_logs_tenant_id_fkey;
          ALTER TABLE companies RENAME COLUMN tenant_id TO app_id;
          ALTER TABLE agents RENAME COLUMN tenant_id TO app_id;
          ALTER TABLE agent_logs RENAME COLUMN tenant_id TO app_id;
          ALTER TABLE webhook_logs RENAME COLUMN tenant_id TO app_id;
          ALTER TABLE events RENAME COLUMN tenant_id TO app_id;
          DROP INDEX IF EXISTS idx_agents_tenant;
          DROP INDEX IF EXISTS idx_agent_logs_tenant;
          DROP INDEX IF EXISTS idx_events_tenant;
          DROP INDEX IF EXISTS uq_events_first_message;
        END IF;

        -- 4. 清空旧 tenant 字段 + 删旧表（迁移完成的标记）
        UPDATE _weifuwu_users SET tenant = NULL;
        DROP TABLE IF EXISTS tenants;
      END IF;
    END $$;
    -- 公司 → app 合并（独立条件：departments.company_id 列存在——不依赖 tenants 迁移）
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='departments' AND column_name='company_id') THEN
        ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_company_id_fkey;
        -- 数据搬移：先加 app_id → 映射 companies.app_id → 删 company_id
        ALTER TABLE departments ADD COLUMN app_id UUID;
        UPDATE departments d SET app_id = c.app_id
        FROM companies c WHERE d.company_id = c.id;
        ALTER TABLE departments DROP COLUMN company_id;
      END IF;
    END $$;
    DROP TABLE IF EXISTS companies;
    -- 索引无条件幂等重建（新库直接建，旧库迁移后补）
    CREATE INDEX IF NOT EXISTS idx_agents_app ON agents(app_id);
    CREATE INDEX IF NOT EXISTS idx_agent_logs_app ON agent_logs(app_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_events_app ON events(app_id, event);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_events_first_message ON events(app_id, event) WHERE event = 'first_message';
  `)
  console.log('[agent-platform] app 模型迁移完成（旧 tenants → _weifuwu_apps + members）')
  app.use(users)
  // 框架认证路由：login/logout/refresh/me（register 自定义：建租户 + 默认 agent）
  users.routes(app, { prefix: '/api/auth', exclude: ['register'] })

  // ── 限流（框架 rateLimit：ctx.limit 手动限流，默认按 IP 维度） ──
  // Webhook 入站端点豁免全局限流（外部系统高频调用易撞 100/60s 429）——
  // 防滥用由签名验证 + 请求体大小限制（B3）承担；后续如需独立阈值再加实例
  if (hasRedis) {
    const globalRateLimit = rateLimit({ windowMs: 60_000, max: 100, redis: redisClient.redis })
    app.use((req: Request, ctx: Context, next: any) => {
      // req.url 是完整 URL（含 host）——取 path 判断
      const path = (req.url ?? '').replace(/^https?:\/\/[^/]+/, '')
      if (path.startsWith('/api/webhook/')) return next(req, ctx)
      return globalRateLimit(req, ctx, next)
    })
  }

  // ── AI 中间件（框架 ai()：chat/stream/agent/embedding——embedding 默认读 DASHSCOPE_*） ──
  app.use(ai({ embedding: {} }))

  // ── 内置工具注册 ──────────────────────────────────────────
  // 提供一个获取当前 ctx 的函数，供内置工具在运行时使用
  let currentCtx: AppCtx = null as any
  app.use((req: Request, ctx: Context, next: any) => {
    currentCtx = ctx as unknown as AppCtx
    return next(req, ctx)
  })
  registerBuiltinTools(() => currentCtx)
  console.log(`[agent-platform] 已注册 ${BUILTIN_TOOL_DEFS.length} 个内置工具`)

  // ── 沙盒初始化（S2：探测 + 孤儿清理 + Heartbeat 回收） ──
  const { sandbox } = await import('./src/sandbox/docker.ts')
  const sandboxStatus = await sandbox.status()
  if (sandboxStatus.enabled && sandboxStatus.available) {
    const cleaned = await sandbox.cleanupOrphans()
    sandbox.startReaper()
    console.log(`[agent-platform] 沙盒就绪：${sandboxStatus.mode} · 镜像 ${process.env.SANDBOX_IMAGE ?? 'node:24'} · 池上限 ${sandboxStatus.maxContainers}（孤儿容器清理 ${cleaned} 个）`)
  } else {
    console.warn(`[agent-platform] 沙盒不可用（enabled=${sandboxStatus.enabled} dockerOk=镜像缺失或 docker 不可用）——agent 文件/命令工具将返回「沙盒不可用」禁用`)
  }

  // ── 公开 API（无需登录） ───────────────────────────────
  registerAuthRoutes(app)

  // 可用技能列表（公开，无租户信息）
  app.get('/api/skills/available', async (_req: Request, _ctx: AppCtx): Promise<Response> => {
    const { discoverSkills } = await import('./src/services/skills.ts')
    const { resolve, dirname } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const __dirname = dirname(fileURLToPath(import.meta.url))
    const skillsDir = resolve(__dirname, 'skills', 'builtin')
    const skills = await discoverSkills(skillsDir)
    return Response.json({ skills, skillsDir })
  })

  // ── 角色模板列表（公开） ───────────────────────────────
  // 使用动态 import 访问模板数据
  app.get('/api/role-templates', async () => {
    const { getRoleTemplates } = await import('./src/routes/role-templates.ts')
    const templates = getRoleTemplates()
    // 持久化使用计数（DB 统计——内存计数服务重启即清零）
    const [rowsRaw] = await pg.sql`
      SELECT template_slug, COUNT(*)::int AS cnt FROM agents
      WHERE template_slug IS NOT NULL GROUP BY template_slug
    ` as any[]
    const rows = Array.isArray(rowsRaw) ? rowsRaw : rowsRaw ? [rowsRaw] : []
    const usage = new Map<string, number>(rows.map((r: any) => [r.template_slug, r.cnt]))
    for (const t of templates) t.usage_count = usage.get(t.slug) ?? 0
    return Response.json({ templates })
  })
  app.get('/api/role-templates/:slug', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { getRoleTemplates } = await import('./src/routes/role-templates.ts')
    const template = getRoleTemplates().find(t => t.slug === ctx.params.slug)
    if (!template) return Response.json({ error: '模板不存在' }, { status: 404 })
    return Response.json({ template })
  })

  // ── 指标端点（运营/监控——内存计数器 + 进程信息） ──
  app.get('/api/metrics', async () => {
    const m = (globalThis as any).__platform_metrics ?? {}
    const uptime = Math.round((Date.now() - (m.startTime ?? Date.now())) / 1000)
    return Response.json({
      uptimeSec: uptime,
      requests: m.requests ?? 0,
      errors: m.errors ?? 0,
      errorRate: m.requests ? Number(((m.errors / m.requests) * 100).toFixed(2)) : 0,
      aiCalls: m.aiCalls ?? 0,
      aiTokens: m.aiTokens ?? 0,
      aiAvgLatencyMs: m.aiCalls ? Math.round((m.aiLatencyMs ?? 0) / m.aiCalls) : 0,
      webhooks: m.webhooks ?? 0,
      sandboxCalls: m.sandboxCalls ?? 0,
      memMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    })
  })

  // ── 需要登录 + 租户隔离的路由 ─────────────────────────
  const protectedRoutes = new Router<AppCtx>()
  // 登录保护（框架 ctx.auth.requireAuth：未登录抛 401）
  protectedRoutes.use((req: Request, ctx: Context, next: any) => {
    ;(ctx as unknown as AppCtx).auth.requireAuth()
    return next(req, ctx)
  })

  // 公司
  // Agent
  registerAgentRoutes(protectedRoutes)
  // 工作空间文件浏览器
  await registerWorkspaceRoutes(protectedRoutes)
  // 部门
  registerDepartmentRoutes(protectedRoutes)
  // 消息
  registerMessageRoutes(protectedRoutes)
  // 知识库
  registerKnowledgeRoutes(protectedRoutes)
  // Skills
  registerSkillRoutes(protectedRoutes)
  // 角色模板
  registerRoleTemplateRoutes(protectedRoutes)

  // ── 审计日志（Wave 9——安全/合规：登录/Agent 变更记录） ──
  protectedRoutes.get('/api/audit', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { listAudit } = await import('./src/services/audit.ts')
    const url = new URL(req.url ?? '', 'http://localhost')
    const limit = Number(url.searchParams.get('limit') ?? 50)
    const action = url.searchParams.get('action') ?? undefined
    const result = await listAudit(ctx, { limit, action })
    return Response.json(result)
  })

  // ── 用户设置 ─────────────────────────────────────────────
  // 更新个人资料
  protectedRoutes.put('/api/auth/profile', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, auth } = ctx
    const body = await req.json() as { name?: string }
    if (!body.name?.trim()) {
      return Response.json({ error: 'name 不能为空' }, { status: 400 })
    }
    // 框架用户表（_weifuwu_users）——应用层更新扩展字段
    const [user] = await sql`
      UPDATE _weifuwu_users SET name = ${body.name.trim()}
      WHERE id = ${auth!.userId}
      RETURNING id, email, name, role, created_at
    `
    return Response.json({ user })
  })

  // 修改密码
  protectedRoutes.put('/api/auth/password', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, auth } = ctx
    const body = await req.json() as { currentPassword: string; newPassword: string }
    if (!body.currentPassword || !body.newPassword) {
      return Response.json({ error: 'currentPassword 和 newPassword 为必填' }, { status: 400 })
    }
    if (body.newPassword.length < 6) {
      return Response.json({ error: '新密码至少 6 位' }, { status: 400 })
    }

    const [user] = await sql`
      SELECT password_hash FROM _weifuwu_users WHERE id = ${auth!.userId}
    `
    if (!user) return Response.json({ error: '用户不存在' }, { status: 404 })

    const valid = await verifyPassword(body.currentPassword, user.password_hash as string)
    if (!valid) {
      return Response.json({ error: '当前密码错误' }, { status: 403 })
    }

    // 框架 ctx.auth.setPassword（scrypt 哈希 + 更新）
    await auth!.setPassword(auth!.userId, body.newPassword)
    return Response.json({ success: true })
  })

  // ── 完整统计数据 ───────────────────────────────────────
  protectedRoutes.get('/api/stats', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId } = ctx

    const [agentStats] = await sql`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE type = 'ai')::int as ai_count,
        COUNT(*) FILTER (WHERE type = 'webhook')::int as webhook_count,
        COUNT(*) FILTER (WHERE type = 'knowledge_base')::int as kb_count,
        COUNT(*) FILTER (WHERE type = 'user')::int as user_count
      FROM agents WHERE app_id = ${appId}
    `

    const [deptStats] = await sql`
      SELECT COUNT(*)::int as total FROM departments d
      WHERE d.app_id = ${appId}
    `

    const [msgStats] = await sql`
      SELECT COUNT(*)::int as total FROM messages m
      JOIN agents a ON a.id = m.sender_id
      WHERE a.app_id = ${appId}
    `

    const [tokenStats] = await sql`
      SELECT
        COALESCE(SUM(tokens_prompt), 0)::int as total_prompt,
        COALESCE(SUM(tokens_completion), 0)::int as total_completion,
        COALESCE(SUM(tokens_total), 0)::int as total_tokens
      FROM agent_logs WHERE app_id = ${appId}
    `

    // 近 7 天消息趋势
    const trend = await sql`
      SELECT
        DATE(m.created_at) as day,
        COUNT(*)::int as count
      FROM messages m
      JOIN agents a ON a.id = m.sender_id
      WHERE a.app_id = ${appId}
        AND m.created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(m.created_at)
      ORDER BY day
    `

    // 活跃 Agent 排行（近 7 天发消息数——统计面板「活跃度」）
    const activeAgents = await sql`
      SELECT a.id, a.name, a.type,
        COUNT(m.id)::int as message_count,
        MAX(m.created_at) as last_active_at
      FROM agents a
      JOIN messages m ON m.sender_id = a.id
      WHERE a.app_id = ${appId}
        AND m.created_at >= NOW() - INTERVAL '7 days'
      GROUP BY a.id, a.name, a.type
      ORDER BY message_count DESC
      LIMIT 8
    `

    return Response.json({
      agents: agentStats,
      departments: deptStats,
      messages: msgStats,
      tokens: tokenStats,
      trend,
      active_agents: activeAgents,
    })
  })

  // ── Token 成本排行（按 Agent，老板视角成本视图） ─────────────
  protectedRoutes.get('/api/stats/tokens-by-agent', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId } = ctx
    const rows = await sql`
      SELECT a.id, a.name, a.type,
        COUNT(al.id)::int as run_count,
        COALESCE(SUM(al.tokens_total), 0)::int as tokens_total,
        COALESCE(SUM(al.tokens_prompt), 0)::int as tokens_prompt,
        COALESCE(SUM(al.tokens_completion), 0)::int as tokens_completion
      FROM agents a
      LEFT JOIN agent_logs al ON al.agent_id = a.id AND al.app_id = ${appId}
      WHERE a.app_id = ${appId}
      GROUP BY a.id
      HAVING COUNT(al.id) > 0
      ORDER BY tokens_total DESC
      LIMIT 10
    `
    return Response.json({ agents: rows })
  })

  // ── 激活漏斗埋点 ──────────────────────────────────────────
  // 埋点：POST /api/track { event: 'register_complete'|'agent_created'|'first_message' }
  // first_message 每租户唯一（部分唯一索引）——首次消息只记一次
  const TRACKABLE = new Set(['register_complete', 'agent_created', 'first_message'])
  protectedRoutes.post('/api/track', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId } = ctx
    const body = await req.json().catch(() => ({})) as { event?: string }
    if (!body.event || !TRACKABLE.has(body.event)) {
      return Response.json({ error: 'event 必须是 register_complete/agent_created/first_message 之一' }, { status: 400 })
    }
    try {
      await sql`INSERT INTO events (app_id, event) VALUES (${appId}, ${body.event})`
    } catch {
      // 部分唯一索引冲突（first_message 已记）——幂等，忽略
    }
    return Response.json({ ok: true })
  })

  // 漏斗：本租户进度 + 全平台转化（去重租户）
  protectedRoutes.get('/api/stats/funnel', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId } = ctx
    const rows = await sql`
      SELECT
        COUNT(*) FILTER (WHERE event = 'register_complete')::int as register_complete,
        COUNT(*) FILTER (WHERE event = 'agent_created')::int as agent_created,
        COUNT(*) FILTER (WHERE event = 'first_message')::int as first_message
      FROM events WHERE app_id = ${appId}
    `
    const mine = rows[0] as { register_complete: number; agent_created: number; first_message: number } | undefined
    const platform = await sql`
      SELECT event, COUNT(*)::int as count
      FROM (
        SELECT DISTINCT app_id, event FROM events
      ) t GROUP BY event
    `
    return Response.json({
      mine: { register_complete: (mine?.register_complete ?? 0) > 0, agent_created: (mine?.agent_created ?? 0) > 0, first_message: (mine?.first_message ?? 0) > 0 },
      platform: Object.fromEntries(platform.map((p: any) => [p.event, p.count])),
    })
  })

  // ── Agent 执行日志 ───────────────────────────────────────
  protectedRoutes.get('/api/stats/agents/:agentId/logs', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params } = ctx
    const logs = await sql`
      SELECT id, messages_count, steps_count,
        tokens_prompt, tokens_completion, tokens_total,
        elapsed_ms, success, created_at
      FROM agent_logs
      WHERE agent_id = ${params.agentId} AND app_id = ${appId}
      ORDER BY created_at DESC
      LIMIT 50
    `
    return Response.json({ logs })
  })

  // ── Webhook 调用日志 ─────────────────────────────────────
  protectedRoutes.get('/api/stats/agents/:agentId/webhook-logs', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params } = ctx
    const logs = await sql`
      SELECT id, request_body, response_body, response_status,
        elapsed_ms, success, created_at
      FROM webhook_logs
      WHERE agent_id = ${params.agentId} AND app_id = ${appId}
      ORDER BY created_at DESC
      LIMIT 30
    `
    return Response.json({ logs })
  })

  // 挂载受保护路由
  app.mount('/', protectedRoutes)

  // ── WebSocket（框架 messager：房间广播 + Redis 跨进程） ──
  const messagerSystem = messager({ sql: pg.sql, redis: redisClient?.redis })
  app.use(messagerSystem)
  app.ws('/ws', messagerSystem.client.handler())

  // ── Webhook 入口 ───────────────────────────────────────

  app.post('/api/webhook/:agentId', async (req: Request, ctx: AppCtx): Promise<Response> => {
    try {
      // B3：请求体大小限制（64KB）——防滥用
      const contentLength = Number(req.headers.get('content-length') ?? 0)
      if (contentLength > 64 * 1024) {
        return Response.json({ error: 'Request body too large (max 64KB)' }, { status: 413 })
      }
      const body = await req.json()
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

  // ── UI / SPA ───────────────────────────────────────────
  app.use(ui())

  registerUiRoutes(app, __dirname)

  // ── 启动 ────────────────────────────────────────────────

  const server = serve(app, { port: 3000 })
  console.log('[agent-platform] http://localhost:3000')

  // ── 优雅关闭 ────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    console.log(`\n[agent-platform] 收到 ${signal}，正在优雅关闭...`)
    // 先停止 HTTP 服务
    await new Promise<void>((resolve) => server.close().then(resolve))
    // 关闭数据库连接
    await pg.close()
    console.log('[agent-platform] 已关闭')
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((err) => {
  console.error('[agent-platform] 启动失败:', err)
  process.exit(1)
})

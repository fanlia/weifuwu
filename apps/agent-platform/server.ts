/**
 * agent-platform server — 多租户 AI Agent 平台
 *
 * 启动方式:
 *   node --env-file=.env apps/agent-platform/server.ts
 */

import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from 'weifuwu'
import type { AppCtx } from './src/middleware/ctx.ts'
import { serve, Router, cors, postgres, redis, ui, userSystem, ai, messager, rateLimit, verifyPassword, email } from 'weifuwu'
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
import { registerAdminRoutes } from './src/routes/admin.ts'

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
  // 增量列（Wave 9 token 配额——ADD COLUMN IF NOT EXISTS 幂等）
  await pg.sql.unsafe(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS monthly_token_quota INT NOT NULL DEFAULT 0`)
  await pg.sql.unsafe(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS role_label TEXT`)
  await pg.sql.unsafe(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS im_bind_dept UUID`)
  await pg.sql.unsafe(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachments JSONB`)
  await pg.sql.unsafe(`CREATE TABLE IF NOT EXISTS agent_run_states (message_id UUID PRIMARY KEY, agent_id UUID NOT NULL, department_id UUID NOT NULL, app_id UUID NOT NULL, steps JSONB NOT NULL DEFAULT '[]'::JSONB, status TEXT NOT NULL DEFAULT 'running', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`)
    await pg.sql.unsafe(`CREATE TABLE IF NOT EXISTS skill_ratings (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), skill_dir TEXT NOT NULL, app_id UUID NOT NULL, liked BOOLEAN NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (skill_dir, app_id))`)
  await pg.sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_skill_ratings_dir ON skill_ratings(skill_dir)`)
    await pg.sql.unsafe(`CREATE TABLE IF NOT EXISTS answer_cache (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), app_id UUID NOT NULL, question TEXT NOT NULL, answer TEXT NOT NULL, hits INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`)
  await pg.sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_answer_cache_app ON answer_cache(app_id)`)
    await pg.sql.unsafe(`CREATE TABLE IF NOT EXISTS group_memories (department_id UUID PRIMARY KEY, summary TEXT, msg_count INT NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`)
  await pg.sql.unsafe(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS expertise TEXT`)
  await pg.sql.unsafe(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS webhook_platform TEXT NOT NULL DEFAULT 'generic'`)
  // R6 质量反馈：AI 消息点赞/点踩（'like'/'dislike'/NULL）
  await pg.sql.unsafe(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS feedback TEXT`)
  // C2 风险策略：agents 审批模式（auto 智能分级 / strict 严格 / off 关闭）
  await pg.sql.unsafe(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS risk_policy TEXT NOT NULL DEFAULT 'auto'`)
  // C5 成本工程：Agent 轻量模型（内部调用路由——记忆提取/自校验用小模型省成本）
  await pg.sql.unsafe(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS light_model TEXT`)
  // C5 配额 80% 告警防刷（记录上次提醒时间）
  await pg.sql.unsafe(`ALTER TABLE _weifuwu_apps ADD COLUMN IF NOT EXISTS last_quota_alert_at TIMESTAMPTZ`)
  // C3 会话记忆：AI Agent 跨会话记忆（偏好/项目背景）
  await pg.sql.unsafe(`CREATE TABLE IF NOT EXISTS agent_memories (
    agent_id UUID PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`)
  // R5 企业-子租户：企业账户（结算主体）+ apps 归属
  await pg.sql.unsafe(`CREATE TABLE IF NOT EXISTS enterprises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    owner_user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`)
  await pg.sql.unsafe(`ALTER TABLE _weifuwu_apps ADD COLUMN IF NOT EXISTS enterprise_id UUID`)
  // 商业化 G2：租户状态（active/disabled——管理后台停用）
  await pg.sql.unsafe(`ALTER TABLE _weifuwu_apps ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`)
  // 商业化 G1：订阅计划（free 试用 / pro）+ 试用到期时间 + 租户级月 token 配额
  await pg.sql.unsafe(`ALTER TABLE _weifuwu_apps ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'`)
  await pg.sql.unsafe(`ALTER TABLE _weifuwu_apps ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ`)
  await pg.sql.unsafe(`ALTER TABLE _weifuwu_apps ADD COLUMN IF NOT EXISTS monthly_token_limit INT NOT NULL DEFAULT 0`)
  // G1 回填：老租户（free 无试用期）补 14 天试用 + 免费配额
  await pg.sql.unsafe(`UPDATE _weifuwu_apps SET trial_ends_at = NOW() + INTERVAL '14 days', monthly_token_limit = 50000 WHERE plan = 'free' AND trial_ends_at IS NULL`)
  // 商业化 G4：租户 BYOK 配置（自带模型 Key/端点）
  await pg.sql.unsafe(`CREATE TABLE IF NOT EXISTS app_ai_configs (
    app_id UUID PRIMARY KEY,
    base_url TEXT,
    api_key TEXT,
    model TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`)
  // 多 Agent 协作：agent_logs.department_id 可空（子 Agent 被调用时无部门——call_agent 嵌套）
  await pg.sql.unsafe(`ALTER TABLE agent_logs ALTER COLUMN department_id DROP NOT NULL`)
  await pg.sql.unsafe(`
    CREATE TABLE IF NOT EXISTS agent_versions (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id    UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      app_id      UUID NOT NULL,
      version     INT NOT NULL,
      snapshot    JSONB NOT NULL,
      note        TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (agent_id, version)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_versions_agent ON agent_versions(agent_id, version DESC);
  `)

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

  // 可用技能列表（公开）+ C6 技能市场：?q= 搜索 + 全局评分聚合
  app.get('/api/skills/available', async (req: Request, _ctx: AppCtx): Promise<Response> => {
    const { discoverSkills } = await import('./src/services/skills.ts')
    const { resolve, dirname } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const __dirname = dirname(fileURLToPath(import.meta.url))
    const skillsDir = resolve(__dirname, 'skills', 'builtin')
    let skills = await discoverSkills(skillsDir)

    // C6 搜索：name/description 匹配（大小写不敏感）
    const q = new URL(req.url).searchParams.get('q')?.trim().toLowerCase() ?? ''
    if (q) {
      skills = skills.filter((sk: any) =>
        String(sk?.meta?.name ?? '').toLowerCase().includes(q) ||
        String(sk?.meta?.description ?? '').toLowerCase().includes(q) ||
        String(sk?.dir ?? '').toLowerCase().includes(q),
      )
    }

    // C6 评分聚合（全局——所有租户的评分）
    try {
      const ratings = await pg.sql`
        SELECT skill_dir,
          COALESCE(COUNT(*) FILTER (WHERE liked), 0)::int AS likes,
          COALESCE(COUNT(*) FILTER (WHERE NOT liked), 0)::int AS dislikes
        FROM skill_ratings GROUP BY skill_dir
      `
      // key 用路径 basename（绝对/相对路径环境无关——如 process-csv）
      const base = (p: string) => String(p ?? '').split(/[\\/]/).filter(Boolean).pop() ?? ''
      const map = new Map<string, { likes: number; dislikes: number }>(
        (Array.isArray(ratings) ? ratings : [ratings]).map((r: any) => [
          base(String(r.skill_dir ?? '')), { likes: Number(r.likes ?? 0), dislikes: Number(r.dislikes ?? 0) },
        ]),
      )
      for (const sk of skills) {
        const r = map.get(base(String(sk?.dir ?? ''))) ?? { likes: 0, dislikes: 0 }
        ;(sk as any).rating = r
      }
    } catch { /* 评分表不存在——无评分 */ }

    return Response.json({ skills, skillsDir })
  })

  // C6 技能评分（登录——每租户每技能一次，upsert 可改评）
  app.post('/api/skills/rate', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const body = await req.json().catch(() => ({})) as { skill_dir?: string; liked?: boolean }
    if (!body.skill_dir) return Response.json({ error: 'skill_dir 为必填' }, { status: 400 })
    const liked = !!body.liked
    // key 统一 basename（绝对/相对路径一致）
    const key = String(body.skill_dir).split(/[\\/]/).filter(Boolean).pop() ?? String(body.skill_dir)
    const [row] = await pg.sql`
      INSERT INTO skill_ratings (skill_dir, app_id, liked)
      VALUES (${key.slice(0, 200)}, ${ctx.appId}, ${liked})
      ON CONFLICT (skill_dir, app_id) DO UPDATE SET liked = EXCLUDED.liked
      RETURNING skill_dir, liked
    `
    return Response.json({ rating: row })
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

  // ── 健康检查（运营/部署探针——存活 + 依赖探活） ─────────
  // 商业化 G13：白标配置（公开——登录页/壳读取品牌）
  app.get('/api/white-label', async (): Promise<Response> => {
    const { getWhiteLabelInfo } = await import('./src/services/license.ts')
    return Response.json(getWhiteLabelInfo())
  })

  // 商业化 G15：管理 API（只读——客户系统集成；独立于登录会话，MANAGEMENT_API_KEY 认证）
  app.get('/api/v1/apps', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    const expected = process.env.MANAGEMENT_API_KEY ?? ''
    if (!expected) return Response.json({ error: '管理 API 未启用（配置 MANAGEMENT_API_KEY）' }, { status: 403 })
    if ((_req.headers.get('authorization') ?? '') !== `Bearer ${expected}`) {
      return Response.json({ error: '无效的管理 API Key' }, { status: 401 })
    }
    const apps = await ctx.sql`
      SELECT a.slug, a.name, a.status, a.plan, a.trial_ends_at, a.monthly_token_limit, a.created_at,
        (SELECT COUNT(*)::int FROM _weifuwu_app_members m WHERE m.app_id = a.id) AS member_count,
        (SELECT COUNT(*)::int FROM agents ag WHERE ag.app_id = a.id) AS agent_count,
        COALESCE((SELECT SUM(l.tokens_total)::int FROM agent_logs l WHERE l.app_id = a.id AND l.created_at >= date_trunc('month', now())), 0) AS token_usage_month
      FROM _weifuwu_apps a ORDER BY a.created_at DESC
    `
    return Response.json({ apps })
  })

  app.get('/api/v1/usage', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    const expected = process.env.MANAGEMENT_API_KEY ?? ''
    if (!expected) return Response.json({ error: '管理 API 未启用（配置 MANAGEMENT_API_KEY）' }, { status: 403 })
    if ((_req.headers.get('authorization') ?? '') !== `Bearer ${expected}`) {
      return Response.json({ error: '无效的管理 API Key' }, { status: 401 })
    }
    const rows = await ctx.sql`
      SELECT l.app_id, date_trunc('day', l.created_at)::date AS day,
        COUNT(*)::int AS calls, COALESCE(SUM(l.tokens_total), 0)::int AS tokens
      FROM agent_logs l
      WHERE l.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY l.app_id, date_trunc('day', l.created_at)::date
      ORDER BY day DESC LIMIT 500
    `
    return Response.json({ usage: rows })
  })

  app.get('/healthz', async (): Promise<Response> => {
    const deps: Record<string, any> = { pg: false, redis: false, sandbox: null }
    try { await pg.sql`SELECT 1`; deps.pg = true } catch { /* 探活失败 */ }
    try {
      if (hasRedis) { await redisClient.redis.ping(); deps.redis = true }
      else deps.redis = 'disabled'
    } catch { deps.redis = false }
    try {
      const { sandbox } = await import('./src/sandbox/docker.ts')
      const st = await sandbox.status()
      deps.sandbox = { available: st.available, enabled: st.enabled, imageReady: st.imageReady, mode: st.mode, poolSize: st.poolSize, maxContainers: st.maxContainers }
    } catch { deps.sandbox = 'unavailable' }
    // R7：磁盘水位 + 版本（运维告警/升级判断）
    let disk: Record<string, any> | null = null
    try {
      const { statfs } = await import('node:fs/promises')
      const st = await statfs(process.env.AGENT_WORKSPACE_ROOT ?? '.')
      const total = st.blocks * st.bsize
      const free = st.bfree * st.bsize
      disk = { totalBytes: total, freeBytes: free, freePercent: Math.round(free / total * 100) }
    } catch { disk = null }
    const healthy = deps.pg === true && (!disk || disk.freePercent > 5)
    const startTime = (globalThis as any).__platform_metrics?.startTime
    const uptimeSec = startTime ? Math.round((Date.now() - startTime) / 1000) : 0
    return Response.json(
      { status: healthy ? 'ok' : 'degraded', uptimeSec, deps, disk, version: (() => { try { return JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../package.json'), 'utf-8')).version } catch { return 'dev' } })(), ts: new Date().toISOString() },
      { status: healthy ? 200 : 503 },
    )
  })

  // ── 指标端点（运营/监控——内存计数器 + 进程信息） ──
  // R9：Prometheus 文本格式（Grafana 生态可抓）
  app.get('/api/metrics/prom', async () => {
    const m = (globalThis as any).__platform_metrics ?? {}
    const uptime = Math.round((Date.now() - (m.startTime ?? Date.now())) / 1000)
    let disk: Record<string, any> | null = null
    try {
      const { statfs } = await import('node:fs/promises')
      const st = await statfs(process.env.AGENT_WORKSPACE_ROOT ?? '.')
      disk = { freePercent: Math.round(st.bfree * st.bsize / (st.blocks * st.bsize) * 100) }
    } catch { disk = null }
    const lines = [
      `# HELP agent_platform_uptime_seconds 服务运行时长`,
      `agent_platform_uptime_seconds ${uptime}`,
      `agent_platform_requests_total ${m.requests ?? 0}`,
      `agent_platform_errors_total ${m.errors ?? 0}`,
      `agent_platform_ai_calls_total ${m.aiCalls ?? 0}`,
      `agent_platform_ai_tokens_total ${m.aiTokens ?? 0}`,
      `agent_platform_webhooks_total ${m.webhooks ?? 0}`,
      `agent_platform_sandbox_calls_total ${m.sandboxCalls ?? 0}`,
      `agent_platform_disk_free_percent ${disk?.freePercent ?? -1}`,
    ]
    return new Response(lines.join('\n') + '\n', {
      headers: { 'Content-Type': 'text/plain; version=0.0.4' },
    })
  })

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
  // 商业化 G2：租户停用拦截（status='disabled' → 403——管理后台停用即全租户不可用）
  // 管理面豁免：/api/admin/* 不受租户停用影响（管理员停用后仍需能恢复）
  protectedRoutes.use(async (req: Request, ctx: Context, next: any) => {
    if (String(req.url ?? '').includes('/api/admin/')) return next(req, ctx)
    const c = ctx as unknown as AppCtx
    if (c.appId) {
      const rows = await c.sql`SELECT status FROM _weifuwu_apps WHERE id = ${c.appId}`
      if (rows[0]?.status === 'disabled') {
        return Response.json({ error: '该团队已被停用，请联系管理员' }, { status: 403 })
      }
    }
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
  // 商业化 G2：租户管理后台（平台管理员 ADMIN_EMAILS）
  registerAdminRoutes(protectedRoutes)

  // ── 审计日志（Wave 9——安全/合规：登录/Agent 变更记录） ──
  // ── 运营详情：沙盒状态 + 今日审计（受保护） ─────────────
  protectedRoutes.get('/api/ops', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    const { getLicenseInfo } = await import('./src/services/license.ts')
    const licenseInfo = getLicenseInfo()
    let sandboxInfo: Record<string, any> = { available: false }
    try {
      const { sandbox } = await import('./src/sandbox/docker.ts')
      const st = await sandbox.status()
      sandboxInfo = { available: st.available, enabled: st.enabled, imageReady: st.imageReady, mode: st.mode, poolSize: st.poolSize, maxContainers: st.maxContainers }
    } catch { /* 沙盒不可用 */ }
    let auditToday = 0
    try {
      const [row] = await ctx.sql`SELECT COUNT(*)::int AS n FROM audit_logs WHERE created_at >= NOW() - INTERVAL '1 day' AND app_id = ${ctx.appId}`
      auditToday = Number((row as any)?.n ?? 0)
    } catch { /* 无审计表 */ }
    return Response.json({ sandbox: sandboxInfo, auditToday, license: licenseInfo })
  })

  protectedRoutes.get('/api/audit', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { listAudit } = await import('./src/services/audit.ts')
    const url = new URL(req.url ?? '', 'http://localhost')
    const limit = Number(url.searchParams.get('limit') ?? 50)
    const action = url.searchParams.get('action') ?? undefined
    const result = await listAudit(ctx, { limit, action })
    return Response.json(result)
  })

  // 商业化 G4：租户 BYOK 配置（自带模型 Key/端点——Settings 设置）
  protectedRoutes.get('/api/settings/ai-config', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    const { getByokConfig } = await import('./src/services/byok.ts')
    const cfg = await getByokConfig(ctx.sql, ctx.appId)
    return Response.json({ baseUrl: cfg?.base_url ?? '', apiKey: cfg?.api_key ? '******' : '', apiKeySet: !!cfg?.api_key, model: cfg?.model ?? '' })
  })

  protectedRoutes.put('/api/settings/ai-config', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId } = ctx
    const body = await req.json() as { baseUrl?: string; apiKey?: string; model?: string; clear?: boolean }
    if (body.clear) {
      await sql`DELETE FROM app_ai_configs WHERE app_id = ${appId}`
      return Response.json({ ok: true, cleared: true })
    }
    // 已存 key 不回显：apiKey 为空 = 保持原值
    const [cur] = await sql`SELECT api_key FROM app_ai_configs WHERE app_id = ${appId}`
    const finalKey = body.apiKey?.trim() ? body.apiKey.trim() : String((cur as any)?.api_key ?? '')
    await sql`
      INSERT INTO app_ai_configs (app_id, base_url, api_key, model, updated_at)
      VALUES (${appId}, ${body.baseUrl?.trim() ?? null}, ${finalKey || null}, ${body.model?.trim() ?? null}, NOW())
      ON CONFLICT (app_id) DO UPDATE SET
        base_url = EXCLUDED.base_url, api_key = EXCLUDED.api_key,
        model = EXCLUDED.model, updated_at = NOW()
    `
    try {
      const { writeAudit } = await import('./src/services/audit.ts')
      await writeAudit(ctx as any, { action: 'byok_update', target_type: 'app', target_id: appId, detail: { baseUrl: body.baseUrl ?? null, model: body.model ?? null } })
    } catch { /* 尽力 */ }
    return Response.json({ ok: true })
  })

  // 商业化 G6：审计日志 CSV 导出（合规——数据可带走）
  protectedRoutes.get('/api/audit/export', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { listAudit } = await import('./src/services/audit.ts')
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

  // ── R10 GDPR：数据导出（用户可带走自己的数据） ───────────

  protectedRoutes.get('/api/auth/export', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, auth } = ctx
    const uid = auth!.userId
    const [profile] = await sql`SELECT id, email, name, created_at FROM _weifuwu_users WHERE id = ${uid}`
    const memberships = await sql`
      SELECT a.slug, a.name, m.role FROM _weifuwu_app_members m
      JOIN _weifuwu_apps a ON a.id = m.app_id WHERE m.user_id = ${uid}
    `
    const agents = await sql`
      SELECT id, app_id, type, name, description, created_at FROM agents WHERE user_id = ${uid}
    `
    const messages = await sql`
      SELECT m.id, m.department_id, m.content, m.msg_type, m.created_at
      FROM messages m JOIN agents a ON a.id = m.sender_id
      WHERE a.user_id = ${uid}
    `
    const data = { profile, memberships, agents, messages }
    return new Response(JSON.stringify(data, null, 2), {
      headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="my-data.json"' },
    })
  })

  // ── R10 GDPR：账号删除（匿名化级联——保留业务数据，去用户身份） ──

  protectedRoutes.delete('/api/auth/account', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, auth } = ctx
    const uid = auth!.userId
    // 1) 匿名化平台账号（email 唯一约束 → 用 deleted-{id} 占位；密码失效）
    await sql`
      UPDATE _weifuwu_users
      SET email = ${`deleted-${String(uid).slice(0, 8)}@deleted.local`},
          name = '已删除用户',
          password_hash = NULL
      WHERE id = ${uid}
    `
    // 2) 停用绑定的 user Agent（消息历史 sender 不再关联真实身份）
    await sql`UPDATE agents SET is_active = FALSE, name = '已删除用户' WHERE user_id = ${uid}`
    // 3) 移除成员关系
    await sql`DELETE FROM _weifuwu_app_members WHERE user_id = ${uid}`
    // 4) 清除会话（refresh token 失效）
    await sql`DELETE FROM _weifuwu_sessions WHERE user_id = ${uid}`
    // 审计（用户 id 已匿名——记录 app 级事件）
    try {
      const { writeAudit } = await import('./src/services/audit.ts')
      await writeAudit(ctx as any, { action: 'account_deleted', target_type: 'user', target_id: String(uid), detail: {} })
    } catch { /* 尽力 */ }
    return Response.json({ success: true, message: '账号已删除（数据已匿名化）' })
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
    return Response.json(await buildStats(ctx))
  })

  /** 应用统计聚合（/api/stats 与价值报告共用） */
  async function buildStats(ctx: AppCtx): Promise<Record<string, unknown>> {
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

    // 近 14 天成本趋势（agent_logs 按天聚合——老板看运营成本走势）
    const costTrend = await sql`
      SELECT DATE(created_at) as day,
        COALESCE(SUM(tokens_prompt), 0)::int as prompt,
        COALESCE(SUM(tokens_completion), 0)::int as completion,
        COALESCE(SUM(tokens_total), 0)::int as total
      FROM agent_logs
      WHERE app_id = ${appId} AND created_at >= NOW() - INTERVAL '14 days'
      GROUP BY DATE(created_at) ORDER BY day
    `

    // 近 14 天消息趋势 + 活跃 Agent 数（留存维度——运营看活跃）
    const trend = await sql`
      SELECT
        DATE(m.created_at) as day,
        COUNT(*)::int as count,
        COUNT(DISTINCT m.sender_id)::int as active_agents
      FROM messages m
      JOIN agents a ON a.id = m.sender_id
      WHERE a.app_id = ${appId}
        AND m.created_at >= NOW() - INTERVAL '14 days'
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

    // 预估成本（DeepSeek 参考价：输入 ¥2/百万 tokens · 输出 ¥8/百万——估算，非计费）
    const ts = tokenStats as any
    const PRICE_IN = 2 / 1_000_000
    const PRICE_OUT = 8 / 1_000_000
    const estCostYuan = Number(((ts?.total_prompt ?? 0) * PRICE_IN + (ts?.total_completion ?? 0) * PRICE_OUT).toFixed(2))
    const costTrendYuan = (costTrend as Array<Record<string, any>>).map((d) => ({
      day: String(d.day).slice(5, 10),
      total: Number(d.total ?? 0),
      costYuan: Number(((Number(d.prompt ?? 0) * PRICE_IN + Number(d.completion ?? 0) * PRICE_OUT)).toFixed(2)),
    }))

    // ── 商业化 G10 ROI 估算：AI 回复数 × 单条人工成本 − AI 成本 = 节省 ──
    // 假设：人工处理一条消息/任务平均 3 分钟 × 时薪 40 元 ≈ ¥2/条（可配置常量）
    const COST_PER_AI_REPLY = 2
    // R6-3 质量指标：工具执行成功率（agent_logs success）+ AI 消息反馈汇总（分查——防 JOIN 膨胀）
    const [quality] = await sql`
      SELECT COUNT(*)::int AS runs, COUNT(*) FILTER (WHERE success)::int AS ok_runs
      FROM agent_logs WHERE app_id = ${appId}
    `
    const [feedback] = await sql`
      SELECT
        COALESCE(COUNT(*) FILTER (WHERE feedback = 'like'), 0)::int AS likes,
        COALESCE(COUNT(*) FILTER (WHERE feedback = 'dislike'), 0)::int AS dislikes
      FROM messages m JOIN agents a ON a.id = m.sender_id
      WHERE a.app_id = ${appId} AND m.feedback IS NOT NULL
    `
    const toolSuccessRate = Number((quality as any)?.runs ?? 0) > 0
      ? Math.round(Number((quality as any)?.ok_runs ?? 0) / Number((quality as any)?.runs ?? 0) * 100)
      : null

    const [aiMsgRow] = await sql`
      SELECT COUNT(*)::int AS cnt FROM messages m
      JOIN agents a ON a.id = m.sender_id
      WHERE a.app_id = ${appId} AND a.type = 'ai' AND m.ai_approved IS NOT NULL
        AND m.created_at >= DATE_TRUNC('month', NOW())
    `
    const aiRepliesMonth = Number((aiMsgRow as any)?.cnt ?? 0)
    const savedYuan = Math.max(0, aiRepliesMonth * COST_PER_AI_REPLY - estCostYuan).toFixed(2)

    return {
      agents: agentStats,
      departments: deptStats,
      messages: msgStats,
      tokens: tokenStats,
      estCostYuan,
      costTrend: costTrendYuan,
      trend,
      active_agents: activeAgents,
      roi: { aiRepliesMonth, costPerReply: COST_PER_AI_REPLY, estCostYuan, savedYuan: Number(savedYuan) },
      quality: { toolSuccessRate, likes: Number((feedback as any)?.likes ?? 0), dislikes: Number((feedback as any)?.dislikes ?? 0) },
    }
  }

  // ── 试用期价值报告（销售转化物料：ROI/使用量/质量 → HTML 可打印 PDF） ──
  protectedRoutes.get('/api/stats/report', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const s = await buildStats(ctx) as any
    const [app] = await ctx.sql`SELECT name, plan, trial_ends_at FROM _weifuwu_apps WHERE id = ${ctx.appId}`
    const [used] = await ctx.sql`
      SELECT COALESCE(SUM(tokens_total), 0)::int AS used FROM agent_logs WHERE app_id = ${ctx.appId} AND created_at >= DATE_TRUNC('month', NOW())
    `
    const appName = String(app?.name ?? '本应用')
    const planLabel = String(app?.plan ?? 'free') === 'pro' ? '专业版' : '免费试用'
    const roi = s.roi ?? { aiRepliesMonth: 0, costPerReply: 2, estCostYuan: 0, savedYuan: 0 }
    const quality = s.quality ?? { toolSuccessRate: null, likes: 0, dislikes: 0 }
    const msgTotal = s.messages?.total ?? 0
    const aiCount = s.agents?.ai_count ?? 0
    const tokens = s.tokens ?? { total_tokens: 0 }
    const costTrend = (s.costTrend ?? []) as Array<{ day: string; costYuan: number }>
    const active = (s.active_agents ?? []) as Array<{ name: string; type: string; message_count: number }>
    const quota = Number((used as any)?.used ?? 0)
    const trendLine = costTrend.map((d) => `${d.day}:¥${d.costYuan}`).join(' → ')

    const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>AI 价值报告 — ${appName}</title>
<style>
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; max-width: 720px; margin: 40px auto; padding: 0 24px; color: #1f2937; }
  h1 { font-size: 24px; margin-bottom: 4px; } .sub { color: #6b7280; font-size: 13px; margin-bottom: 24px; }
  .hero { background: #f3f4f6; border-radius: 12px; padding: 20px 24px; margin-bottom: 24px; }
  .hero .big { font-size: 36px; font-weight: 700; color: #059669; }
  .hero .cap { color: #6b7280; font-size: 13px; margin-top: 4px; }
  h2 { font-size: 16px; border-left: 3px solid #2563eb; padding-left: 10px; margin: 28px 0 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td, th { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; text-align: left; }
  th { color: #6b7280; font-weight: 500; }
  .muted { color: #6b7280; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px; }
  @media print { body { margin: 0; } }
</style></head><body>
  <h1>AI 价值报告</h1>
  <div class="sub">${appName} · ${planLabel} · 生成于 ${new Date().toLocaleString('zh-CN')} · 统计范围：全部历史 + 近 14 天趋势</div>

  <div class="hero">
    <div class="big">¥${roi.savedYuan}</div>
    <div class="cap">本月预计节省（${roi.aiRepliesMonth} 条 AI 处理 × ¥${roi.costPerReply}/条人工成本 − AI 成本 ¥${roi.estCostYuan}）</div>
  </div>

  <h2>使用概况</h2>
  <table>
    <tr><td>总消息数</td><td>${msgTotal} 条</td><td>AI 成员</td><td>${aiCount} 个</td></tr>
    <tr><td>本月 token 消耗</td><td>${quota.toLocaleString()}</td><td>工具执行成功率</td><td>${quality.toolSuccessRate === null ? '—' : quality.toolSuccessRate + '%'}</td></tr>
    <tr><td>质量反馈</td><td>👍 ${quality.likes} · 👎 ${quality.dislikes}</td><td>AI 回复数（本月）</td><td>${roi.aiRepliesMonth} 条</td></tr>
  </table>

  <h2>近 14 天成本趋势</h2>
  <p class="muted">${trendLine || '暂无数据'}</p>

  <h2>活跃成员排行（近 7 天）</h2>
  <table>
    <tr><th>成员</th><th>类型</th><th>消息数</th></tr>
    ${active.map((a: any) => `<tr><td>${a.name}</td><td>${a.type === 'ai' ? 'AI' : a.type}</td><td>${a.message_count}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">暂无活跃数据</td></tr>'}
  </table>

  <h2>价值总结</h2>
  <p>${msgTotal > 0
    ? `过去 ${msgTotal > 100 ? '30' : '14'} 天里，${aiCount} 个 AI 成员处理了 ${msgTotal} 条消息，工具执行成功率 ${quality.toolSuccessRate === null ? '—' : quality.toolSuccessRate + '%'}，为您节省约 ¥${roi.savedYuan}。AI 正在成为您团队里干活最勤快的同事。`
    : '开始使用：在群里 @AI 成员下达第一个任务，两周后这里会有一份属于您的价值报告。'}</p>

  <div class="footer">agent-platform · AI 价值报告 · 数据来自您自己的私有化部署</div>
</body></html>`

    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
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

  // ── 邮件通知（商业化 G5：审批请求通知）——无 SMTP/RESEND 配置时降级 no-op ──
  app.use(email({
    from: process.env.EMAIL_FROM ?? 'no-reply@agent-platform.local',
    adapter: process.env.SMTP_HOST
      ? 'smtp'
      : process.env.RESEND_API_KEY
        ? 'resend'
        : (async () => ({ ok: true, id: 'noop' })) as any,  // 未配置：no-op 适配器（不阻断）
    smtp: process.env.SMTP_HOST ? {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      secure: process.env.SMTP_SECURE === 'true',
    } : undefined,
    resend: process.env.RESEND_API_KEY ? { apiKey: process.env.RESEND_API_KEY } : undefined,
  }))
  app.ws('/ws', messagerSystem.client.handler())

  // ── 问卷实时联动 WS（框架 router.ws + hub 房间——逐题同步/提交锁定） ──
  app.ws('/survey-live', {
    open: (ws: any, ctx: any) => {
      ctx.hub.join('survey-live', ws)
      surveyHub = ctx.hub
      // 连接即发当前状态（统计页/填写页初始渲染）
      ws.send(JSON.stringify(surveyState()))
    },
    message: (ws: any, ctx: any, data: string | Buffer) => {
      try {
        const msg = JSON.parse(String(data))
        // 在线报到：填写页连接后发 hello（统计页只订阅不发——不计入在线）
        if (msg.type === 'survey:hello' && msg.source) {
          surveyOnline.set(ws, { source: String(msg.source).slice(0, 40), at: new Date().toISOString() })
          surveyBroadcastOnline()
          return
        }
        if (msg.type === 'survey:answer' && msg.question) {
          // 逐题同步：填写页每完成一题 → 广播（统计页实时滚动）
          const record = {
            source: String(msg.source ?? '访客'),
            question: String(msg.question).slice(0, 100),
            answer: String(msg.answer ?? '').slice(0, 300),
            at: new Date().toISOString(),
          }
          surveyAnswers.push(record)
          if (surveyAnswers.length > surveyLimit) surveyAnswers.splice(0, surveyAnswers.length - surveyLimit)
          surveyBroadcast({ type: 'survey:answer', ...record })
        } else if (msg.type === 'survey:submit' && msg.data) {
          // 提交：入内存 + 广播（统计页计数 +1、来源锁定）
          const d = msg.data
          const record = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            source: String(msg.source ?? '访客'),
            submitted_at: new Date().toISOString(),
            age: String(d.age ?? ''), industry: String(d.industry ?? ''), rating: Number(d.rating ?? 0),
            focus: Array.isArray(d.focus) ? d.focus : (d.focus ? [d.focus] : []),
            feedback: String(d.feedback ?? '').slice(0, 500),
          }
          surveySubmissions.push(record)
          if (surveySubmissions.length > surveyLimit) surveySubmissions.splice(0, surveySubmissions.length - surveyLimit)
          surveyBroadcast({ type: 'survey:submitted', count: surveySubmissions.length, latest: record })
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
        return Response.json({ error: 'Request body too large (max 64KB)' }, { status: 413 })
      }
      const body = await req.json()
      // R3 计量收口：Webhook 调用受计划配额约束（免费版到期/超限 → 402）
      const { planBlockForApp } = await import('./src/services/webhook.ts')
      const [whAgent] = await ctx.sql`SELECT app_id FROM agents WHERE id = ${ctx.params.agentId} AND type = 'webhook'`
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
    try { body = rawBody ? JSON.parse(rawBody) : {} } catch { return Response.json({ error: '无效 JSON' }, { status: 400 }) }
    const { parseImInbound } = await import('./src/services/im-inbound.ts')
    let msg: any
    try {
      msg = parseImInbound(ctx.params.platform, body as Record<string, any>)
    } catch (e: any) {
      return Response.json({ error: e?.message ?? '解析失败' }, { status: 400 })
    }

    // 查绑定了部门的 IM 机器人（webhook agent + im_bind_dept 非空）
    const agents = await pg.sql`
      SELECT id, name, webhook_platform, webhook_url, im_bind_dept, webhook_secret FROM agents
      WHERE type = 'webhook' AND im_bind_dept IS NOT NULL AND is_active = TRUE
      LIMIT 1
    `
    const whAgent = (Array.isArray(agents) ? agents : [agents])[0] as any
    if (!whAgent?.im_bind_dept) {
      return Response.json({ error: '未配置 IM 绑定部门（Webhook Agent 需绑定 im_bind_dept）' }, { status: 404 })
    }

    // G8 验签（安全底线）：配置了 webhook_secret 时强制校验
    const secret = whAgent.webhook_secret ? String(whAgent.webhook_secret) : ''
    if (secret) {
      const { verifySignature, checkNonce, verifyDingtalkSign } = await import('./src/services/webhook.ts')
      const hmacOk = verifySignature(rawBody,
        req.headers.get('x-signature') ?? '', secret,
        req.headers.get('x-timestamp') ?? undefined)
      // 钉钉官方：timestamp + sign 头
      const dt = req.headers.get('timestamp') ?? ''
      const dtSign = req.headers.get('sign') ?? ''
      const dingOk = dt && dtSign ? verifyDingtalkSign(body, dt, dtSign, secret) : false
      if (!hmacOk && !dingOk) {
        return Response.json({ error: '签名校验失败（需 X-Signature 或钉钉 timestamp+sign）' }, { status: 403 })
      }
      // Replay 防护（HMAC 路径）
      if (!checkNonce(req.headers.get('x-nonce') ?? undefined, req.headers.get('x-timestamp') ?? undefined)) {
        return Response.json({ error: '重放请求' }, { status: 403 })
      }
    }

    // 消息进绑定部门——同步收集 AI 回复（SSE 路径：write 回调分片——累积 buffer 再匹配）
    let reply = ''
    let sseBuf = ''
    const { handleNewMessageStreamSSE } = await import('./src/services/chat.ts')
    await handleNewMessageStreamSSE(ctx, String(whAgent.im_bind_dept), msg.content, (chunk: string) => {
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
    const { formatOutboundBody } = await import('./src/services/webhook-platform.ts')
    const out = formatOutboundBody(String(whAgent.webhook_platform ?? 'generic'), reply || '（AI 未生成回复）', msg.conversationId)
    return new Response(out, { headers: { 'Content-Type': 'application/json' } })
  })

  // ── 问卷实时联动（框架 WS——2 页联动，不落库） ──
  const surveyAnswers: Array<Record<string, unknown>> = []        // 逐题回答（内存）
  const surveySubmissions: Array<Record<string, unknown>> = []    // 已提交（内存）
  const surveyLimit = 20
  let surveyHub: import('weifuwu').Hub | null = null              // WS 房间（app.ws open 时捕获）
  const surveyOnline = new Map<any, { source: string; at: string }>()  // 在线填写者（ws → source）
  const surveyBroadcast = (event: Record<string, unknown>) => {
    surveyHub?.send('survey-live', JSON.stringify(event))
  }
  const surveyState = () => ({
    type: 'survey:state',
    count: surveySubmissions.length,
    answers: surveyAnswers.slice(-surveyLimit),
    submissions: surveySubmissions.slice(-surveyLimit),
    online: { count: surveyOnline.size, sources: [...surveyOnline.values()].map((v) => v.source) },
  })
  const surveyBroadcastOnline = () => {
    surveyBroadcast({
      type: 'survey:online',
      count: surveyOnline.size,
      sources: [...surveyOnline.values()].map((v) => v.source),
    })
  }

  // ── 本地 CDN：问卷 CDN 页面的框架资源（dist——客户环境可无外网） ──
  const distRoot = join(__dirname, '..', '..', 'dist')
  app.get('/static/ui-dom/index.js', async (): Promise<Response> => {
    const { readFileSync } = await import('node:fs')
    return new Response(readFileSync(join(distRoot, 'ui-dom', 'index.js'), 'utf-8'), { headers: { 'Content-Type': 'text/javascript; charset=utf-8' } })
  })
  app.get('/static/components/index.js', async (): Promise<Response> => {
    const { readFileSync } = await import('node:fs')
    return new Response(readFileSync(join(distRoot, 'components', 'index.js'), 'utf-8'), { headers: { 'Content-Type': 'text/javascript; charset=utf-8' } })
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

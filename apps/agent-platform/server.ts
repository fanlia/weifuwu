/**
 * agent-platform server — 多租户 AI Agent 平台
 *
 * 启动方式:
 *   node --env-file=.env apps/agent-platform/server.ts
 */

import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context, QueueWorker } from 'weifuwu'
import type { AppCtx } from './src/middleware/ctx.ts'
import { serve, Router, cors, postgres, redis, queue, ui, userSystem, ai, messager, rateLimit, verifyPassword, email } from 'weifuwu'
import { readFileSync } from 'node:fs'

// ── 中间件 ────────────────────────────────────────────────

// ── 路由 ──────────────────────────────────────────────────
import { registerAuthRoutes } from './src/routes/auth.ts'
import { registerAgentRoutes } from './src/routes/agents.ts'
import { registerWorkspaceRoutes } from './src/routes/workspace.ts'
import { registerDepartmentRoutes } from './src/routes/departments.ts'
import { registerDemoRoutes } from './src/routes/demo.ts'
import { registerSandboxRoutes } from './src/routes/sandboxes.ts'
import { registerAiEventRoutes } from './src/routes/ai-events.ts'
import { registerMessageRoutes } from './src/routes/messages.ts'
import { registerKnowledgeRoutes } from './src/routes/knowledge.ts'
import { registerSurveyRoutes } from './src/routes/survey.ts'

// ── 服务 ──────────────────────────────────────────────────
import { handleNewMessage } from './src/services/chat.ts'
import { handleWebhookMessage } from './src/services/webhook.ts'

// ── 内置工具 + Skills ─────────────────────────────────────
import { registerBuiltinTools, BUILTIN_TOOL_DEFS } from './src/tools/builtin.ts'
import { registerSkillRoutes } from './src/routes/skills.ts'
import { registerRoleTemplateRoutes } from './src/routes/role-templates.ts'
import { registerAdminRoutes } from './src/routes/admin.ts'
import { registerDeliverableRoutes } from './src/routes/deliverables.ts'
import { registerStatsRoutes } from './src/routes/stats.ts'

// ── UI ────────────────────────────────────────────────────
import { registerUiRoutes } from './src/ui/routes.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main() {
  // 2026-12 外部地址推导：PUBLIC_BASE_URL 未配置或含 localhost 时推导宿主 IP——
  // 消息/问卷链接给可达地址（容器内 AI 访问宿主用 host.docker.internal——提示词已有）
  try {
    if (!process.env.PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL.includes('localhost')) {
      // 纯 JS 获取宿主 IP（node:os——不依赖 hostname/ip 命令，容器/精简环境可靠）
      const os = await import('node:os')
      const nets = os.networkInterfaces()
      const ip = Object.values(nets)
        .flat()
        .find((n) => n?.family === 'IPv4' && !n.internal)?.address
      if (ip) {
        process.env.PUBLIC_BASE_URL = `http://${ip}:${process.env.PORT ?? 3000}`
        console.log(`[agent-platform] PUBLIC_BASE_URL 自动推导：${process.env.PUBLIC_BASE_URL}`)
      }
    }
  } catch { /* 推导失败用默认 */ }
  const app = new Router<AppCtx>()

  // ── 指标收集（内存计数器——/api/metrics 暴露） ─────────────────
  const metrics = {
    requests: 0, errors: 0,
    // E2（2026-08）：错误细分——5xx 响应 / 未捕获异常（errors = 之和——兼容旧消费）
    errors5xx: 0, errorsCaught: 0,
    aiCalls: 0, aiTokens: 0, aiLatencyMs: 0,
    webhooks: 0, sandboxCalls: 0,
    startTime: Date.now(),
  }
  ;(globalThis as any).__platform_metrics = metrics

  // ── 全局中间件 ──────────────────────────────────────────
  app.use(cors())


  // ── 数据库 ──────────────────────────────────────────────
  // 主池：10 并发 AI 执行（每任务 2+ SQL 连接）+ 常规请求——acquireTimeoutMs 防池满无限排队（卡住）
  // DATABASE_POOL_MAX 覆盖（2026-08——测试峰值连接（15+ spawn server × 50）
  // 击穿 PG max=100——测试环境用小池（UI 测试低并发——8 足够））
  // idle_timeout/max_lifetime（2027-10——watch 重启连接击穿实证）：postgres.js
  // 默认 idle_timeout=0——峰值开出的连接永不收缩（实测单实例 idle 49）——
  // dev --watch 重启叠加期 49+50 > PG max=100 → 启动失败 too many clients；
  // 空闲 30s 收缩 + 连接最长寿命 30min 换血——碰撞窗口结构性消除
  const poolMax = parseInt(process.env.DATABASE_POOL_MAX ?? '50', 10)
  const pg = postgres({
    max: poolMax,
    acquireTimeoutMs: 10_000,
    // 空闲收缩（2027-10——watch 重启连接击穿实证）：默认 0 峰值连接永不收缩
    // （实测单实例 idle 49）——重启叠加期 49+50 > PG max=100 → 启动失败。
    // 30s 收缩 + dev 单人低并发——碰撞窗口结构性消除（框架 client 已透传 reaper）
    idle_timeout: parseInt(process.env.DATABASE_POOL_IDLE_TIMEOUT ?? '30000', 10),
  })
  app.use(pg)
  // 事件日志独立池（2026-08——沙盒事件——shutdown 需关闭——否则每测试
  // spawn 泄漏 3 连接——多测试文件串行 → 池累积 → PG too many clients）
  let eventsPg: ReturnType<typeof postgres> | null = null

  // ── 请求日志（结构化 JSON 行 + 请求 id——可观测性基础；pg 之后——ctx.sql 已注入） ──
  app.use(async (req: Request, ctx: Context, next: any) => {
    const id = Math.random().toString(36).slice(2, 10)
    const url = new URL(req.url ?? '', 'http://localhost')
    const start = Date.now()
    metrics.requests++
    try {
      const res = await next(req, ctx)  // 必须显式传 req/ctx（dispatch 不传参数会变 undefined——框架约定）
      const status = (res as Response)?.status ?? 200
      if (status >= 500) { metrics.errors++; metrics.errors5xx++ }
      console.log(JSON.stringify({
        ts: new Date().toISOString(), id, method: req.method, path: url.pathname,
        status, ms: Date.now() - start,
      }))
      return res
    } catch (e) {
      metrics.errors++
      metrics.errorsCaught++
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
  // S1 问卷批量任务（Campaign——总量/并发可配置——调度器水位派单）
  await pg.sql.unsafe(`CREATE TABLE IF NOT EXISTS survey_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id UUID NOT NULL REFERENCES _weifuwu_apps(id) ON DELETE CASCADE,
    total INT NOT NULL, concurrency INT NOT NULL, url TEXT NOT NULL DEFAULT '',
    retry INT NOT NULL DEFAULT 2, status TEXT NOT NULL DEFAULT 'running',
    completed INT NOT NULL DEFAULT 0, failed INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`)
  await pg.sql.unsafe(`CREATE TABLE IF NOT EXISTS survey_campaign_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES survey_campaigns(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL, agent_name TEXT NOT NULL, dept_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued', attempts INT NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ, error TEXT)`)
  // 问卷提交/逐题持久化（2027-09 实证——S7b：提交只在内存——重启 80 份丢失 +
  // surveyLimit=20 截断——stats 页永远 20——落库后重启恢复 + 全量统计）
  await pg.sql.unsafe(`CREATE TABLE IF NOT EXISTS survey_submissions (
    id TEXT PRIMARY KEY, source TEXT NOT NULL, age TEXT, industry TEXT,
    rating INT, focus JSONB, feedback TEXT, submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`)
  await pg.sql.unsafe(`CREATE TABLE IF NOT EXISTS survey_answers (
    id BIGSERIAL PRIMARY KEY, source TEXT NOT NULL, question TEXT,
    answer TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`)
  await pg.sql.unsafe(`ALTER TABLE survey_submissions ADD COLUMN IF NOT EXISTS campaign_id TEXT`)
  await pg.sql.unsafe(`ALTER TABLE survey_answers ADD COLUMN IF NOT EXISTS campaign_id TEXT`)
  await pg.sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_survey_campaigns_app ON survey_campaigns(app_id, created_at DESC)`)
  await pg.sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_survey_runs_campaign ON survey_campaign_runs(campaign_id, status)`)
  await pg.sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_skill_ratings_dir ON skill_ratings(skill_dir)`)
    await pg.sql.unsafe(`CREATE TABLE IF NOT EXISTS answer_cache (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), app_id UUID NOT NULL, question TEXT NOT NULL, answer TEXT NOT NULL, hits INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`)
  await pg.sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_answer_cache_app ON answer_cache(app_id)`)
  // O11 编排任务树（Wave 3）：runs 表（父→子任务链——审计面）
  await pg.sql.unsafe(`CREATE TABLE IF NOT EXISTS agent_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id UUID NOT NULL,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    orchestrator_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    parent_run_id UUID REFERENCES agent_runs(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'orchestration',
    plan_json JSONB,
    worker_results JSONB,
    status TEXT NOT NULL DEFAULT 'planned',
    request_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`)
  await pg.sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_agent_runs_app ON agent_runs(app_id, created_at DESC)`)
  await pg.sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_agent_runs_parent ON agent_runs(parent_run_id)`)
    await pg.sql.unsafe(`CREATE TABLE IF NOT EXISTS group_memories (department_id UUID PRIMARY KEY, summary TEXT, msg_count INT NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`)
  await pg.sql.unsafe(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS expertise TEXT`)
  // 三层模型（2026-12）：部门 = 工作目录——workspace_path 自定义工作目录（默认 {root}/{id}）
  await pg.sql.unsafe(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS workspace_path TEXT`)
  // 产物审批模式（2026-12）：AI 新产物先入 .pending 待审区——批准后发布到共享目录
  await pg.sql.unsafe(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS artifact_review BOOLEAN NOT NULL DEFAULT FALSE`)
  // 组织层级（2026-12）：agent type = 'department'（部门经理——代表部门对外协作）
  await pg.sql.unsafe(`ALTER TYPE agent_type ADD VALUE IF NOT EXISTS 'department'`)
  await pg.sql.unsafe(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS department_id UUID`)
  await pg.sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_agents_department ON agents(department_id) WHERE department_id IS NOT NULL`)
  // 三层模型：sandbox = 计算资源（一级概念）——sandboxes 表 + 租户配额
  await pg.sql.unsafe(`ALTER TABLE _weifuwu_apps ADD COLUMN IF NOT EXISTS sandbox_quota INT NOT NULL DEFAULT 5`)
  await pg.sql.unsafe(`CREATE TABLE IF NOT EXISTS sandboxes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id      UUID NOT NULL,
    department_id UUID,
    name        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'requested',
    mode        TEXT NOT NULL DEFAULT 'persistent',
    image       TEXT NOT NULL DEFAULT 'ap-sandbox:latest',
    network     BOOLEAN NOT NULL DEFAULT FALSE,
    memory_mb   INT NOT NULL DEFAULT 512,
    cpus        INT NOT NULL DEFAULT 1,
    error       TEXT,
    workspace   TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    expires_at  TIMESTAMPTZ,
    terminated_at TIMESTAMPTZ
  )`)
  await pg.sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_sandboxes_dept ON sandboxes(department_id)`)
  // 沙盒事件日志（2026-12 可观测性）
  await pg.sql.unsafe(`CREATE TABLE IF NOT EXISTS sandbox_events (
    id BIGSERIAL PRIMARY KEY,
    sandbox_id UUID NOT NULL,
    app_id UUID,
    type TEXT NOT NULL,
    detail TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`)
  await pg.sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_sandbox_events_sb ON sandbox_events(sandbox_id, created_at DESC)`)
  await pg.sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_sandboxes_status ON sandboxes(status, last_used_at)`)
  await pg.sql.unsafe(`CREATE UNIQUE INDEX IF NOT EXISTS idx_sandboxes_dept_active ON sandboxes(department_id) WHERE department_id IS NOT NULL AND status != 'terminated'`)
  // 镜像升级（2026-12）：node:24 → ap-sandbox:latest（agent-browser/python/office）——存量记录不迁移（快照兼容，容器重建时按快照）
  await pg.sql.unsafe(`ALTER TABLE sandboxes ALTER COLUMN image SET DEFAULT 'ap-sandbox:latest'`)
  await pg.sql.unsafe(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS webhook_platform TEXT NOT NULL DEFAULT 'generic'`)
  // R6 质量反馈：AI 消息点赞/点踩（'like'/'dislike'/NULL）
  await pg.sql.unsafe(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS feedback TEXT`)
  // O8 意图路由（Wave 2）：消息由语义路由派给的目标 Agent 名（null=未路由/直发）
  await pg.sql.unsafe(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS routed_to TEXT`)
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
  // CHAT-INTERACTION 波次 2：HITL 快捷确认选项（AI 确认型提问 [[choices:a|b]] 标记剥离后落列）
  await pg.sql.unsafe(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS quick_replies JSONB`)
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

  // ── 后台任务队列（weifuwu queue——视频生成异步轮询依赖）─────────
  let videoQueueModule: ReturnType<typeof queue> | null = null
  let videoWorker: QueueWorker | null = null
  if (hasRedis) {
    videoQueueModule = queue({ redis: redisClient.redis })
    app.use(videoQueueModule)
    console.log('[agent-platform] 后台任务队列已启用')
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
    // RATE_LIMIT_MAX：全局阈值可调（企业内网多用户同 NAT 出口 IP——默认 2000/60s
    // 宽松——开发/内网高频页面访问不误伤；防滥用语义仍在（2000 仍远高于正常使用））
    const globalMax = Number(process.env.RATE_LIMIT_MAX ?? 2000)
    const globalRateLimit = rateLimit({ windowMs: 60_000, max: globalMax, redis: redisClient.redis })
    app.use((req: Request, ctx: Context, next: any) => {
      // req.url 是完整 URL（含 host）——取 path 判断
      const path = (req.url ?? '').replace(/^https?:\/\/[^/]+/, '')
      if (path.startsWith('/api/webhook/')) return next(req, ctx)
      // 限流面收敛到 API：静态资源/页面 HTML 非滥用面（每次页面访问 3+ 请求——
      // 耗配额无意义——页面白屏变 429 JSON 实证；测试/内网高频访问亦误伤）
      if (!path.startsWith('/api/')) return next(req, ctx)
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

  // ── 视频生成后台 worker（异步轮询队列——Redis 未配置则视频工具不可用）──
  if (videoQueueModule) {
    const { createVideoPollWorker, requeuePendingVideoTasks } = await import('./src/tools/video-gen.ts')
    const bootCtx = { sql: pg.sql } as AppCtx
    videoWorker = createVideoPollWorker(videoQueueModule.queue, () => currentCtx ?? bootCtx)
    try {
      await videoWorker.start()
      const n = await requeuePendingVideoTasks(pg.sql, videoQueueModule.queue)
      if (n > 0) console.log(`[agent-platform] 已重排 ${n} 个未完成视频任务`)
      console.log('[agent-platform] 视频生成后台 worker 已启动')
    } catch (e: any) {
      console.error('[agent-platform] 视频后台 worker 启动失败（视频工具不可用）:', e?.message ?? e)
    }
  }

  // ── 沙盒初始化（S2：探测 + 孤儿清理 + Heartbeat 回收） ──
  const { sandbox } = await import('./src/sandbox/docker.ts')
  const sandboxStatus = await sandbox.status()
  if (sandboxStatus.enabled && sandboxStatus.available) {
    // 三层模型：生命周期由 SandboxManager 驱动（DB 单一事实源）——
    // 启动立即 reconcile 一轮（恢复状态/孤儿清理），然后周期收敛
    const { manager } = await import('./src/sandbox/manager.ts')
    // 事件日志独立连接池（不抢主池——并发 AI 执行风暴时诊断写入不阻塞业务查询）
    eventsPg = postgres({ max: 3, acquireTimeoutMs: 5_000 })
    manager.init(pg.sql, eventsPg.sql)
    manager.startReaper()
    void manager.reconcile().then((s) => {
      console.log(`[agent-platform] 沙盒 reconcile 首轮完成：started=${s.started} stopped=${s.stopped} terminated=${s.terminated} 孤儿清理=${s.orphans}`)
    })
    console.log(`[agent-platform] 沙盒就绪：${sandboxStatus.mode} · 镜像 ${process.env.SANDBOX_IMAGE ?? 'ap-sandbox:latest'}（生命周期 DB 驱动——reconcile 60s）`)
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
      if (hasRedis) { await redisClient.redis.command('PING'); deps.redis = true }
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
    // M6-2：沙盒生命周期计数（修复 sandboxCalls 死指标——manager.runTool 入口自增）
    let sbCounters: Record<string, unknown> = {}
    try {
      const { manager } = await import('./src/sandbox/manager.ts')
      const { sandbox } = await import('./src/sandbox/docker.ts')
      sbCounters = { ...manager.counters, exec: sandbox.execStats }
    } catch { /* 沙盒未初始化 */ }
    const lines = [
      `# HELP agent_platform_uptime_seconds 服务运行时长`,
      `agent_platform_uptime_seconds ${uptime}`,
      `agent_platform_requests_total ${m.requests ?? 0}`,
      `agent_platform_errors_total ${m.errors ?? 0}`,
      `agent_platform_ai_calls_total ${m.aiCalls ?? 0}`,
      `agent_platform_ai_tokens_total ${m.aiTokens ?? 0}`,
      `agent_platform_webhooks_total ${m.webhooks ?? 0}`,
      `agent_platform_sandbox_calls_total ${m.sandboxCalls ?? 0}`,
      `agent_platform_sandbox_created_total ${(sbCounters as any).created ?? 0}`,
      `agent_platform_sandbox_terminated_total ${(sbCounters as any).terminated ?? 0}`,
      `agent_platform_sandbox_evicted_total ${(sbCounters as any).evicted ?? 0}`,
      `agent_platform_sandbox_idle_stopped_total ${(sbCounters as any).idleStopped ?? 0}`,
      `agent_platform_sandbox_exec_total ${((sbCounters as any).exec as any)?.execCount ?? 0}`,
      `agent_platform_sandbox_exec_errors_total ${((sbCounters as any).exec as any)?.execErrors ?? 0}`,
      `agent_platform_sandbox_exec_timeouts_total ${((sbCounters as any).exec as any)?.execTimeouts ?? 0}`,
      `agent_platform_disk_free_percent ${disk?.freePercent ?? -1}`,
    ]
    return new Response(lines.join('\n') + '\n', {
      headers: { 'Content-Type': 'text/plain; version=0.0.4' },
    })
  })

  app.get('/api/metrics', async () => {
    const m = (globalThis as any).__platform_metrics ?? {}
    const uptime = Math.round((Date.now() - (m.startTime ?? Date.now())) / 1000)
    // 2026-12 运维：pg 连接池水位（池耗尽预警——演示事故的预防）
    let pgActive = -1
    let pgTotal = -1
    try {
      const [row] = await pg.sql`SELECT count(*) FILTER (WHERE state = 'active')::int as active, count(*)::int as total FROM pg_stat_activity`
      pgActive = Number((row as any)?.active ?? -1)
      pgTotal = Number((row as any)?.total ?? -1)
    } catch { /* 查询失败 */ }
    // M6-2：沙盒生命周期计数（manager.counters + 执行器 execStats）
    let sb: Record<string, unknown> = {}
    try {
      const { manager } = await import('./src/sandbox/manager.ts')
      const { sandbox } = await import('./src/sandbox/docker.ts')
      // P3-3：状态计数（DB 快照——reconcile 后的现实）
      let statusCounts: Record<string, number> = {}
      try {
        const rows = await manager.statusCounts()
        statusCounts = rows
      } catch { /* 查询失败 */ }
      sb = {
        calls: m.sandboxCalls ?? 0,
        created: manager.counters.created,
        terminated: manager.counters.terminated,
        evicted: manager.counters.evicted,
        idleStopped: manager.counters.idleStopped,
        autoStarted: manager.counters.autoStarted,
        orphansCleaned: manager.counters.orphansCleaned,
        exec: sandbox.execStats,
        statusCounts,
      }
    } catch { /* 沙盒未初始化 */ }
    return Response.json({
      uptimeSec: uptime,
      requests: m.requests ?? 0,
      errors: m.errors ?? 0,
      // E2 细分（5xx 响应 vs 未捕获异常——诊断粒度）
      errors5xx: m.errors5xx ?? 0,
      errorsCaught: m.errorsCaught ?? 0,
      errorRate: m.requests ? Number(((m.errors / m.requests) * 100).toFixed(2)) : 0,
      aiCalls: m.aiCalls ?? 0,
      aiTokens: m.aiTokens ?? 0,
      aiAvgLatencyMs: m.aiCalls ? Math.round((m.aiLatencyMs ?? 0) / m.aiCalls) : 0,
      webhooks: m.webhooks ?? 0,
      sandboxCalls: m.sandboxCalls ?? 0,
      sandbox: sb,
      pgConnections: { active: pgActive, total: pgTotal },
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
  // 一键演示空间（G-A 冷启动）
  registerDemoRoutes(protectedRoutes)
  // P1 任务执行总览：部门执行状态聚合（复用 sandbox_events/runningExecs/产物 mtime）
  protectedRoutes.get('/api/departments/:id/executions', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params } = ctx
    const [dept] = await sql`SELECT id FROM departments WHERE id = ${params.id} AND app_id = ${appId}`
    if (!dept) return Response.json({ error: '部门不存在' }, { status: 404 })
    const { manager } = await import('./src/sandbox/manager.ts')
    manager.init(sql)
    const { sandbox } = await import('./src/sandbox/docker.ts')
    // 成员（ai/department——可执行角色）
    const members = await sql`
      SELECT a.id, a.name, a.role_label, a.type, a.department_id
      FROM department_members dm JOIN agents a ON a.id = dm.agent_id
      WHERE dm.department_id = ${params.id} AND a.type IN ('ai', 'department')
    `
    // 部门最近**用户**消息时间（任务派发起点——AI 回复会推后时间导致早期完成者误判 stalled）
    const [lastMsg] = await sql`SELECT MAX(m.created_at) as at FROM messages m JOIN agents a ON a.id = m.sender_id WHERE m.department_id = ${params.id} AND a.type = 'user'`
    const taskStart = lastMsg?.at ? new Date(String(lastMsg.at)).getTime() : Date.now()
    const now = Date.now()
    const tasks = []
    for (const m of members ?? []) {
      const agentId = String((m as any).id)
      const execDeptId = (m as any).department_id ? String((m as any).department_id) : String(params.id)
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
        const { resolveDepartmentWorkspace } = await import('./src/middleware/workspace.ts')
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
  const { startHostReporting } = await import('./src/sandbox/host-client.ts')
  startHostReporting()
  // 宿主健康检查（阶段 4：定期——事件流心跳超时 → host:down/up）
  const { checkHostHealth } = await import('./src/sandbox/host-health.ts')
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
  const { registerBrowserWarmContract, registerExecTimeoutContract, startEventContracts } = await import('./src/services/event-contracts.ts')
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
      const { markInterrupted } = await import('./src/services/survey-campaign.ts')
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


  // ── 沙盒监控/管理 API（管理员——容器状态/资源/进程/操作） ──
  protectedRoutes.get('/api/sandbox/containers', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    const { sandbox } = await import('./src/sandbox/docker.ts')
    const { sql } = ctx
    const containers = await sandbox.listContainers()
    // 容器名 → agent 名映射（ap-sandbox-{agentId}）
    const ids = containers.map((c) => String(c.name ?? '').replace('ap-sandbox-', ''))
    const agents = ids.length > 0
      ? (await sql`SELECT id, name, type FROM agents WHERE id::text = ANY(string_to_array(${ids.join(',')}, ','))` as any[])
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
    const { sandbox } = await import('./src/sandbox/docker.ts')
    const procs = await sandbox.containerProcesses(ctx.params.name)
    return Response.json({ name: ctx.params.name, processes: procs })
  })

  protectedRoutes.post('/api/sandbox/containers/:name/:action', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sandbox } = await import('./src/sandbox/docker.ts')
    const action = ctx.params.action as 'stop' | 'start' | 'restart' | 'rm'
    if (!['stop', 'start', 'restart', 'rm'].includes(action)) {
      return Response.json({ error: '不支持的 action' }, { status: 400 })
    }
    const r = await sandbox.containerAction(ctx.params.name, action)
    return r.ok ? Response.json(r) : Response.json({ error: r.message }, { status: 400 })
  })


  // 挂载受保护路由
  app.mount('/', protectedRoutes)

  // ── WebSocket（框架 messager：房间广播 + Redis 跨进程） ──
  // M10：transaction 注入（pg.transaction——连接级——会话+成员建库原子——
  // 原框架内 BEGIN/COMMIT unsafe 在池化下断裂——2027-XX 修复）
  const messagerSystem = messager({ sql: pg.sql, transaction: pg.transaction, redis: redisClient?.redis })
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

  // ── 测试钩子（仅 WF_TEST_HOOKS=1——确定性 wf:* 事件注入——UI 回归用——
  //   不依赖真实 LLM——共享 server spawn 时开启） ──
  if (process.env.WF_TEST_HOOKS === '1') {
    app.post('/api/test/wf', async (req: Request) => {
      try {
        const body = await req.json() as { room?: string; events?: any[] }
        if (!body.room || !Array.isArray(body.events)) return Response.json({ error: 'room/events 必填' }, { status: 400 })
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
        const { hostEventIngest } = await import('./src/sandbox/events.ts')
        if (msg?.type === 'sandbox:event' && msg.event?.entity === 'sandbox') {
          hostEventIngest(msg.event)
        } else if (msg?.type === 'host:ping') {
          // 心跳（阶段 4：宿主活跃证明——health 检测用）
          const { sandboxEmit } = await import('./src/sandbox/events.ts')
          sandboxEmit('host:ping', msg.hostId, { hostId: msg.hostId, ts: msg.ts })
        } else if (msg?.type === 'host:register') {
          // 宿主注册（容量视图——调度器基础）
          const { sandboxEmit } = await import('./src/sandbox/events.ts')
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
          void pg.sql`INSERT INTO survey_answers (source, question, answer, campaign_id) VALUES (${String(record.source)}, ${String(record.question)}, ${String(record.answer)}, ${String(record.campaign) || null})`.catch((e: any) => {
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
              const [rr] = await pg.sql`SELECT campaign_id FROM survey_campaign_runs WHERE agent_name = ${String(msg.source ?? '')} ORDER BY created_at DESC LIMIT 1`
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
            await pg.sql`INSERT INTO survey_submissions (id, source, age, industry, rating, focus, feedback, submitted_at, campaign_id)
              VALUES (${String(record.id)}, ${String(record.source)}, ${String(record.age)}, ${String(record.industry)},
                ${Number(record.rating)}, ${JSON.stringify(record.focus)}, ${String(record.feedback)}, ${String(record.submitted_at)}, ${String(record.campaign) || null})`
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
    const { formatOutboundBody } = await import('./src/services/webhook-platform.ts')
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
      const rows = (await pg.sql`SELECT id, source, age, industry, rating, focus, feedback, submitted_at, campaign_id FROM survey_submissions ORDER BY submitted_at DESC LIMIT 1000`) ?? []
      surveyTotal = Number((await pg.sql`SELECT COUNT(*)::int as n FROM survey_submissions`)[0]?.n ?? 0)
      for (const r of [...rows].reverse()) {
        surveySubmissions.push({
          id: String(r.id), source: String(r.source), submitted_at: String(r.submitted_at),
          age: String(r.age ?? ''), industry: String(r.industry ?? ''), rating: Number(r.rating ?? 0),
          focus: r.focus, feedback: String(r.feedback ?? ''),
          campaign: String(r.campaign_id ?? ''),
        })
      }
      const arows = (await pg.sql`SELECT source, question, answer, created_at, campaign_id FROM survey_answers ORDER BY created_at DESC LIMIT 1000`) ?? []
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
      const deptRows = await pg.sql`
        SELECT id, name FROM departments
        WHERE name = ANY(string_to_array(${ROLES.join(',')}, ',')::text[]) AND is_dm = FALSE
      `
      const deptMap = new Map((deptRows ?? []).map((d: any) => [String(d.name), String(d.id)]))
      const missing = ROLES.filter((r) => !deptMap.has(r))
      if (missing.length > 0) {
        return Response.json({ error: `缺少角色部门：${missing.join('、')}（先跑 seed-survey-agents.mjs）` }, { status: 404 })
      }
      const [sender] = await pg.sql`SELECT id FROM agents WHERE app_id = ${ctx.appId} AND type = 'user' LIMIT 1`
      const senderId = sender ? String(sender.id) : 'system'
      const { handleNewMessageStream } = await import('./src/services/chat.ts')
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
      const rows = (await pg.sql`
        SELECT c.id::text AS id, c.status, c.total, c.completed, c.failed, c.created_at,
          (SELECT COUNT(*)::int FROM survey_submissions s WHERE s.campaign_id = c.id::text) AS submitted
        FROM survey_campaigns c ORDER BY c.created_at DESC LIMIT 50`) ?? []
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
  const server = serve(app, { port })
  if (port !== 0) console.log(`[agent-platform] http://localhost:${port}`)

  // ── 优雅关闭 ────────────────────────────────────────────
  // 顺序纪律（2027-10——watch 重启连接击穿实证）：DB 最先关（连接名额是
  // watch 重启碰撞窗口的直接根源）；每段超时兑底——WS/SSE 在途长连接会让
  // server.close() 永等（旧顺序：await server.close() 卡住 → pg.close()
  // 永不执行 → node --watch 超时 SIGKILL → 优雅关闭全跳过 → 连接靠
  // TCP keepalive（默认 2h）才回收——新实例启动拿不到名额直接失败）
  const shutdown = async (signal: string) => {
    console.log(`\n[agent-platform] 收到 ${signal}，正在优雅关闭...`)
    const withTimeout = (p: Promise<unknown>, ms: number) => Promise.race([p.catch(() => {}), new Promise<void>((r) => setTimeout(r, ms))])
    // 1) DB 先关（立刻释放连接名额）——两池各 3s 兑底
    await withTimeout(pg.close(), 3_000)
    try { await withTimeout(eventsPg?.close() ?? Promise.resolve(), 1_000) } catch { /* 尽力 */ }
    // 2) redis（rate-limit/缓存——退出前释放）
    try { await withTimeout(videoWorker?.stop() ?? Promise.resolve(), 1_500) } catch { /* 尽力 */ }
    try { await withTimeout(redisClient?.redis?.quit?.() ?? Promise.resolve(), 1_000) } catch { /* 尽力 */ }
    // 3) HTTP 最后关 + 3s 兑底（最坏总耗时 ~8s——node --watch 宽限内完成）
    await withTimeout(new Promise<void>((resolve) => { server.close().then(() => resolve()) }), 3_000)
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

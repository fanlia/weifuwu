/**
 * 中间件装配 + 依赖初始化（server.ts 拆分 W1——bootstrap 域）
 *
 * 返回 PlatformDeps——route/worker 模块共享（pg/redis/queue/metrics/
 * currentCtx 运行时引用）。拆分是机械提取——行为零变化（平台 475 验证）。
 */
import { postgres, redis, queue, rateLimit, OpenAi, appAuth, userSystem, cors, errorResponse, ops, WEIFUWU_USER_SCHEMA } from 'weifuwu'
import type { Router, Context } from 'weifuwu'
import type { AppCtx } from '../middleware/ctx.ts'
import { AGENT_PLATFORM_SCHEMA, APP_EXT_SCHEMA } from '../db/tables.ts'
import { registerBuiltinTools, BUILTIN_TOOL_DEFS } from '../tools/builtin.ts'

export interface PlatformMetrics {
  requests: number; errors: number; errors5xx: number; errorsCaught: number
  aiCalls: number; aiTokens: number; aiLatencyMs: number
  webhooks: number; sandboxCalls: number; startTime: number
}

export interface PlatformDeps {
  pg: ReturnType<typeof postgres>
  eventsPg: ReturnType<typeof postgres> | null
  redisClient: any
  hasRedis: boolean
  metrics: PlatformMetrics
  /** 当前请求 ctx（内置工具/worker 运行时读取——中间件后置） */
  currentCtx: () => AppCtx | null
  sandboxStatus: Record<string, any>
  videoQueueModule: ReturnType<typeof queue> | null
}

export async function buildAppDeps(app: Router<AppCtx>): Promise<PlatformDeps> {
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
  // W0 api 计划：错误面单源——链捕获（DbError/HttpError/校验 → errorResponse
  // 状态码+code 面；route 内未 catch 的意外 → 500 诚实现形）
  app.onError((e: unknown) => errorResponse(e))

  // ── 数据库 ──────────────────────────────────────────────
  // 主池：10 并发 AI 执行（每任务 2+ SQL 连接）+ 常规请求——acquireTimeoutMs 防池满无限排队（卡住）
  // DATABASE_POOL_MAX 覆盖（2026-08——测试峰值连接（15+ spawn server × 50）
  // 击穿 PG max=100——测试环境用小池（UI 测试低并发——8 足够））
  // 默认 50 → 20（2027-09 实证：池启动即预热全开——双实例/--watch 重启叠加
  // 瞬间 50+50 > PG max=100 → startup too many clients（用户 dev 无法访问
  // 根因）——20 起步双实例 40 安全余量 2.5×；峰值（10 并发 AI × 3 连接）
  // 排队等待（acquireTimeout 10s）不爆连接）
  // idle_timeout/max_lifetime（2027-10——watch 重启连接击穿实证）：postgres.js
  // 默认 idle_timeout=0——峰值开出的连接永不收缩（实测单实例 idle 49）——
  // dev --watch 重启叠加期 49+50 > PG max=100 → 启动失败 too many clients；
  // 空闲 30s 收缩 + 连接最长寿命 30min 换血——碰撞窗口结构性消除
  const poolMax = parseInt(process.env.DATABASE_POOL_MAX ?? '20', 10)
  const pg = postgres({
    max: poolMax,
    acquireTimeoutMs: 10_000,
    // 空闲收缩（2027-10——watch 重启连接击穿实证）：默认 0 峰值连接永不收缩
    // （实测单实例 idle 49）——重启叠加期 49+50 > PG max=100 → 启动失败。
    // 30s 收缩 + dev 单人低并发——碰撞窗口结构性消除（框架 client 已透传 reaper）
    idle_timeout: parseInt(process.env.DATABASE_POOL_IDLE_TIMEOUT ?? '30000', 10),
    // W4：平台测试 memory 模式（POSTGRES_MEMORY=1——零 wire 直执行——ui 共享 server 用）
    ...(process.env.POSTGRES_MEMORY === '1' ? { memory: true } : {}),
    // W1 接线：租户 scope（ctx.orm 自动 withCtx——应用层 ctxTable 面自动预置 app_id
    // ——手写 app_id 过滤逐步收口；现有 table() 面不受影响（scope 仅 ctxTable 生效）
    tenant: { field: 'app_id', value: (c) => (c as { appId?: string })?.appId },
  })
  app.use(pg)
  // 事件日志独立池（2026-08——沙盒事件专用）
  let eventsPg: ReturnType<typeof postgres> | null = null

  // ── 请求日志（结构化 JSON 行 + 请求 id——可观测性基础；pg 之后——ctx.sql 已注入） ──
  app.use(async (req: Request, ctx: Context, next: any) => {
    const id = (req as any).id ?? Math.random().toString(36).slice(2, 8)
    const start = Date.now()
    try {
      const res = await next(req, ctx)
      const status = res instanceof Response ? res.status : 200
      metrics.requests++
      if (status >= 500) { metrics.errors++; metrics.errors5xx++ }
      // 日志面：4xx 不刷（不是 error——业务面）——5xx 刷（error——运营面）
      if (status >= 500) console.error(JSON.stringify({
        ts: new Date().toISOString(), id, method: req.method, path: new URL(req.url).pathname,
        level: 'error', status, ms: Date.now() - start,
      }))
      return res
    } catch (e) {
      metrics.requests++
      metrics.errors++
      metrics.errorsCaught++
      console.error(JSON.stringify({
        ts: new Date().toISOString(), id, method: req.method, path: new URL(req.url).pathname,
        level: 'error', ms: Date.now() - start, error: (e as Error)?.message,
      }))
      throw e
    }
  })

  // ── Schema 迁移（声明式——DDL 算子化：零 SQL 字符串；幂等记录 + 老库逐列增量） ──
  await pg.migrate()
  await pg.migrateModule('agent-platform', AGENT_PLATFORM_SCHEMA)
  console.log('[agent-platform] DB schema 已初始化')

  // ── Redis（框架自研客户端）────────────────────────────
  let redisClient: any = null
  const hasRedis = !!process.env.REDIS_URL
  if (hasRedis) {
    redisClient = redis()
    app.use(redisClient)
  } else {
    console.warn('[agent-platform] Redis 未配置（REDIS_URL 缺失）——队列/房间广播/限流降级（内存面）')
  }

  // ── 后台任务队列（weifuwu queue——视频生成异步轮询依赖）─────────
  let videoQueueModule: ReturnType<typeof queue> | null = null
  let videoWorker: any = null
  if (hasRedis) {
    videoQueueModule = queue({ redis: redisClient.redis })
    app.use(videoQueueModule)
  } else {
    console.warn('[agent-platform] 队列降级：无 Redis——视频生成/延迟任务不可用（webhook 直发）')
  }

  // 注册/邀请/SSO 全部框架路由（register-app / apps/:slug/register / sso/*）
  const ssoOn = !!(process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET)
  const users = userSystem({
    orm: pg.orm,
    secret: process.env.JWT_SECRET ?? 'default-secret',
    accessTtlSeconds: 15 * 60,   // 对齐原 15m
    refreshTtlDays: 7,           // 对齐原 7d
    // 平台红线（ROLES-OPTIMIZATION 波次 1）：邀请角色仅 member/viewer（框架默认放 admin）
    inviteRoles: ['member', 'viewer'],
    sso: ssoOn ? {
      issuer: process.env.OIDC_ISSUER!.replace(/\/$/, ''),
      clientId: process.env.OIDC_CLIENT_ID!,
      clientSecret: process.env.OIDC_CLIENT_SECRET!,
      redirectBase: process.env.OIDC_REDIRECT_URI ? new URL(process.env.OIDC_REDIRECT_URI).origin : undefined,
      defaultAppSlug: process.env.OIDC_APP_SLUG || undefined,
      // 回调页：SPA 存 localStorage 后跳首页（原 auth.ts 回调页逻辑原样下沉）
      renderCallback: (sess) => `<!DOCTYPE html><html><body><script>
        localStorage.setItem('agent_platform_token', ${JSON.stringify(sess.token)});
        localStorage.setItem('agent_platform_refresh', ${JSON.stringify(sess.refreshToken)});
        localStorage.setItem('agent_platform_user', ${JSON.stringify(JSON.stringify(sess.user))});
        location.href = '/';
      </script></body></html>`,
    } : undefined,
    hooks: {
      // 注册建默认应用后：建 user Agent + free 试用（原 auth.ts register 业务面下沉）
      onRegisterApp: async (userId, app) => {
        const [u] = await pg.orm.query.from('_weifuwu_users').select('name').where({ id: { eq: userId } }).run()
        await pg.orm.query.insert('agents').rows([
          { app_id: String(app.id), type: 'user', name: u?.name ?? '成员', user_id: String(userId), is_active: true },
        ]).onConflict(undefined, false).run().catch(() => {})
        try {
          await pg.orm.query.update('_weifuwu_apps').set({
            plan: 'free',
            trial_ends_at: ops.nowInterval(14, 'day'),
            monthly_token_limit: 50000,
          }).where({ id: { eq: app.id } }).run()
        } catch { /* 旧库无列——migrate 负责 */ }
      },
      // 邀请加入：建默认 user Agent（原 auth.ts join 业务面）
      onJoinApp: async (userId, appId) => {
        const [u] = await pg.orm.query.from('_weifuwu_users').select('name').where({ id: { eq: userId } }).run()
        await pg.orm.query.insert('agents').rows([
          { app_id: appId, type: 'user', name: u?.name ?? '成员', user_id: String(userId), is_active: true },
        ]).onConflict(undefined, false).run().catch(() => {})
      },
      // SSO 登录：加入目标应用时建 Agent
      onSsoLogin: async (userId, appId) => {
        if (!appId) return
        const [u] = await pg.orm.query.from('_weifuwu_users').select('name').where({ id: { eq: userId } }).run()
        await pg.orm.query.insert('agents').rows([
          { app_id: appId, type: 'user', name: u?.name ?? '成员', user_id: String(userId), is_active: true },
        ]).onConflict(undefined, false).run().catch(() => {})
      },
    },
  })
  await pg.migrateModule('weifuwu-users', WEIFUWU_USER_SCHEMA)
  // 框架 app 表平台扩展列（商业化/沙盒配额/企业归属——声明式增量模块（零 ALTER 文本）——
  // 须在 weifuwu-users 建表后迁移（memory CREATE TABLE 覆盖列集——先延后（调试发现）））
  await pg.migrateModule('agent-platform-app-ext', APP_EXT_SCHEMA)
  await users.migrate()          // _weifuwu_users / _weifuwu_sessions / _weifuwu_apps / _weifuwu_app_members（播种段）
  // 系统域初始引导（USERSYSTEM-V2 定案）：ADMIN_EMAILS（逗号分隔）→ _builtin 成员任命——
  //   首个 = owner（超级管理员·唯一）· 其余 = admin（系统管理员）——幂等 seed——
  //   此后任命/移除走 _builtin 成员管理（addMember——super admin 自治）
  const sysEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean)
  if (sysEmails.length) {
    await users.seedBuiltinOwners(sysEmails)
    console.log(`[agent-platform] 系统域 seed: ${sysEmails.length} 个管理员（_builtin owner/admin——ADMIN_EMAILS 引导）`)
    // UI 测试登录需要（seedBuiltinOwners 建号无密码——同 SSO 语义；钩子模式设默认密码）
    if (process.env.WF_TEST_HOOKS === '1' && process.env.ADMIN_TEST_PASSWORD) {
      const { hashPassword } = await import('weifuwu')
      const rows = await pg.orm.query.from('_weifuwu_users').select('id').where({ email: { eq: sysEmails[0] } }).run()
      if (rows[0]) {
        const h = await hashPassword(process.env.ADMIN_TEST_PASSWORD!) as unknown as string
        await pg.orm.query.update('_weifuwu_users').set({ password_hash: h } as any).where({ id: { eq: String(rows[0].id) } }).run()
      }
    }
  }
  // 单应用模式（定案）：agent-platform = _default 应用——开放自助注册（注册即加入平台）——
  //   _builtin 恒不开放（管理面）· 个人默认应用流（register-app）保留为通用能力（测试种子用）
  await pg.orm.query.update('_weifuwu_apps').set({ open_registration: true }).where({ slug: { eq: '_default' } }).run()
  console.log('[agent-platform] _default 已开放注册（单应用模式——注册即加入平台）')
  // 机器凭据就绪位（分离时：appAuth.builtin = { baseUrl, appId, appKey }）
  const [defCred] = await pg.orm.query.from('_weifuwu_apps').select('id', 'app_key').where({ slug: { eq: '_default' } }).run()
  if (defCred?.id) console.log('[agent-platform] _default 机器凭据就绪（appId+appKey——分离沟通面）')

  // ── 迁移面（orm-pg-onetime-legacy 判负登记）：一次性历史迁移——DO PL/pgSQL 块 +
  //    多语句 DDL 事务面（旧 tenant→app 模型 / 约束清理 / 索引重建）——无法算子化——
  //    runMigration 执行+记录（迁移面合法——红线针对业务查询）——W3c：memory 无
  //    parser——仅真库跑（memory 无旧库态——历史迁移面零消费者） ──
  if (!process.env.POSTGRES_MEMORY) await pg.runMigration('agent-platform-legacy', `
    ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_user_id_fkey;
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
  // AuthInterface 本地实现（定案）：asAppAuth = 同一 mw 的语义化装配——
  //   运行时完整 AuthApi（控制平面路由需要方法面）+ AuthInjected 公共面
  //   分离切换（一行）：app.use(appAuth({ secret, builtin: { baseUrl, appId, appKey } }))

  // ── 迁移面（orm-pg-onetime-legacy 判负登记）：一次性历史迁移——DO PL/pgSQL 块 +
  //    多语句 DDL 事务面（旧 tenant→app 模型 / 约束清理 / 索引重建）——无法算子化——
  //    runMigration 执行+记录（迁移面合法——红线针对业务查询）——W3c：memory 无
  //    parser——仅真库跑（memory 无旧库态——历史迁移面零消费者） ──
  if (!process.env.POSTGRES_MEMORY) await pg.runMigration('agent-platform-legacy', `
    ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_user_id_fkey;
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
  // AuthInterface 本地实现（定案）：asAppAuth = 同一 mw 的语义化装配——
  //   运行时完整 AuthApi（控制平面路由需要方法面）+ AuthInjected 公共面
  //   分离切换（一行）：app.use(appAuth({ secret, builtin: { baseUrl, appId, appKey } }))
  app.use(users.asAppAuth())
  users.routes(app, { prefix: '/api/auth' })

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
  app.use(OpenAi()) // embedding/image/video 默认读 DASHSCOPE_* env

  // ── 内置工具注册 ──────────────────────────────────────────
  // 提供一个获取当前 ctx 的函数，供内置工具在运行时使用
  let currentCtx: AppCtx | null = null
  app.use((req: Request, ctx: Context, next: any) => {
    currentCtx = ctx as unknown as AppCtx
    return next(req, ctx)
  })
  registerBuiltinTools(() => currentCtx ?? (null as any))
  console.log(`[agent-platform] 已注册 ${BUILTIN_TOOL_DEFS.length} 个内置工具`)

  // ── 视频生成后台 worker（异步轮询队列——Redis 未配置则视频工具不可用）──
  if (videoQueueModule) {
    const bootCtx = { orm: pg.orm } as AppCtx
    const { createVideoPollWorker, requeuePendingVideoTasks } = await import('../tools/video-gen.ts')
    videoWorker = createVideoPollWorker(videoQueueModule.queue, () => currentCtx ?? bootCtx)
    try {
      await videoWorker.start()
      const n = await requeuePendingVideoTasks(pg.orm, videoQueueModule.queue)
      if (n > 0) console.log(`[agent-platform] 视频任务重新入队：${n} 个（启动恢复）`)
    } catch (e) {
      console.error('[agent-platform] 视频 worker 启动失败（不阻断）:', (e as Error)?.message ?? e)
    }
  }

  // ── 沙盒初始化（S2：探测 + 孤儿清理 + Heartbeat 回收） ──
  const { sandbox } = await import('../sandbox/docker.ts')
  const sandboxStatus = await sandbox.status()
  if (sandboxStatus.enabled && sandboxStatus.available) {
    const { manager } = await import('../sandbox/manager.ts')
    eventsPg = postgres({ max: 3, acquireTimeoutMs: 5_000 })
    manager.init(pg.orm, eventsPg.orm)
    manager.startReaper()
    void manager.reconcile().then((s) => {
      console.log(`[agent-platform] 沙盒 reconcile 首轮完成：started=${s.started} stopped=${s.stopped} terminated=${s.terminated} 孤儿清理=${s.orphans}`)
    })
    console.log(`[agent-platform] 沙盒就绪：${sandboxStatus.mode} · 镜像 ${process.env.SANDBOX_IMAGE ?? 'ap-sandbox:latest'}（生命周期 DB 驱动——reconcile 60s）`)
  } else {
    console.warn(`[agent-platform] 沙盒不可用（enabled=${sandboxStatus.enabled} dockerOk=镜像缺失或 docker 不可用）——agent 文件/命令工具将返回「沙盒不可用」禁用`)
  }

  return { pg, eventsPg, redisClient, hasRedis, metrics, currentCtx: () => currentCtx, sandboxStatus, videoQueueModule }
}

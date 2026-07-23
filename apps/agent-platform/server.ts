/**
 * agent-platform server — 多租户 AI Agent 平台
 *
 * 启动方式:
 *   node --env-file=.env apps/agent-platform/server.ts
 */

import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from 'weifuwu'
import { serve, Router, cors, postgres, ui } from 'weifuwu'
import { readFileSync } from 'node:fs'

// ── 中间件 ────────────────────────────────────────────────
import { ai } from './src/middleware/ai.ts'
import { auth } from './src/middleware/auth.ts'
import { tenant } from './src/middleware/tenant.ts'

// ── 路由 ──────────────────────────────────────────────────
import { registerAuthRoutes } from './src/routes/auth.ts'
import { registerCompanyRoutes } from './src/routes/companies.ts'
import { registerAgentRoutes } from './src/routes/agents.ts'
import { registerDepartmentRoutes } from './src/routes/departments.ts'
import { registerMessageRoutes } from './src/routes/messages.ts'
import { registerKnowledgeRoutes } from './src/routes/knowledge.ts'

// ── 服务 ──────────────────────────────────────────────────
import { handleNewMessage } from './src/services/chat.ts'
import { handleWebhookMessage } from './src/services/webhook.ts'
import { wsHub, createWsHandler } from './src/services/ws-hub.ts'

// ── 内置工具 ───────────────────────────────────────────────
import { registerBuiltinTools, BUILTIN_TOOL_DEFS } from './src/tools/builtin.ts'
import { hashPassword, verifyPassword } from './src/services/password.ts'

// ── UI ────────────────────────────────────────────────────
import { registerUiRoutes } from './src/ui/routes.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main() {
  const app = new Router()

  // ── 全局中间件 ──────────────────────────────────────────
  app.use(cors())

  // ── 数据库 ──────────────────────────────────────────────
  const pg = postgres()
  app.use(pg)

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

  // ── Redis ───────────────────────────────────────────────
  const hasRedis = !!(process.env.REDIS_URL)
  let redisClient: any = null
  if (hasRedis) {
    const { Redis } = await import('ioredis')
    redisClient = new Redis(process.env.REDIS_URL!)
    redisClient.on('error', (err: any) => console.error('[redis]', err.message))
    console.log('[agent-platform] Redis 已连接')
  }

  // ── AI 中间件 ───────────────────────────────────────────
  app.use(ai())

  // ── 内置工具注册 ──────────────────────────────────────────
  // 提供一个获取当前 ctx 的函数，供内置工具在运行时使用
  let currentCtx: Context = null as any
  app.use((req: Request, ctx: Context, next: any) => {
    currentCtx = ctx
    return next(req, ctx)
  })
  registerBuiltinTools(() => currentCtx)
  console.log(`[agent-platform] 已注册 ${BUILTIN_TOOL_DEFS.length} 个内置工具`)

  // ── 认证路由（无需登录） ─────────────────────────────────
  registerAuthRoutes(app)

  // ── Token 刷新（无需登录，用 refreshToken 换新 access_token） ──
  app.post('/api/auth/refresh', async (req: Request, ctx: Context): Promise<Response> => {
    const body = await req.json() as { refreshToken?: string }
    if (!body.refreshToken) {
      return Response.json({ error: 'refreshToken 为必填' }, { status: 400 })
    }

    const { decodeToken, signToken } = await import('./src/middleware/auth.ts')
    const payload = decodeToken(body.refreshToken)
    if (!payload || payload.type !== 'refresh') {
      return Response.json({ error: 'refreshToken 无效或已过期' }, { status: 401 })
    }

    const { sql } = ctx
    const [user] = await sql`
      SELECT id, email, name, role, tenant_id FROM users WHERE id = ${payload.sub}
    `
    if (!user) {
      return Response.json({ error: '用户不存在' }, { status: 404 })
    }

    const secret = process.env.JWT_SECRET ?? 'default-secret'
    const tokenPayload = { sub: user.id, tenantId: user.tenant_id, email: user.email, name: user.name, role: user.role }
    const accessToken = signToken(tokenPayload, secret, '15m')
    const refreshToken = signToken({ ...tokenPayload, type: 'refresh' }, secret, '7d')

    return Response.json({ token: accessToken, refreshToken })
  })

  // ── 需要登录 + 租户隔离的路由 ─────────────────────────
  const protectedRoutes = new Router()
  protectedRoutes.use(auth())
  protectedRoutes.use(tenant())

  // 公司
  registerCompanyRoutes(protectedRoutes)
  // Agent
  registerAgentRoutes(protectedRoutes)
  // 部门
  registerDepartmentRoutes(protectedRoutes)
  // 消息
  registerMessageRoutes(protectedRoutes)
  // 知识库
  registerKnowledgeRoutes(protectedRoutes)
  // 获取当前用户（需要 auth 中间件）
  protectedRoutes.get('/api/auth/me', async (req: Request, ctx: Context): Promise<Response> => {
    const { sql, auth } = ctx
    const [user] = await sql`
      SELECT id, email, name, role, created_at
      FROM users WHERE id = ${auth!.userId}
    `
    if (!user) return Response.json({ error: '用户不存在' }, { status: 404 })
    return Response.json({ user })
  })

  // ── 用户设置 ─────────────────────────────────────────────
  // 更新个人资料
  protectedRoutes.put('/api/auth/profile', async (req: Request, ctx: Context): Promise<Response> => {
    const { sql, auth } = ctx
    const body = await req.json() as { name?: string }
    if (!body.name?.trim()) {
      return Response.json({ error: 'name 不能为空' }, { status: 400 })
    }
    const [user] = await sql`
      UPDATE users SET name = ${body.name.trim()}, updated_at = NOW()
      WHERE id = ${auth!.userId}
      RETURNING id, email, name, role, created_at
    `
    return Response.json({ user })
  })

  // 修改密码
  protectedRoutes.put('/api/auth/password', async (req: Request, ctx: Context): Promise<Response> => {
    const { sql, auth } = ctx
    const body = await req.json() as { currentPassword: string; newPassword: string }
    if (!body.currentPassword || !body.newPassword) {
      return Response.json({ error: 'currentPassword 和 newPassword 为必填' }, { status: 400 })
    }
    if (body.newPassword.length < 6) {
      return Response.json({ error: '新密码至少 6 位' }, { status: 400 })
    }

    const [user] = await sql`
      SELECT password_hash FROM users WHERE id = ${auth!.userId}
    `
    if (!user) return Response.json({ error: '用户不存在' }, { status: 404 })

    const valid = await verifyPassword(body.currentPassword, user.password_hash)
    if (!valid) {
      return Response.json({ error: '当前密码错误' }, { status: 403 })
    }

    const newHash = await hashPassword(body.newPassword)
    await sql`
      UPDATE users SET password_hash = ${newHash}, updated_at = NOW()
      WHERE id = ${auth!.userId}
    `
    return Response.json({ success: true })
  })

  // 挂载受保护路由
  app.mount('/', protectedRoutes)

  // ── WebSocket ───────────────────────────────────────────
  // 如果 Redis 可用，初始化 WS 跨实例广播
  if (hasRedis && redisClient) {
    wsHub.initRedis(redisClient)
    console.log('[agent-platform] WS Hub Redis Pub/Sub 已启用')
  }
  app.ws('/ws', createWsHandler())

  // ── Webhook 入口 ───────────────────────────────────────

  app.post('/api/webhook/:agentId', async (req: Request, ctx: Context): Promise<Response> => {
    try {
      const body = await req.json()
      const result = await handleWebhookMessage(ctx, ctx.params.agentId, body)
      return Response.json(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return Response.json({ error: message }, { status: 400 })
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
    await new Promise<void>((resolve) => server.close(() => resolve()))
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

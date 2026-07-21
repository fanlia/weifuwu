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
import { createWsHandler } from './src/services/ws-hub.ts'

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

  // 运行迁移
  const schemaPath = resolve(__dirname, 'src', 'db', 'schema.sql')
  const schema = readFileSync(schemaPath, 'utf-8')
  await pg.migrate()
  if (!(await pg.isMigrated('agent-platform'))) {
    // 开发环境：先清理旧表再重新创建
    const existingTables = await pg.sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('agents','departments','messages','kb_chunks','kb_documents','department_members','companies','users','tenants')
    `
    if (existingTables.length > 0) {
      await pg.sql.unsafe(`
        DROP TABLE IF EXISTS kb_chunks CASCADE;
        DROP TABLE IF EXISTS kb_documents CASCADE;
        DROP TABLE IF EXISTS messages CASCADE;
        DROP TABLE IF EXISTS department_members CASCADE;
        DROP TABLE IF EXISTS departments CASCADE;
        DROP TABLE IF EXISTS agents CASCADE;
        DROP TABLE IF EXISTS companies CASCADE;
        DROP TABLE IF EXISTS users CASCADE;
        DROP TABLE IF EXISTS tenants CASCADE;
        DROP TYPE IF EXISTS agent_type CASCADE;
      `)
    }
    await pg.sql.unsafe(schema)
    await pg.markMigrated('agent-platform')
    console.log('[agent-platform] DB 迁移完成')
  } else {
    // 迁移已标记，但检查核心表是否存在（测试可能 DROP 了）
    const [check] = await pg.sql`
      SELECT COUNT(*)::int as count FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'agents'
    ` as any[]
    if (check.count === 0) {
      console.log('[agent-platform] 检测到表已丢失，重新创建...')
      await pg.sql.unsafe(schema)
    }
  }

  // ── AI 中间件 ───────────────────────────────────────────
  app.use(ai())

  // ── WebSocket Hub ───────────────────────────────────────
  const wsHub = {
    send(key: string, message: string) {
      // 使用 router 的内存 hub 发送
      // 实际应使用 Redis Pub/Sub
      console.log(`[ws] ${key}: ${message.slice(0, 100)}...`)
    },
  }

  // ── 认证路由（无需登录） ─────────────────────────────────
  registerAuthRoutes(app)

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

  // 挂载受保护路由
  app.mount('/', protectedRoutes)

  // ── WebSocket ───────────────────────────────────────────

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

  serve(app, { port: 3000 })
  console.log('[agent-platform] http://localhost:3000')
}

main().catch((err) => {
  console.error('[agent-platform] 启动失败:', err)
  process.exit(1)
})

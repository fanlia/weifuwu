/**
 * agent-builder 后端——Agent 世界模拟平台（Phase 1：世界数据模型 + CRUD API）
 * 独立运行：node server.ts → http://localhost:3400
 */
import { serve, Router, ui, postgres } from 'weifuwu'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerWorldRoutes, WORLD_SCHEMA } from './src/routes/worlds.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── 数据库（DATABASE_URL——postgres 中间件注入 ctx.sql） ──
const pg = postgres()

// schema 迁移（CREATE IF NOT EXISTS——绝不 DROP——重启幂等）
await pg.migrate()
if (!(await pg.isMigrated('agent-builder'))) {
  await pg.sql.unsafe(WORLD_SCHEMA)
  await pg.markMigrated('agent-builder')
}

const app = new Router()
app.use(pg)
app.use(ui())

// 世界 API（Phase 1：worlds/agents/relations/events CRUD）
registerWorldRoutes(app)

// ── UI（纯框架消费——UIRouter + components） ──
app.get('/app.js', (req, ctx) => ctx.ui.js(resolve(__dirname, 'ui/main.tsx')))
app.get('/components.css', (req, ctx) => ctx.ui.css('weifuwu/components/style.css'))

app.get('/*', async (req, ctx) => ctx.ui.html`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="/components.css">
  <title>agent-builder</title>
</head>
<body>
  <div id="root"></div>
  <script src="/app.js"></script>
</body>
</html>
`)

serve(app, { port: 3400 })
console.log('agent-builder → http://localhost:3400')

/**
 * admin 独立 server——MemorySql 订单表（生产换 postgres()）
 *   cd examples/apps/admin && node server.ts → http://localhost:3302
 */
import { serve, Router, ui, createMemorySql } from 'weifuwu'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerAdminApi, ensureAdminTables } from './api.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sql = createMemorySql()
await ensureAdminTables(sql)

const app = new Router()
app.use(ui())
app.get('/app.js', (req, ctx) => ctx.ui.js(resolve(__dirname, 'main.tsx')))
registerAdminApi(app, sql)

app.get('/*', async (req, ctx) => ctx.ui.html`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="/components.css">
  <title>admin 应用模板</title>
</head>
<body>
  <div id="root"></div>
  <script src="/app.js"></script>
</body>
</html>
`)
app.get('/components.css', (req, ctx) => ctx.ui.css('weifuwu/components/style.css'))

serve(app, { port: 3302 })
console.log('admin 模板 → http://localhost:3302')

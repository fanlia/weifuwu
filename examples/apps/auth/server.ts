/**
 * auth 独立 server——内存用户 + 会话（契约层：生产换 postgres() + userSystem）
 *   cd examples/apps/auth && node server.ts → http://localhost:3301
 */
import { serve, Router, ui, createMemorySql } from 'weifuwu'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerAuthApi, ensureAuthTables } from './api.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sql = createMemorySql()
await ensureAuthTables(sql)

const app = new Router()
app.use(ui())
app.get('/app.js', (req, ctx) => ctx.ui.js(resolve(__dirname, 'main.tsx')))
registerAuthApi(app, sql)

app.get('/*', async (req, ctx) => ctx.ui.html`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="/components.css">
  <title>auth 应用模板</title>
</head>
<body>
  <div id="root"></div>
  <script src="/app.js"></script>
</body>
</html>
`)
app.get('/components.css', (req, ctx) => ctx.ui.css('weifuwu/components/style.css'))

serve(app, { port: 3301 })
console.log('auth 模板 → http://localhost:3301')

/**
 * todo 后端——MemorySql CRUD（契约层：演示用内存实现——生产换 postgres() 一行）
 * 独立运行：node server.ts → http://localhost:3300
 */
import { serve, Router, ui, createMemorySql } from 'weifuwu'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerTodoApi } from './api.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sql = createMemorySql()

await sql.unsafe('CREATE TABLE IF NOT EXISTS todos (id serial PRIMARY KEY, name text, done boolean DEFAULT false)')

const app = new Router()
app.use(ui())
app.get('/app.js', (req, ctx) => ctx.ui.js(resolve(__dirname, 'main.tsx')))

registerTodoApi(app, sql)

app.get('/*', async (req, ctx) => ctx.ui.html`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="/components.css">
  <title>todo 应用模板</title>
</head>
<body>
  <div id="root"></div>
  <script src="/app.js"></script>
</body>
</html>
`)
app.get('/components.css', (req, ctx) => ctx.ui.css('weifuwu/components/style.css'))

serve(app, { port: 3300 })
console.log('todo 模板 → http://localhost:3300')

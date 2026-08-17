/**
 * multi 独立 server——纯前端编排（无后端 API）
 *   cd examples/apps/multi && node server.ts → http://localhost:3303
 */
import { serve, Router, ui } from 'weifuwu'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = new Router()
app.use(ui())
app.get('/app.js', (req, ctx) => ctx.ui.js(resolve(__dirname, 'main.tsx')))

app.get('/*', async (req, ctx) => ctx.ui.html`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="/components.css">
  <title>multi 应用模板</title>
</head>
<body>
  <div id="root"></div>
  <script src="/app.js"></script>
</body>
</html>
`)
app.get('/components.css', (req, ctx) => ctx.ui.css('weifuwu/components/style.css'))

serve(app, { port: 3303 })
console.log('multi 模板 → http://localhost:3303')

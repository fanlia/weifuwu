/**
 * agent-builder 后端——最小应用（纯框架消费：serve + Router + ui）
 * 独立运行：node server.ts → http://localhost:3400
 */
import { serve, Router, ui } from 'weifuwu'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = new Router()
app.use(ui())
app.get('/app.js', (req, ctx) => ctx.ui.js(resolve(__dirname, 'main.tsx')))
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

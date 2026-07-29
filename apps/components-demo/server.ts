import { serve, Router, ui } from 'weifuwu'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// 基于 server.ts 自身位置解析路径，不依赖 CWD
const __dirname = dirname(fileURLToPath(import.meta.url))

const app = new Router()
app.use(ui())

app.get('/app.js', (req, ctx) => ctx.ui.js(resolve(__dirname, 'src', 'main.tsx')))
app.get('/style.css', (req, ctx) => ctx.ui.css(resolve(__dirname, 'public', 'style.css')))

// 组件库 CSS（含 Token + 35 布局原语 + 41 组件样式）
app.get('/components.css', (req, ctx) => ctx.ui.css('weifuwu/components/style.css'))

app.get('/*', async (req, ctx) => ctx.ui.html`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="/style.css">
  <link rel="stylesheet" href="/components.css">
  <title>weifuwu/components cheatsheet</title>
</head>
<body>
  <div id="root"></div>
  <script src="/app.js"></script>
</body>
</html>
`)

serve(app, { port: 3000 })
console.log('http://localhost:3000')

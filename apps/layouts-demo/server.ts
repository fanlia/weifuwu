import { serve, Router, ui } from 'weifuwu'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// 基于 server.ts 自身位置解析路径，不依赖 CWD
const __dirname = dirname(fileURLToPath(import.meta.url))

const app = new Router()
app.use(ui())

app.get('/app.js', (req, ctx) => ctx.ui.js(resolve(__dirname, 'src', 'main.tsx')))

// ── 唯一样式来源：weifuwu/components（Token + 布局原语 + 组件样式）──
// components.css 构建时已内嵌全部 layout 原语——不单独加载 layout.css（避免双份 CSS）
app.get('/components.css', (req, ctx) => ctx.ui.css('weifuwu/components/style.css'))

app.get('/*', async (req, ctx) => ctx.ui.html`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!-- 唯一样式来源：components.css（内嵌 layout 原语 + 组件样式） -->
  <link rel="stylesheet" href="/components.css">
  <title>weifuwu/layout — 布局模式蓝本</title>
</head>
<body>
  <div id="root"></div>
  <script src="/app.js"></script>
</body>
</html>
`)

serve(app, { port: 3001 })
console.log('http://localhost:3001')

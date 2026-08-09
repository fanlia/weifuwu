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

// 模式源码（查看代码 Drawer 用——text/plain 避免浏览器转义）
// id 是 kebab-case（app-shell）→ 文件名 PascalCase（AppShell.tsx）
app.get('/src/patterns/:name', async (req: Request, ctx: any): Promise<Response> => {
  const name = (ctx as any).params?.name
  const pascal = name.split('-').map((w: string) => w[0].toUpperCase() + w.slice(1)).join('')
  const file = resolve(__dirname, 'src', 'patterns', `${pascal}.tsx`)
  const src = await import('node:fs/promises').then(fs => fs.readFile(file, 'utf-8'))
  return new Response(src, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
})

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

import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve, Router, ui } from 'weifuwu'

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = new Router()
app.use(ui())

app.get('/app.js', async (req, ctx) => ctx.ui.js(resolve(__dirname, 'src', 'main.tsx')))
app.get('/style.css', async (req, ctx) => ctx.ui.css(resolve(__dirname, 'public', 'style.css')))

// 组件库 CSS
app.get('/components.css', async (req, ctx) => {
  const { readFile } = await import('node:fs/promises')
  const css = await readFile(resolve(__dirname, '../../dist/components/style.css'), 'utf-8')
  return new Response(css, { headers: { 'Content-Type': 'text/css' } })
})

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

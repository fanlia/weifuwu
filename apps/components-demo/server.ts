import { serve, Router, ui } from 'weifuwu'

const app = new Router()
app.use(ui())

app.get('/app.js', (req, ctx) => ctx.ui.js('./src/main.tsx'))
app.get('/style.css', (req, ctx) => ctx.ui.css('./public/style.css'))

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

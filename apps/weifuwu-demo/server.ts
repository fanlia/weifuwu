import { serve, Router, ui } from 'weifuwu'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = new Router()
app.use(ui())

app.get('/app.js', (req, ctx) => ctx.ui.js(__dirname + '/main.tsx'))
// 唯一样式来源：weifuwu/components/style.css（Token + 布局原语 + 组件样式，一次引入）
app.get('/style.css', (req, ctx) => ctx.ui.css('weifuwu/components/style.css'))

app.get('/', async (req, ctx) => ctx.ui.html`
  <!DOCTYPE html>
  <html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>weifuwu Demo</title>
    <link rel="stylesheet" href="/style.css">
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/app.js"></script>
  </body>
  </html>
`)

serve(app, { port: 3000 })
console.log('http://localhost:3000')

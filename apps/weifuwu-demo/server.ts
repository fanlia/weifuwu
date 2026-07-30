import { serve, Router, ui } from 'weifuwu'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = new Router()
app.use(ui())

app.get('/style.css', (req, ctx) => ctx.ui.css(__dirname + '/style.css'))
app.get('/app.js', (req, ctx) => ctx.ui.js(__dirname + '/main.tsx'))

app.get('/', async (req, ctx) => ctx.ui.html`
  <!DOCTYPE html>
  <html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>weifuwu Demo</title>
    <link rel="stylesheet" href="https://unpkg.com/weifuwu@0.51.0/dist/layout/weifuwu-layout.css">
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

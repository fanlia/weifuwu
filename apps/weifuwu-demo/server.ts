import { serve, Router, ui } from 'weifuwu'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = new Router()
app.use(ui())

app.get('/style.css', async (req, ctx) => ctx.ui.css(resolve(__dirname, 'style.css')))
app.get('/app.js', async (req, ctx) => ctx.ui.js(resolve(__dirname, 'main.tsx')))

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

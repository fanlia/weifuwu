import { Router, serve, ui } from '../../src/index.ts'

const router = new Router()
router.use(ui())

router.get('/style.css', async (req, ctx) => ctx.ui.css('./apps/weifuwu-demo/style.css'))
router.get('/app.js', async (req, ctx) => ctx.ui.js('./apps/weifuwu-demo/main.tsx'))

router.get('/', async (req, ctx) => ctx.ui.html`
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

serve(router, { port: 3000 })

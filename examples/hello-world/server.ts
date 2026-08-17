/**
 * hello-world——最小可运行起步项目（新手第一步，复制本目录即跑）
 *
 * 与 README「快速开始」模式 A 对应——三文件落地版：
 *   server.ts   后端：SPA 外壳 + /api/hello 数据端点
 *   routes.tsx  路由声明：两阶段异步组件（await ctx.data → 返回视图）
 *   client.ts   客户端入口：createRouter 接管渲染
 *
 * 跑起来：node server.ts → http://localhost:3400
 */
import { serve, Router, ui, cors } from 'weifuwu'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const router = new Router()
router.use(cors())
router.use(ui()) // 注入 ctx.ui.html / ctx.ui.js / ctx.ui.css

// SPA 外壳（空 root + 前端 bundle）
router.get('/', (req, ctx) => ctx.ui.html`
  <!doctype html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="/components.css">
    <title>weifuwu hello-world</title>
  </head>
  <body>
    <div id="root"></div>
    <script src="/static/app.js"></script>
  </body>
  </html>
`)
router.get('/static/app.js', (req, ctx) => ctx.ui.js(resolve(__dirname, 'client.ts')))

// 样式自托管（node_modules/weifuwu/components/style.css——包内 CSS，零外部依赖/CDN）
router.get('/components.css', (req, ctx) => ctx.ui.css('weifuwu/components/style.css'))

// 数据端点（ctx.data 消费——SPA 下真 fetch，SSR 下服务端直取）
router.get('/api/hello', () => Response.json({ msg: '你好，weifuwu！' }))

serve(router, { port: 3400 })
console.log('hello-world → http://localhost:3400')

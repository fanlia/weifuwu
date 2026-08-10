/**
 * ui-router-demo — ui-dom（独立 UIRouter + VDOM）浏览器冒烟
 *
 * 用 weifuwu 提供的 serve（后端框架）+ ui() 中间件（esbuild 动态编译前端 / 组件 CSS）：
 *   - GET /app.js          → ctx.ui.js 编译 main.tsx（前端 bundle）
 *   - GET /components.css  → ctx.ui.css（组件样式）
 *   - GET /*               → ssrPage（共享 UIRouter → 完整 HTML + __DATA__ + styles）
 *
 * 启动: node apps/ui-router-demo/server.ts
 * 验证: http://localhost:3100
 */

import { serve, Router, ui } from 'weifuwu'
import { ssrPage } from 'weifuwu/ui-dom'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app } from './src/router.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.PORT ?? 3100)

const server = new Router()
server.use(ui())

// 前端 bundle（esbuild 动态编译 .tsx——weifuwu dev 能力）
server.get('/app.js', (req, ctx) => ctx.ui.js(resolve(__dirname, 'src', 'main.tsx')))

// 组件样式（含 Token + 布局原语 + 组件样式）
server.get('/components.css', (req, ctx) => ctx.ui.css('weifuwu/components/style.css'))

// SSR：共享 UIRouter → 完整 HTML（含 __DATA__ hydration 种子 + stylesheet）
server.get('/*', async (req) => {
  const url = new URL(req.url)
  if (url.pathname === '/favicon.ico') return new Response(null, { status: 204 })
  try {
    const { page } = await ssrPage(app, { url: url.pathname, styles: ['/components.css'] })
    return new Response(page, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  } catch (err) {
    console.error('[ui-router-demo] ssr error:', err)
    return new Response(String(err), { status: 500 })
  }
})

serve(server, { port })
console.log(`ui-dom demo: http://localhost:${port}`)

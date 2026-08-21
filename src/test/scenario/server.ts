/**
 * 场景测试服务器——weifuwu 自举（SSR 服务化场景页面）
 *
 * 架构（测试框架自举——weifuwu 能力示范）：
 * - Router + ui 中间件（weifuwu server）——ctx.ui.js（esbuild 编译）客户端 bundle
 * - 场景页面 = 空 root + <script src="/app.js">——客户端 uiServe 收养渲染
 *   （DOM 行为测试聚焦——组件工厂客户端执行——交互状态真实流转）
 *
 * 启动：node src/test/scenario/server.ts（端口 3299）
 */
import { Router, serve } from '../../server/index.ts'
import { ui } from '../../server/ui/index.ts'
import { UIRouter, h } from '../../client/vdom/index.ts'
import { uiSsr } from '../../client/vdom/core/ssr/index.ts'
import { scenarios, findScenario } from './registry.ts'

const PORT = Number(process.env.SCENARIO_PORT ?? 0) // 0 = 随机端口（测试自包含——避免端口残留）

const app = new Router()
app.use(ui())

// 场景页面：SSR 场景 → uiSsr 渲染（首帧吸收测试）；其余 → 空 root 客户端渲染
app.get('/scenario/:id', async (req, ctx: any) => {
  const id = (req.params as Record<string, string>).id ?? ''
  const s = findScenario(id)
  if (s?.ssr) {
    // SSR 场景：服务端 uiSsr 渲染（同一 UIRouter + 同一场景组件）→ 静态 HTML 首屏
    const router = new UIRouter()
    router.get(`/scenario/${id}`, (_req, rctx: any) => rctx.stream(h(s.render, {})))
    const html = await uiSsr(router, `/scenario/${id}`, { title: 'scenario-ssr' })
    return new Response(html.replace('</body>', '<script src="/app.js"></script></body>'), {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }
  return ctx.ui.html`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>scenario</title></head>
<body>
  <div id="root"></div>
  <script src="/app.js"></script>
</body>
</html>`
})

// 场景索引（dev 便利）
app.get('/', () => new Response('scenario server: /scenario/:id', { headers: { 'content-type': 'text/plain' } }))

// 客户端 bundle（ctx.ui.js——esbuild 编译 scenario main）
app.get('/app.js', (req, ctx) => ctx.ui.js('./src/test/scenario/main.tsx'))

const server = serve(app, { port: PORT })
server.ready.then(() => console.log(`[scenario] server on :${server.port}`))

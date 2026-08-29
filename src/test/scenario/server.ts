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
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { ui } from '../../server/ui/index.ts'
import { UIRouter, h } from '../../client/vdom/index.ts'
import { uiSsrV2 } from '../../client/vdom/core/v2/ssr.ts' // 场景层 SSR = v2（默认入口已切——显式引 v2 与 uiServe 同源）
import { scenarios, findScenario } from './registry.ts'

const PORT = Number(process.env.SCENARIO_PORT ?? 0) // 0 = 随机端口（测试自包含——避免端口残留）

const app = new Router()
app.use(ui())

// 场景页面：SSR 场景 → uiSsr 渲染（首帧吸收测试）；其余 → 空 root 客户端渲染
app.get('/scenario/:id', async (req, ctx: any) => {
  const id = (ctx.params as Record<string, string>).id ?? ''
  const s = findScenario(id)
  if (s?.ssr) {
    // SSR 场景：服务端 uiSsr 渲染（同一 UIRouter + 同一场景组件）→ 静态 HTML 首屏
    const router = new UIRouter()
    router.get(`/scenario/${id}`, (_req, rctx: any) => rctx.stream(h(s.render, {})))
    const html = await uiSsrV2(router, `/scenario/${id}`, { title: 'scenario-ssr' })
    return new Response(html.replace('</body>', '<link rel="stylesheet" href="/components.css"><script src="/app.js"></script></body>'), {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }
  return ctx.ui.html`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>scenario</title></head>
<body>
  <link rel="stylesheet" href="/components.css">
  <div id="root"></div>
  <script src="/app.js"></script>
</body>
</html>`
})


// 组件 CSS 聚合（layout + 全部组件——真实布局测试环境）
app.get('/components.css', async (req, ctx: any) => {
  const root = resolve(process.cwd())
  const layoutSrc = resolve(root, 'src', 'client', 'layout')
  const entry = await readFile(resolve(layoutSrc, 'weifuwu-layout.css'), 'utf-8')
  const layoutChunks: string[] = []
  for (const line of entry.split('\n')) {
    const m = line.match(/@import\s+['"]([^'"]+)['"]/)
    if (m) {
      const content = (await readFile(resolve(layoutSrc, m[1]), 'utf-8')).replace(/@import\s+['"][^'"]+['"]\s*;?\s*\n?/g, '').trim()
      layoutChunks.push(`@layer layout {\n${content}\n}`)
    }
  }
  let css = '@layer tokens, base, layout, utilities, components;\n\n' + layoutChunks.join('\n\n')
  css += '\n@layer components {\n'
  const dirs = await readdir(resolve(root, 'src', 'client', 'components'), { withFileTypes: true })
  for (const d of dirs.filter((x) => x.isDirectory())) {
    try {
      css += await readFile(resolve(root, 'src', 'client', 'components', d.name, `${d.name}.css`), 'utf-8') + '\n'
    } catch { /* 无 CSS 组件跳过 */ }
  }
  css += '}\n'
  return new Response(css, { headers: { 'content-type': 'text/css; charset=utf-8' } })
})

// 场景索引（dev 便利）
app.get('/', () => new Response('scenario server: /scenario/:id', { headers: { 'content-type': 'text/plain' } }))

// B-复现（2026-08）：异步加载场景 fixture（真实 ctx.api.get 路径）
app.get('/api/async-load', () => new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } }))

// WebSocket 端点（ws 中间件场景 fixture——欢迎消息 + echo）
app.ws('/ws', {
  open: (ws: import('../../server/types.ts').WebSocket) => {
    ws.send('欢迎连接')
  },
  message: (ws: import('../../server/types.ts').WebSocket, _ctx: unknown, data: string | Buffer) => {
    ws.send(`echo:${String(data)}`)
  },
})

// 本地视频 fixture（真实播放测试——flower.mp4 CC0）
app.get('/media/flower.mp4', async () => {
  const buf = await readFile(resolve(process.cwd(), 'src', 'test', 'scenario', 'fixtures', 'flower.mp4'))
  return new Response(buf, { headers: { 'content-type': 'video/mp4' } })
})

// AI 流式端点（NDJSON——分块吐 content——useChat 场景 fixture）
app.post('/api/chat', () =>
  new Response(new ReadableStream({
    start(c) {
      const enc = new TextEncoder()
      const chunks = ['你', '好', '！']
      let i = 0
      const t = setInterval(() => {
        if (i < chunks.length) {
          c.enqueue(enc.encode(JSON.stringify({ content: chunks[i++] }) + '\n'))
        } else {
          c.enqueue(enc.encode('{"done":true}\n'))
          clearInterval(t)
          c.close()
        }
      }, 30)
    },
  }), { headers: { 'content-type': 'application/x-ndjson' } }),
)

// 客户端 bundle（ctx.ui.js——esbuild 编译 scenario main）
app.get('/app.js', (req, ctx) => ctx.ui.js('./src/test/scenario/main.tsx'))

const server = serve(app, { port: PORT })
server.ready.then(() => console.log(`[scenario] server on :${server.port}`))

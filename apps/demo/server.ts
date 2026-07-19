/**
 * demo server — weifuwu 后端 serve 前端 SPA
 */

import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { WebSocketHandler, WebSocket, Context } from 'weifuwu'
import { serve, Router, serveStatic, cors, ui } from 'weifuwu'

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = new Router()
app.use(cors())
app.use(ui())

// 客户端 JS bundle — 动态编译
app.get('/static/app.js', async (req, ctx) => ctx.ui.js(resolve(__dirname, 'src', 'main.tsx')))

// 客户端 CSS
app.get('/static/style.css', async (req, ctx) => ctx.ui.css(resolve(__dirname, 'public', 'style.css')))

// WebSocket 演示
const wsHandler: WebSocketHandler = {
  open(ws: WebSocket) {
    ws.send(JSON.stringify({ type: 'system', body: '🟢 已连接 WebSocket' }))
  },
  message(ws: WebSocket, _ctx: Context, data: string | Buffer) {
    const msg = JSON.parse(data.toString())
    ws.send(JSON.stringify({ type: 'echo', body: msg.body, ts: Date.now() }))
  },
}
app.ws('/ws', wsHandler)

// SSR 博客页面
const blogPost = {
  slug: 'hello-ssr',
  title: 'SSR 与 weifuwu',
  body: '<p>这是服务端渲染的段落。</p><blockquote>搜索引擎可以看到这段内容。</blockquote><p>而 <strong>点赞按钮</strong> 由客户端 hydrate 接管。</p>',
  author_name: 'weifuwu 团队',
  published_at: new Date('2025-07-16'),
}

app.get('/blog/:slug', async (req: Request, ctx: Context): Promise<Response> => ctx.ui.html`
  <!DOCTYPE html>
  <html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="/static/style.css">
    <title>${blogPost.title}</title>
  </head>
  <body class="bg-gray-100 text-gray-800">
    <div id="root" class="max-w-[600px] mx-auto px-4">
      <article class="bg-white rounded-xl p-8 shadow-md">
        <h1 class="text-2xl font-bold mb-2">${blogPost.title}</h1>
        <div class="text-gray-400 text-sm mb-5">
          ${blogPost.author_name} · ${blogPost.published_at.toLocaleDateString()}
        </div>
        <div class="leading-relaxed">${ctx.ui.html.unsafe(blogPost.body)}</div>
        <div data-hydrate="like" class="mt-6 pt-5 border-t border-gray-100">
          <p class="text-gray-500 text-sm mb-2">这个对你有帮助吗？</p>
        </div>
      </article>
    </div>
    <script>window.__WFUI_PROPS__=${ctx.ui.html.unsafe(JSON.stringify({ post: blogPost }))}</script>
    <script src="/static/app.js"></script>
  </body>
  </html>
`)

// SPA 入口页面
for (const p of ['/', '/todo', '/about', '/user/:name', '/ws', '/transition']) {
  app.get(p, async (req: Request, ctx: Context): Promise<Response> => ctx.ui.html`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="stylesheet" href="/static/style.css">
      <title>weifuwu demo</title>

    </head>
    <body class="bg-gray-100">
      <div id="root"></div>
      <script src="/static/app.js"></script>
    </body>
    </html>
  `)
}

serve(app, { port: 3000 })
console.log('http://localhost:3000')

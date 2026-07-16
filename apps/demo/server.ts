/**
 * demo server — weifuwu 后端 serve 前端 SPA
 *
 * ```bash
 * cd weifuwu && node apps/demo/server.ts
 * open http://localhost:3000
 * ```
 *
 * 客户端 bundle 由 ctx.ui.render() 编译，无需单独构建步骤。
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { WebSocketHandler, WebSocket, Context } from 'weifuwu'
import { serve, Router, serveStatic, cors, logger, ui } from 'weifuwu'
import { html } from 'weifuwu/server'

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = new Router()
app.use(cors())
app.use(logger())

// 注入 ctx.ui.render() 动态编译客户端 TSX
app.use(ui())

// 客户端 JS bundle — 动态编译，无需单独构建
app.get('/static/app.js', async (req, ctx) => {
  const js = await ctx.ui.render(resolve(__dirname, 'src', 'main.tsx'))
  return new Response(js, {
    headers: { 'Content-Type': 'application/javascript' },
  })
})

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

// HTML 页面骨架
const skeleton = readFileSync(resolve(__dirname, 'public', 'index.html'), 'utf-8')

function page(body: string, opts: { title?: string; script?: string; props?: Record<string, unknown> } = {}): Response {
  const title = opts.title ?? 'weifuwu'
  const script = opts.script ?? '/static/app.js'
  const propsTag = opts.props
    ? html`<script>window.__WFUI_PROPS__=${html.unsafe(JSON.stringify(opts.props))}</script>`
    : ''

  const doc = skeleton
    .replace('{{title}}', title.replace(/&/g, '&amp;').replace(/</g, '&lt;'))
    .replace('{{ssr}}', body)
    .replace('{{props}}', String(propsTag))
    .replace('{{script}}', script.replace(/&/g, '&amp;').replace(/</g, '&lt;'))

  return new Response(doc, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

// SSR 博客页面
const blogPost = {
  slug: 'hello-ssr',
  title: 'SSR 与 weifuwu',
  body: '<p>这是服务端渲染的段落。</p><blockquote>搜索引擎可以看到这段内容。</blockquote><p>而 <strong>点赞按钮</strong> 由客户端 hydrate 接管。</p>',
  author_name: 'weifuwu 团队',
  published_at: new Date('2025-07-16'),
}

app.get('/blog/:slug', async (req: Request, ctx: Context): Promise<Response> => {
  const content = html`
    <article class="blog-post" style="background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.08);max-width:600px;margin:0 auto">
      <h1 style="font-size:24px;margin-bottom:8px">${blogPost.title}</h1>
      <div class="meta" style="color:#999;font-size:14px;margin-bottom:20px">
        ${blogPost.author_name} · ${blogPost.published_at.toLocaleDateString()}
      </div>
      <div class="body" style="line-height:1.8;font-size:16px">${html.unsafe(blogPost.body)}</div>
      <div data-hydrate="like" style="margin-top:24px;padding-top:20px;border-top:1px solid #eee">
        <p style="color:#666;font-size:14px;margin-bottom:8px">这个对你有帮助吗？</p>
      </div>
    </article>
  `

  return page(String(content), { title: blogPost.title, props: { post: blogPost } })
})

// SPA 入口页面
for (const p of ['/', '/todo', '/about', '/user/:name', '/ws']) {
  app.get(p, async (req: Request, ctx: Context): Promise<Response> => page(''))
}

serve(app, { port: 3000 })
console.log('http://localhost:3000')

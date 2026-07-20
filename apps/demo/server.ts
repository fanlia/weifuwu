/**
 * demo server — weifuwu 后端 serve 前端 SPA + 演示 API
 */

import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { WebSocketHandler, WebSocket, Context } from 'weifuwu'
import { serve, Router, cors, ui } from 'weifuwu'

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = new Router()
app.use(cors())
app.use(ui())

// ── 静态资源 ─────────────────────────────────────────────

// 客户端 JS bundle — 动态编译（开发模式，无需构建步骤）
app.get('/static/app.js', async (req, ctx) => ctx.ui.js(resolve(__dirname, 'src', 'main.tsx')))

// 客户端 CSS
app.get('/static/style.css', async (req, ctx) => ctx.ui.css(resolve(__dirname, 'public', 'style.css')))

// ── 演示 API ─────────────────────────────────────────────

// 文章列表（用于 createResource 演示）
const posts = [
  { id: 1, title: 'weifuwu 初探', body: 'weifuwu 是一个轻量级全栈框架，用信号驱动 UI，无需虚拟 DOM。', author: 'Alice', date: '2025-07-15' },
  { id: 2, title: '信号 vs useState', body: 'signal 是细粒度的响应式原语。相比 useState，signal 不需要 VDOM diff，直接更新 DOM。', author: 'Bob', date: '2025-07-16' },
  { id: 3, title: '嵌套布局实战', body: '使用 RouteDef.layout + Outlet 实现持久化布局，侧边栏等组件在子路由切换时保持挂载。', author: 'Charlie', date: '2025-07-17' },
  { id: 4, title: '表单处理最佳实践', body: 'useForm 提供字段绑定、验证规则、提交状态管理，减少模板代码。', author: 'Diana', date: '2025-07-18' },
]

app.get('/api/posts', async (req: Request, ctx: Context): Promise<Response> => {
  // 模拟网络延迟
  await new Promise(r => setTimeout(r, 500))
  return Response.json(posts)
})

// 登录（用于 auth() + api() 演示）
app.post('/api/login', async (req: Request, ctx: Context): Promise<Response> => {
  const body = await req.json() as { email: string; password: string }
  const { email } = body

  if (!email) {
    return Response.json({ error: '请输入邮箱' }, { status: 400 })
  }

  // 模拟登录：接受任意非空邮箱
  return Response.json({
    token: 'demo_jwt_' + Math.random().toString(36).slice(2),
    user: {
      id: 1,
      name: email.split('@')[0],
      email,
    },
  })
})

// 注册（用于 useForm 演示）
app.post('/api/register', async (req: Request, ctx: Context): Promise<Response> => {
  const body = await req.json() as { username: string; email: string }
  await new Promise(r => setTimeout(r, 800))

  return Response.json({
    id: Date.now(),
    username: body.username,
    email: body.email,
    message: '注册成功',
  })
})

// 当前用户
app.get('/api/user', async (req: Request, ctx: Context): Promise<Response> => {
  const auth = req.headers.get('authorization')
  if (!auth || !auth.startsWith('Bearer ')) {
    return Response.json({ error: '未登录' }, { status: 401 })
  }
  return Response.json({
    id: 1,
    name: 'Demo User',
    email: 'demo@example.com',
  })
})

// ── WebSocket ────────────────────────────────────────────

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

// ── SSR 博客页面 ─────────────────────────────────────────

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

// ── SPA 入口页面 ─────────────────────────────────────────

const spaPaths = [
  '/', '/todo', '/forms', '/data',
  '/dashboard/overview', '/dashboard/settings',
  '/auth', '/ws', '/about', '/user/:name',
]

for (const p of spaPaths) {
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

/**
 * demo server — weifuwu 后端 serve 前端 SPA + 演示 API
 */

import type { WebSocketHandler, WebSocket, Context } from 'weifuwu'
import { serve, Router, cors, ui, ai } from 'weifuwu'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { uiSsr } from 'weifuwu'
import { routes } from './src/routes.tsx'
import { demoAi } from './src/ai-demo.ts'

// 以 server.ts 自身位置为基准解析路径（不受启动时 CWD 影响）
const demoRoot = dirname(fileURLToPath(import.meta.url))

const app = new Router()
app.use(cors())
app.use(ui())

// ── AI：有 DEEPSEEK_API_KEY 用真实 DeepSeek，否则内置确定性 wire-fake ──
const aiModule = await demoAi()
app.use(aiModule)

// ── 静态资源 ─────────────────────────────────────────────

// 客户端 JS bundle — 动态编译（开发模式，无需构建步骤）

// SPA 入口
app.get('/static/app.js', (req, ctx) => ctx.ui.js(join(demoRoot, 'src/main.tsx')))

// 博客页 hydration 入口（SSR HTML + __DATA__ → 客户端收养接管交互）
app.get('/static/blog.js', (req, ctx) => ctx.ui.js(join(demoRoot, 'src/blog-hydrate.ts')))

// 客户端 CSS
app.get('/static/style.css', (req, ctx) => ctx.ui.css(join(demoRoot, 'public/style.css')))

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

// ── AI 对话（wf: 协议：ctx.ai.stream → SSE → 前端 aiStream）────
app.post('/api/chat', async (req: Request, ctx: Context): Promise<Response> => {
  const { messages, mode } = await req.json()
  // 流式对话 / agent 工具循环统一入口（useChat demo：body 携带 mode）
  if (mode === 'agent') {
    return createDemoAgent(ctx).run(messages, {
      signal: req.signal,
      traceId: req.headers.get('x-trace-id') ?? undefined,
    })
  }
  return ctx.ai!.stream({ messages }, {
    signal: req.signal,                                    // 断开即取消 provider 请求
    traceId: req.headers.get('x-trace-id') ?? undefined,   // 追踪关联：message_start.id
  })
})

// ── AI agent（工具循环 + HITL 审批）────────────────────────
const weatherTool = {
  name: 'query_weather',
  description: '查询城市天气',
  parameters: {
    type: 'object',
    properties: { city: { type: 'string', description: '城市名' } },
    required: ['city'],
  },
  run: async (args: Record<string, unknown>, tool: { emit: (n: string, d: unknown) => void }) => {
    const city = String(args.city ?? '')
    tool.emit('wf:tool_progress', { toolCallId: 'x', step: 1, total: 2, message: `查询 ${city}…`, status: 'running' })
    await new Promise((r) => setTimeout(r, 300))  // 模拟耗时
    const temps: Record<string, number> = { 北京: 25, 上海: 28, 深圳: 30, 广州: 31 }
    return { city, temp: temps[city] ?? 22, desc: '晴' }
  },
}

function createDemoAgent(ctx: Context) {
  return ctx.ai!.agent({
    systemPrompt: '你是助手。查询天气时调用 query_weather 工具。',
    tools: [weatherTool],
    humanInTheLoop: true,                                  // 每个工具执行前要审批
  })
}

app.post('/api/agent', async (req: Request, ctx: Context): Promise<Response> => {
  const { messages } = await req.json()
  const agent = createDemoAgent(ctx)
  return agent.run(messages, {
    signal: req.signal,
    traceId: req.headers.get('x-trace-id') ?? undefined,
  })
})

// HITL 审批响应（协议 §4.5：POST 上行，ctx.user 审计由 app 中间件负责）
app.post('/api/approve', async (req: Request, ctx: Context): Promise<Response> => {
  const body = await req.json()
  const accepted = ctx.ai!.approve(body)
  if (!accepted) return Response.json({ error: '审批不存在或已过期' }, { status: 404 })
  return Response.json({ ok: true })
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

// ── SSR 页面（路由级自动渲染）────────────────────────────────
// uiSsr({ routes })：GET 匹配 routes → 注入 ctx.route.params → await 组件工厂
// → 完整 HTML + __DATA__ + bundle——手写 handler/模板/序列化的碎片全部消除
app.use(uiSsr({ routes, bundle: '/static/blog.js', styles: ['/static/style.css'] }))

// ── SPA 入口页面 ─────────────────────────────────────────

const spaPaths = [
  '/', '/todo', '/forms', '/data',
  '/dashboard/overview', '/dashboard/settings',
  '/auth', '/ws', '/about', '/user/:name',
]

// SPA 外壳 — 客户端路由接管渲染（含未匹配路径，由客户端 404 页处理）
const spaShell = async (req: Request, ctx: Context): Promise<Response> => ctx.ui.html`
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
`

for (const p of spaPaths) {
  app.get(p, spaShell)
}

// SPA 回退：未匹配的 GET 路径同样返回外壳，深链接/刷新时由客户端路由展示 404 页
app.get('*', spaShell)

serve(app, { port: 3000 })
console.log('http://localhost:3000')
